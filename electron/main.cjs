/**
 * Electron main process.
 *
 * Written in plain CommonJS so it can run with no build step. The
 * renderer uses a normal Vite + React TS pipeline; only this file and
 * `preload.cjs` execute in the Node.js side of Electron.
 *
 * Responsibilities:
 *  - Create the main window (and an optional floating mini window).
 *  - Set up a system tray with quick toggles.
 *  - Spin up activity sources (file watcher + JSONL log tailer) and
 *    forward their events to the renderer via IPC.
 *
 * Activity tracking design: see docs/ARCHITECTURE.md. We chose an
 * out-of-process integration model: any AI agent (Codex, Aider, etc.)
 * can publish events by appending newline-delimited JSON to
 * `~/.jarvis/activity.jsonl`. This keeps Jarvis honest about its
 * trust boundary: even when Jarvis launches Codex, it only observes the public
 * JSONL event stream and never touches model internals or credentials.
 */

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const readline = require("node:readline");
const { spawn, spawnSync } = require("node:child_process");
const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog, nativeTheme, clipboard } = require("electron");
const { spawnCodex } = require("../scripts/codex-launcher.cjs");
const { mapCodexEventToActivityEvents } = require("../scripts/codex-to-jarvis.cjs");

const isDev = process.env.NODE_ENV === "development";
const DEV_URL = process.env.JARVIS_DEV_URL || "http://localhost:5173";
const RENDERER_DIST = path.join(__dirname, "..", "dist", "index.html");
const ACTIVITY_LOG = process.env.JARVIS_LOG || path.join(os.homedir(), ".jarvis", "activity.jsonl");
const WINDOWS_ROOT = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
const CMD_EXE = process.env.ComSpec || path.join(WINDOWS_ROOT, "System32", "cmd.exe");
const WHERE_EXE = path.join(WINDOWS_ROOT, "System32", "where.exe");
const ACTIVITY_KINDS = new Set([
  "plan",
  "think",
  "read",
  "edit",
  "command",
  "test",
  "debug",
  "ship",
  "success",
  "error",
  "idle",
]);

let mainWindow = null;
let floatingWindow = null;
let tray = null;
let codexChild = null;
const sources = [];

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 880,
    minHeight: 560,
    backgroundColor: "#0b0d12",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(RENDERER_DIST);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createFloatingWindow() {
  if (floatingWindow) {
    floatingWindow.show();
    floatingWindow.focus();
    return;
  }
  floatingWindow = new BrowserWindow({
    width: 320,
    height: 220,
    backgroundColor: "#00000000",
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  floatingWindow.setAlwaysOnTop(true, "floating");
  if (isDev) {
    floatingWindow.loadURL(`${DEV_URL}?floating=1`);
  } else {
    floatingWindow.loadFile(RENDERER_DIST, { search: "floating=1" });
  }
  floatingWindow.on("closed", () => {
    floatingWindow = null;
  });
}

function createTray() {
  // Create a simple, valid 16x16 colored PNG so the tray icon is real
  // even without bundled assets.
  const icon = nativeImage.createFromBuffer(buildTrayIconPng());
  tray = new Tray(icon);
  tray.setToolTip("Jarvis — AI Workspace");
  rebuildTrayMenu("idle");
  tray.on("click", () => {
    if (!mainWindow) {
      createMainWindow();
    } else if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });
}

function rebuildTrayMenu(state) {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    { label: `Jarvis — ${state}`, enabled: false },
    { type: "separator" },
    { label: "Show main window", click: () => mainWindow?.show() },
    {
      label: "Toggle floating mode",
      click: () => {
        if (floatingWindow) {
          floatingWindow.close();
        } else {
          createFloatingWindow();
        }
      },
    },
    { type: "separator" },
    { label: "Quit", role: "quit" },
  ]);
  tray.setContextMenu(menu);
}

function buildTrayIconPng() {
  // 16x16 PNG, accent purple. Hand-built buffer = no asset pipeline.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAR0lEQVR4nGNkYGD4z0AB" +
      "YBxVMKpgVMHwUcDIyMjIwMjAyMDIwMjAyMDIwMDIwMjAyMDIwMjAyMDIwMjAyMDIwMjA" +
      "yMDIwMgAAFJUBQE6NlGYAAAAAElFTkSuQmCC",
    "base64",
  );
  return png;
}

function normalizeActivityEvent(event) {
  if (!event || typeof event !== "object" || !ACTIVITY_KINDS.has(event.kind)) {
    return null;
  }

  return {
    id:
      typeof event.id === "string"
        ? event.id
        : `ipc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp:
      typeof event.timestamp === "number" && Number.isFinite(event.timestamp)
        ? event.timestamp
        : Date.now(),
    kind: event.kind,
    message: typeof event.message === "string" ? event.message : `${event.kind} event`,
    path: typeof event.path === "string" ? event.path : undefined,
    command: typeof event.command === "string" ? event.command : undefined,
    source: typeof event.source === "string" ? event.source : "ipc",
    detail: event.detail && typeof event.detail === "object" ? event.detail : undefined,
  };
}

function broadcast(rawEvent) {
  const event = normalizeActivityEvent(rawEvent);
  if (!event) {
    console.warn("[jarvis] skipping invalid activity event");
    return false;
  }

  for (const win of [mainWindow, floatingWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("jarvis:activity", event);
    }
  }
  if (tray) rebuildTrayMenu(event.kind);
  return true;
}

function broadcastAgentStatus(status) {
  for (const win of [mainWindow, floatingWindow]) {
    if (win && !win.isDestroyed()) {
      win.webContents.send("jarvis:agent-status", status);
      if (!status.provider || status.provider === "codex") {
        win.webContents.send("jarvis:codex-status", status);
      }
    }
  }
}

function isInsideGitRepo(cwd) {
  let current = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function coerceReasoningEffort(value) {
  return ["low", "medium", "high", "xhigh"].includes(value) ? value : "medium";
}

function coerceCodexSpeed(value) {
  return value === "fast" ? "fast" : "standard";
}

function coerceCodexModel(value) {
  return ["gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5.2"].includes(value) ? value : "gpt-5.5";
}

function coerceProvider(value) {
  return value === "windsurf" ? "windsurf" : "codex";
}

function withoutWrappingQuotes(value) {
  return value.replace(/^"|"$/g, "");
}

function isPathLike(candidate) {
  return candidate.includes("\\") || candidate.includes("/") || path.isAbsolute(candidate);
}

function isFile(candidate) {
  try {
    return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  } catch {
    return false;
  }
}

function isWindowsShellScript(candidate) {
  return /\.(cmd|bat)$/i.test(candidate);
}

function needsWindowsShell(candidate) {
  return process.platform === "win32" && (isWindowsShellScript(candidate) || !/\.exe$/i.test(candidate));
}

function quoteCmdArg(value) {
  return `"${String(value).replace(/(["^&|<>()%!])/g, "^$1")}"`;
}

function whereCommandCandidates(name) {
  if (process.platform !== "win32") return [];
  const result = spawnSync(WHERE_EXE, [name], {
    encoding: "utf8",
    timeout: 4000,
    windowsHide: true,
  });
  if (result.error || result.status !== 0) return [];
  return result.stdout
    .split(/\r?\n/)
    .map((line) => withoutWrappingQuotes(line.trim()))
    .filter(Boolean);
}

function resolveWindsurfBinary() {
  const override = process.env.JARVIS_WINDSURF_BIN || process.env.WINDSURF_BIN;
  if (override) {
    const command = withoutWrappingQuotes(override.trim());
    return {
      command,
      source: "env",
      missing: Boolean(isPathLike(command) && !isFile(command)),
      viaShell: needsWindowsShell(command),
    };
  }

  if (process.platform !== "win32") {
    return {
      command: "windsurf",
      source: "path",
      missing: false,
      viaShell: false,
    };
  }

  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const candidates = [
    ...whereCommandCandidates("windsurf"),
    path.join(localAppData, "Programs", "Windsurf", "bin", "windsurf.cmd"),
    path.join(localAppData, "Programs", "Windsurf", "Windsurf.exe"),
  ];
  const seen = new Set();
  for (const candidate of candidates) {
    const command = withoutWrappingQuotes(candidate.trim());
    const key = command.toLowerCase();
    if (!command || seen.has(key)) continue;
    seen.add(key);
    if (isFile(command)) {
      return {
        command,
        source: "auto",
        missing: false,
        viaShell: needsWindowsShell(command),
      };
    }
  }

  return {
    command: "windsurf",
    source: "missing",
    missing: true,
    viaShell: true,
  };
}

function spawnWindsurf(args, options = {}) {
  const resolved = resolveWindsurfBinary();
  if (resolved.missing) {
    const hint =
      resolved.source === "env"
        ? `Could not find Windsurf at ${resolved.command}. Check JARVIS_WINDSURF_BIN or WINDSURF_BIN.`
        : "Could not find the Windsurf CLI from Jarvis. Install Windsurf, launch Jarvis from a terminal where `windsurf --help` works, or set JARVIS_WINDSURF_BIN.";
    const err = new Error(hint);
    err.code = "WINDSURF_NOT_FOUND";
    err.resolution = resolved;
    throw err;
  }

  if (process.platform === "win32" && resolved.viaShell) {
    const commandPrefix = isWindowsShellScript(resolved.command) ? "call " : "";
    const command = `${commandPrefix}${[resolved.command, ...args].map(quoteCmdArg).join(" ")}`;
    return {
      child: spawn(CMD_EXE, ["/d", "/c", command], {
        cwd: options.cwd,
        stdio: options.stdio || "ignore",
        detached: Boolean(options.detached),
        shell: false,
        windowsVerbatimArguments: true,
        windowsHide: true,
      }),
      resolved,
    };
  }

  return {
    child: spawn(resolved.command, args, {
      cwd: options.cwd,
      stdio: options.stdio || "ignore",
      detached: Boolean(options.detached),
      shell: false,
      windowsHide: process.platform === "win32",
    }),
    resolved,
  };
}

function createWrapperError(message, detail = {}) {
  return {
    id: `codex-ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    kind: "error",
    message,
    source: detail.provider === "windsurf" ? "windsurf" : "codex",
    detail,
  };
}

function validateAgentRequest(request, provider) {
  const prompt = typeof request?.prompt === "string" ? request.prompt.trim() : "";
  const workspace = typeof request?.workspace === "string" ? request.workspace.trim() : "";

  if (!prompt) return { ok: false, error: `Enter a ${provider === "windsurf" ? "Windsurf" : "Codex"} task first.` };
  if (!workspace || !fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) {
    return { ok: false, error: "Choose a valid workspace folder." };
  }

  return { ok: true, prompt, workspace };
}

function runWindsurfFromApp(request) {
  const validation = validateAgentRequest(request, "windsurf");
  if (!validation.ok) return validation;

  const { prompt, workspace } = validation;
  clipboard.writeText(prompt);

  let child;
  let resolution = null;
  try {
    const result = spawnWindsurf(["--reuse-window", workspace], {
      cwd: workspace,
      detached: true,
      stdio: "ignore",
    });
    child = result.child;
    resolution = result.resolved;
  } catch (err) {
    const message = `Failed to open Windsurf: ${err.message}`;
    broadcast(createWrapperError(message, { provider: "windsurf", windsurfWrapper: true }));
    return { ok: false, error: message };
  }

  broadcast({
    id: `windsurf-ui-start-${Date.now().toString(36)}`,
    timestamp: Date.now(),
    kind: "command",
    message: `Opening Windsurf in ${path.basename(workspace)}`,
    path: workspace,
    command: "windsurf --reuse-window",
    source: "windsurf",
    detail: { provider: "windsurf", windsurfBinary: resolution?.command, promptCopied: true },
  });
  broadcastAgentStatus({
    running: false,
    exitCode: 0,
    provider: "windsurf",
    workspace,
    message: "Windsurf opened; task copied to clipboard.",
  });

  child.on("error", (err) => {
    broadcast(createWrapperError(`Failed to open Windsurf: ${err.message}`, { provider: "windsurf", windsurfWrapper: true }));
    broadcastAgentStatus({ running: false, exitCode: 1, provider: "windsurf" });
  });
  child.unref();

  return { ok: true, message: "Windsurf opened; task copied to clipboard." };
}

function runCodexFromApp(request) {
  if (codexChild) {
    return { ok: false, error: "Codex is already running." };
  }

  const validation = validateAgentRequest(request, "codex");
  if (!validation.ok) return validation;

  const { prompt, workspace } = validation;
  const model = coerceCodexModel(request?.model);
  const reasoningEffort = coerceReasoningEffort(request?.reasoningEffort);
  const speed = coerceCodexSpeed(request?.speed);

  const codexArgs = [
    "exec",
    "--json",
    "--model",
    model,
    "--sandbox",
    "workspace-write",
    "-C",
    workspace,
    "-c",
    `model_reasoning_effort='${reasoningEffort}'`,
    "-c",
    `features.fast_mode=${speed === "fast" ? "true" : "false"}`,
  ];

  if (speed === "fast") {
    codexArgs.push("-c", "service_tier='fast'");
  }

  if (!isInsideGitRepo(workspace)) {
    codexArgs.push("--skip-git-repo-check");
  }

  codexArgs.push(prompt);

  let child;
  let codexResolution = null;
  try {
    const result = spawnCodex(codexArgs, {
      cwd: workspace,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child = result.child;
    codexResolution = result.resolved;
  } catch (err) {
    const message = `Failed to start Codex: ${err.message}`;
    broadcast(createWrapperError(message, { codexWrapper: true }));
    return { ok: false, error: message };
  }

  codexChild = child;
  let sawMappedError = false;
  let stderrTail = "";
  broadcast({
    id: `codex-ui-start-${Date.now().toString(36)}`,
    timestamp: Date.now(),
    kind: "command",
    message: `Launching Codex in ${path.basename(workspace)}`,
    path: workspace,
    command:
      speed === "fast"
        ? `codex exec --json --model ${model} --sandbox workspace-write -c service_tier='fast'`
        : `codex exec --json --model ${model} --sandbox workspace-write`,
    source: "codex",
    detail: { provider: "codex", codexBinary: codexResolution?.command, model, reasoningEffort, sandbox: "workspace-write", speed },
  });
  broadcastAgentStatus({ running: true, provider: "codex", workspace, model, reasoningEffort, speed });

  const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    try {
      const events = mapCodexEventToActivityEvents(JSON.parse(line));
      for (const event of events) {
        if (event.kind === "error") sawMappedError = true;
        broadcast(event);
      }
    } catch (err) {
      console.warn("[jarvis] skipping malformed Codex JSONL:", err.message);
    }
  });

  child.stderr.on("data", (chunk) => {
    stderrTail = `${stderrTail}${chunk.toString("utf8")}`.slice(-1200);
  });

  child.on("error", (err) => {
    sawMappedError = true;
    codexChild = null;
    broadcast(createWrapperError(`Failed to start Codex: ${err.message}`, { codexWrapper: true }));
    broadcastAgentStatus({ running: false, provider: "codex", exitCode: 1 });
  });

  child.on("close", (code) => {
    codexChild = null;
    if (code && !sawMappedError) {
      const message = stderrTail.trim() || `Codex exited with code ${code}`;
      broadcast(createWrapperError(message, { codexWrapper: true, exitCode: code }));
    }
    broadcastAgentStatus({ running: false, provider: "codex", exitCode: code ?? 0 });
  });

  return { ok: true };
}

function runAgentFromApp(request) {
  const provider = coerceProvider(request?.provider);
  if (provider === "windsurf") return runWindsurfFromApp(request);
  return runCodexFromApp(request);
}

async function startActivitySources() {
  const { startLogTailer } = require("./logTailer.cjs");
  fs.mkdirSync(path.dirname(ACTIVITY_LOG), { recursive: true });
  if (!fs.existsSync(ACTIVITY_LOG)) fs.writeFileSync(ACTIVITY_LOG, "");
  const stop = startLogTailer(ACTIVITY_LOG, (event) => broadcast(event));
  sources.push(stop);
}

function stopActivitySources() {
  while (sources.length) {
    const stop = sources.pop();
    try {
      stop?.();
    } catch (err) {
      console.error("Failed to stop activity source:", err);
    }
  }
}

ipcMain.handle("jarvis:emit", (_evt, event) => {
  return broadcast(event);
});

ipcMain.handle("jarvis:select-workspace", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "Choose agent workspace",
    properties: ["openDirectory"],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle("jarvis:agent-run", (_evt, request) => runAgentFromApp(request));
ipcMain.handle("jarvis:codex-run", (_evt, request) => runCodexFromApp(request));

app.whenReady().then(async () => {
  nativeTheme.themeSource = "dark";
  createMainWindow();
  createTray();
  await startActivitySources();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    stopActivitySources();
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});

app.on("before-quit", () => stopActivitySources());

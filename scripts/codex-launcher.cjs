const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const WINDOWS_CODEX_NAMES = ["codex.exe", "codex.cmd", "codex.bat"];
const WINDOWS_ROOT = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
const CMD_EXE = process.env.ComSpec || path.join(WINDOWS_ROOT, "System32", "cmd.exe");
const POWERSHELL_EXE = path.join(WINDOWS_ROOT, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const WHERE_EXE = path.join(WINDOWS_ROOT, "System32", "where.exe");

function withoutWrappingQuotes(value) {
  return value.replace(/^"|"$/g, "");
}

function pushUnique(candidates, candidate) {
  if (!candidate || typeof candidate !== "string") return;
  const normalized = withoutWrappingQuotes(candidate.trim());
  if (!normalized) return;
  const lower = normalized.toLowerCase();
  if (candidates.some((item) => item.toLowerCase() === lower)) return;
  candidates.push(normalized);
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
  return isWindowsShellScript(candidate) || !/\.exe$/i.test(candidate);
}

function isAppExecutionAliasPath(candidate) {
  return candidate.toLowerCase().includes("\\appdata\\local\\microsoft\\windowsapps\\");
}

function isWindowsAppsPackagePath(candidate) {
  return candidate.toLowerCase().includes("\\program files\\windowsapps\\openai.codex_");
}

function candidateRank(candidate) {
  if (isWindowsShellScript(candidate)) return 0;
  if (isAppExecutionAliasPath(candidate) && /\.exe$/i.test(candidate)) return 1;
  if (/\.exe$/i.test(candidate) && !isWindowsAppsPackagePath(candidate)) return 2;
  if (/\.exe$/i.test(candidate)) return 3;
  return 4;
}

function isPathLike(candidate) {
  return candidate.includes("\\") || candidate.includes("/") || path.isAbsolute(candidate);
}

function whereCandidates() {
  const candidates = [];
  for (const name of ["codex", "codex.exe"]) {
    const result = spawnSync(WHERE_EXE, [name], {
      encoding: "utf8",
      timeout: 4000,
      windowsHide: true,
    });
    if (!result.error && result.status === 0) {
      for (const line of result.stdout.split(/\r?\n/)) pushUnique(candidates, line);
    }
  }
  return candidates;
}

function pathCandidates() {
  const candidates = [];
  const pathValue = process.env.PATH || process.env.Path || "";
  for (const entry of pathValue.split(path.delimiter)) {
    const folder = withoutWrappingQuotes(entry.trim());
    if (!folder) continue;
    for (const name of WINDOWS_CODEX_NAMES) {
      const candidate = path.join(folder, name);
      if (isFile(candidate)) pushUnique(candidates, candidate);
    }
  }
  return candidates;
}

function appExecutionAliasCandidates() {
  const candidates = [];
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const aliasRoot = path.join(localAppData, "Microsoft", "WindowsApps");
  for (const name of WINDOWS_CODEX_NAMES) pushUnique(candidates, path.join(aliasRoot, name));
  return candidates;
}

function npmShimCandidates() {
  const candidates = [];
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  const npmRoot = path.join(appData, "npm");
  for (const name of WINDOWS_CODEX_NAMES) pushUnique(candidates, path.join(npmRoot, name));
  return candidates;
}

function appxPackageCandidates() {
  const candidates = [];
  const command =
    "Get-AppxPackage -Name OpenAI.Codex -ErrorAction SilentlyContinue | " +
    "Select-Object -First 1 -ExpandProperty InstallLocation";
  const result = spawnSync(POWERSHELL_EXE, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command], {
    encoding: "utf8",
    timeout: 5000,
    windowsHide: true,
  });

  if (!result.error && result.status === 0) {
    for (const line of result.stdout.split(/\r?\n/)) {
      const installLocation = withoutWrappingQuotes(line.trim());
      if (!installLocation) continue;
      pushUnique(candidates, path.join(installLocation, "app", "resources", "codex.exe"));
      pushUnique(candidates, path.join(installLocation, "codex.exe"));
    }
  }

  return candidates;
}

function windowsAppsPackageCandidates() {
  const candidates = [];
  const root = path.join(process.env.ProgramFiles || "C:\\Program Files", "WindowsApps");
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^OpenAI\.Codex_/i.test(entry.name)) continue;
      const folder = path.join(root, entry.name);
      pushUnique(candidates, path.join(folder, "app", "resources", "codex.exe"));
      pushUnique(candidates, path.join(folder, "codex.exe"));
    }
  } catch {
    // WindowsApps often denies directory listing; AppX and PATH probes cover the normal cases.
  }
  return candidates;
}

function resolveWindowsCodexBinary() {
  const override = process.env.JARVIS_CODEX_BIN || process.env.CODEX_BIN;
  if (override) {
    return {
      command: withoutWrappingQuotes(override.trim()),
      source: "env",
      missing: false,
      viaShell: needsWindowsShell(override),
      searched: [override],
    };
  }

  const candidates = [
    ...whereCandidates(),
    ...pathCandidates(),
    ...npmShimCandidates(),
    ...appExecutionAliasCandidates(),
    ...appxPackageCandidates(),
    ...windowsAppsPackageCandidates(),
  ];

  for (const candidate of [...candidates].sort((a, b) => candidateRank(a) - candidateRank(b))) {
    if (isFile(candidate)) {
      return {
        command: candidate,
        source: "auto",
        missing: false,
        viaShell: needsWindowsShell(candidate),
        searched: candidates,
      };
    }
  }

  return {
    command: "codex",
    source: "missing",
    missing: true,
    viaShell: true,
    searched: candidates,
  };
}

function resolveCodexBinary() {
  if (process.platform === "win32") return resolveWindowsCodexBinary();

  const override = process.env.JARVIS_CODEX_BIN || process.env.CODEX_BIN;
  return {
    command: override ? withoutWrappingQuotes(override.trim()) : "codex",
    source: override ? "env" : "path",
    missing: Boolean(override && isPathLike(override) && !isFile(override)),
    viaShell: false,
    searched: override ? [override] : ["codex"],
  };
}

function quoteCmdArg(value) {
  return `"${String(value).replace(/(["^&|<>()%!])/g, "^$1")}"`;
}

function spawnCodex(codexArgs, options = {}) {
  const resolved = resolveCodexBinary();
  const cwd = options.cwd;
  const stdio = options.stdio || ["ignore", "pipe", "pipe"];

  if (resolved.missing) {
    const err = new Error(codexNotFoundMessage(resolved));
    err.code = "CODEX_NOT_FOUND";
    err.resolution = resolved;
    throw err;
  }

  if (process.platform === "win32" && resolved.viaShell) {
    const commandPrefix = isWindowsShellScript(resolved.command) ? "call " : "";
    const command = `${commandPrefix}${[resolved.command, ...codexArgs].map(quoteCmdArg).join(" ")}`;
    return {
      child: spawn(CMD_EXE, ["/d", "/c", command], {
        cwd,
        stdio,
        shell: false,
        windowsVerbatimArguments: true,
        windowsHide: true,
      }),
      resolved,
    };
  }

  return {
    child: spawn(resolved.command, codexArgs, {
      cwd,
      stdio,
      shell: false,
      windowsHide: process.platform === "win32",
    }),
    resolved,
  };
}

function codexNotFoundMessage(resolution = resolveCodexBinary()) {
  if (resolution.source === "env") {
    return `Could not find Codex at ${resolution.command}. Check JARVIS_CODEX_BIN or CODEX_BIN.`;
  }

  return (
    "Could not find the Codex CLI from Jarvis. Install/OpenAI Codex, launch Jarvis from a terminal " +
    "where `codex exec --help` works, or set JARVIS_CODEX_BIN to the full codex.exe path."
  );
}

module.exports = {
  codexNotFoundMessage,
  resolveCodexBinary,
  spawnCodex,
};

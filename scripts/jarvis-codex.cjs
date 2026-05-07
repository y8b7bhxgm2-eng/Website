#!/usr/bin/env node
/**
 * Run Codex non-interactively and mirror its JSONL activity into Jarvis.
 *
 * Usage:
 *   node scripts/jarvis-codex.cjs "fix the failing tests"
 *   npm run codex:jarvis -- "summarize this repo"
 */
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { appendActivityEvents, defaultLogPath, mapCodexEventToActivityEvents } = require("./codex-to-jarvis.cjs");
const { spawnCodex } = require("./codex-launcher.cjs");

const args = process.argv.slice(2);

if (args.length === 0 || args.includes("-h") || args.includes("--help")) {
  console.log("Usage: node scripts/jarvis-codex.cjs <codex exec args...>");
  console.log('Example: node scripts/jarvis-codex.cjs "fix the failing tests"');
  process.exit(args.length === 0 ? 1 : 0);
}

const codexArgs = ["exec", "--json", ...workspaceSandboxArgs(skipGitRepoCheckArgs(args))];
const logPath = defaultLogPath();
let sawMappedError = false;

function isInsideGitRepo(cwd = process.cwd()) {
  let current = path.resolve(cwd);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) return true;
    const parent = path.dirname(current);
    if (parent === current) return false;
    current = parent;
  }
}

function skipGitRepoCheckArgs(rawArgs) {
  if (rawArgs.includes("--skip-git-repo-check") || isInsideGitRepo()) {
    return rawArgs;
  }
  return ["--skip-git-repo-check", ...rawArgs];
}

function workspaceSandboxArgs(rawArgs) {
  if (
    rawArgs.includes("--sandbox") ||
    rawArgs.includes("-s") ||
    rawArgs.includes("--dangerously-bypass-approvals-and-sandbox")
  ) {
    return rawArgs;
  }
  return ["--sandbox", "workspace-write", ...rawArgs];
}

function emitJarvisError(message, detail = {}) {
  appendActivityEvents(
    [
      {
        id: `codex-wrapper-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        kind: "error",
        message,
        source: "codex",
        detail,
      },
    ],
    logPath,
  );
}

let child;
try {
  child = spawnCodex(codexArgs, { stdio: ["inherit", "pipe", "pipe"] }).child;
} catch (err) {
  emitJarvisError(`Failed to start Codex: ${err.message}`, { codexWrapper: true });
  process.stderr.write(`[jarvis] failed to start Codex: ${err.message}\n`);
  process.exit(1);
}

child.stderr.pipe(process.stderr);

const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
rl.on("line", (line) => {
  if (!line.trim()) return;
  process.stdout.write(`${line}\n`);
  try {
    const events = mapCodexEventToActivityEvents(JSON.parse(line));
    appendActivityEvents(events, logPath);
    for (const event of events) {
      if (event.kind === "error") sawMappedError = true;
      process.stderr.write(`[jarvis] ${event.kind}: ${event.message}\n`);
    }
  } catch (err) {
    process.stderr.write(`[jarvis] skipped malformed Codex JSONL: ${err.message}\n`);
  }
});

child.on("error", (err) => {
  process.stderr.write(`[jarvis] failed to start Codex: ${err.message}\n`);
  emitJarvisError(`Failed to start Codex: ${err.message}`, { codexWrapper: true });
  process.exitCode = 1;
});

child.on("close", (code) => {
  if (code && !sawMappedError) {
    emitJarvisError(`Codex exited with code ${code}`, { codexWrapper: true, exitCode: code });
  }
  process.exitCode = code ?? 0;
});

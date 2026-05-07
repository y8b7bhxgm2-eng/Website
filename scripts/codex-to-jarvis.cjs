#!/usr/bin/env node
/**
 * Convert `codex exec --json` JSONL into Jarvis ActivityEvent JSONL.
 *
 * Usage:
 *   codex exec --json "fix the bug" | node scripts/codex-to-jarvis.cjs
 *   codex exec --json "fix the bug" | node scripts/codex-to-jarvis.cjs --dry-run
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const readline = require("node:readline");

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

const TEST_CMD_RE =
  /\b(jest|vitest|pytest|mocha|cargo\s+test|go\s+test|npm\s+test|yarn\s+test|pnpm\s+test|npm\s+run\s+test)\b/i;
const SHIP_CMD_RE = /\b(git\s+(commit|push|tag)|gh\s+pr\s+create)\b/i;

function defaultLogPath() {
  return process.env.JARVIS_LOG || path.join(os.homedir(), ".jarvis", "activity.jsonl");
}

function normalizeEventName(raw) {
  if (typeof raw !== "string") return "";
  return raw.replaceAll("/", ".").replaceAll("_", ".").toLowerCase();
}

function normalizeItemType(raw) {
  if (typeof raw !== "string") return "";
  return raw.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`).replaceAll("-", "_").toLowerCase();
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function short(value, max = 140) {
  const s = text(value);
  return s.length > max ? `${s.slice(0, max - 1)}...` : s;
}

function eventId(prefix, raw) {
  const id = raw && typeof raw === "object" && typeof raw.id === "string" ? raw.id : undefined;
  return `${prefix}-${id || Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function activity(kind, message, now, detail = {}) {
  if (!ACTIVITY_KINDS.has(kind)) return [];
  const event = {
    id: eventId("codex", detail),
    timestamp: now,
    kind,
    message: short(message, 180),
    source: "codex",
  };

  if (typeof detail.path === "string") event.path = detail.path;
  if (typeof detail.command === "string") event.command = detail.command;
  event.detail = detail;
  return [event];
}

function kindForCommand(command, status) {
  if (status === "completed") return "success";
  if (status === "failed" || status === "declined") return "error";
  if (TEST_CMD_RE.test(command)) return "test";
  if (SHIP_CMD_RE.test(command)) return "ship";
  return "command";
}

function messageForCommand(command, status, exitCode) {
  if (status === "completed") return `Finished ${command}`;
  if (status === "failed" || status === "declined") {
    return exitCode == null ? `Failed ${command}` : `Failed ${command} (exit ${exitCode})`;
  }
  return `Running ${command}`;
}

function firstChangedPath(item) {
  const changes = Array.isArray(item.changes) ? item.changes : [];
  const first = changes.find((change) => change && typeof change.path === "string");
  return first ? first.path : undefined;
}

function currentPlanStep(plan) {
  if (!Array.isArray(plan)) return undefined;
  const inProgress = plan.find((step) => step && step.status === "inProgress");
  const pending = plan.find((step) => step && step.status === "pending");
  const completed = [...plan].reverse().find((step) => step && step.status === "completed");
  const step = inProgress || pending || completed;
  return step && typeof step.step === "string" ? step.step : undefined;
}

function mapItem(item, eventName, now, envelope) {
  if (!item || typeof item !== "object") return [];

  const itemType = normalizeItemType(item.type);
  const status = typeof item.status === "string" ? item.status : undefined;
  const detail = {
    codexEvent: eventName,
    codexItemType: item.type,
    id: item.id,
    threadId: envelope.thread_id || envelope.threadId,
    turnId: envelope.turn_id || envelope.turnId,
    status,
  };

  if (itemType === "command_execution") {
    const command = text(item.command, "command");
    const exitCode = typeof item.exitCode === "number" ? item.exitCode : undefined;
    return activity(kindForCommand(command, status), messageForCommand(command, status, exitCode), now, {
      ...detail,
      command,
      exitCode,
    });
  }

  if (itemType === "file_change") {
    const changedPath = firstChangedPath(item);
    const statusVerb = status === "completed" ? "Updated" : "Editing";
    return activity("edit", changedPath ? `${statusVerb} ${changedPath}` : "Editing files", now, {
      ...detail,
      path: changedPath,
      changeCount: Array.isArray(item.changes) ? item.changes.length : undefined,
    });
  }

  if (itemType === "mcp_tool_call" || itemType === "dynamic_tool_call") {
    const tool = text(item.tool, "tool");
    const server = text(item.server);
    const label = server ? `${server}.${tool}` : tool;
    const failed = status === "failed" || item.success === false || item.error;
    return activity(failed ? "error" : "command", `Using ${label}`, now, {
      ...detail,
      tool,
      server: server || undefined,
    });
  }

  if (itemType === "web_search") {
    return activity("read", `Searching ${short(item.query || "the web")}`, now, detail);
  }

  if (itemType === "plan") {
    return activity("plan", text(item.text, "Planning next steps"), now, detail);
  }

  if (itemType === "reasoning") {
    return activity("think", "Reasoning through the task", now, detail);
  }

  if (itemType === "agent_message" && item.text) {
    return activity("think", `Codex: ${item.text}`, now, detail);
  }

  return [];
}

function mapCodexEventToActivityEvents(event, now = Date.now()) {
  if (!event || typeof event !== "object") return [];

  const eventName = normalizeEventName(event.type || event.method);
  const params = event.params && typeof event.params === "object" ? event.params : {};
  const envelope = { ...event, ...params };

  if (eventName === "thread.started") {
    return activity("plan", "Codex thread started", now, {
      codexEvent: eventName,
      id: envelope.thread_id || envelope.threadId,
      threadId: envelope.thread_id || envelope.threadId,
    });
  }

  if (eventName === "turn.started") {
    return activity("think", "Codex started working", now, {
      codexEvent: eventName,
      id: envelope.turn_id || envelope.turnId || envelope.turn?.id,
      threadId: envelope.thread_id || envelope.threadId,
      turnId: envelope.turn_id || envelope.turnId || envelope.turn?.id,
    });
  }

  if (eventName === "turn.completed") {
    const turn = envelope.turn && typeof envelope.turn === "object" ? envelope.turn : {};
    const status = typeof turn.status === "string" ? turn.status : "completed";
    const failed = status === "failed" || status === "interrupted";
    const message =
      failed && turn.error && typeof turn.error.message === "string"
        ? `Codex turn failed: ${turn.error.message}`
        : "Codex turn completed";
    return activity(failed ? "error" : "success", message, now, {
      codexEvent: eventName,
      id: envelope.turn_id || envelope.turnId || turn.id,
      threadId: envelope.thread_id || envelope.threadId,
      turnId: envelope.turn_id || envelope.turnId || turn.id,
      status,
      usage: envelope.usage,
    });
  }

  if (eventName === "turn.failed" || eventName === "error") {
    const error = envelope.error && typeof envelope.error === "object" ? envelope.error : {};
    return activity("error", text(envelope.message || error.message, "Codex reported an error"), now, {
      codexEvent: eventName,
      id: envelope.turn_id || envelope.turnId,
      threadId: envelope.thread_id || envelope.threadId,
      turnId: envelope.turn_id || envelope.turnId,
    });
  }

  if (eventName === "turn.plan.updated") {
    const step = currentPlanStep(envelope.plan);
    return activity("plan", step ? `Planning: ${step}` : "Codex updated its plan", now, {
      codexEvent: eventName,
      id: envelope.turn_id || envelope.turnId,
      threadId: envelope.thread_id || envelope.threadId,
      turnId: envelope.turn_id || envelope.turnId,
      plan: envelope.plan,
    });
  }

  if (eventName === "turn.diff.updated") {
    return activity("edit", "Codex updated the working diff", now, {
      codexEvent: eventName,
      id: envelope.turn_id || envelope.turnId,
      threadId: envelope.thread_id || envelope.threadId,
      turnId: envelope.turn_id || envelope.turnId,
    });
  }

  if (eventName === "item.started" || eventName === "item.completed") {
    return mapItem(envelope.item, eventName, now, envelope);
  }

  if (eventName === "item.filechange.patchupdated" || eventName === "item.file.change.patchupdated") {
    const pathFromPatch = firstChangedPath(envelope);
    return activity("edit", pathFromPatch ? `Editing ${pathFromPatch}` : "Editing files", now, {
      codexEvent: eventName,
      id: envelope.itemId,
      threadId: envelope.threadId,
      turnId: envelope.turnId,
      path: pathFromPatch,
    });
  }

  return [];
}

function appendActivityEvents(events, logPath = defaultLogPath()) {
  if (!events.length) return;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, events.map((event) => JSON.stringify(event)).join("\n") + "\n");
}

function parseArgs(argv) {
  const options = { dryRun: false, logPath: defaultLogPath() };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "--log") {
      options.logPath = argv[++i];
    } else if (arg === "-h" || arg === "--help") {
      options.help = true;
    }
  }
  return options;
}

async function runCli() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: codex exec --json <prompt> | node scripts/codex-to-jarvis.cjs [--log PATH] [--dry-run]");
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      const events = mapCodexEventToActivityEvents(JSON.parse(line));
      if (options.dryRun) {
        for (const event of events) console.log(JSON.stringify(event));
      } else {
        appendActivityEvents(events, options.logPath);
      }
    } catch (err) {
      console.warn("[jarvis] skipping malformed Codex JSONL:", err.message);
    }
  }
}

if (require.main === module) {
  runCli().catch((err) => {
    console.error("[jarvis] Codex adapter failed:", err);
    process.exit(1);
  });
}

module.exports = {
  appendActivityEvents,
  defaultLogPath,
  mapCodexEventToActivityEvents,
};

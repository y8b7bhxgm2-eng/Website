import type { ActivityEvent, ActivityKind } from "@/types/activity";

/**
 * Heuristics that turn raw integration signals into ActivityEvents.
 *
 * These are intentionally simple regexes — they're meant to give the UI
 * something useful out of the box for common AI coding agent flows
 * (Codex, Aider, Cursor, Claude Code, plain `npm test`, etc.). They
 * are NOT a substitute for first-class structured events, which any
 * upstream integration is encouraged to emit directly via the JSONL
 * activity log (see docs/ARCHITECTURE.md).
 */

let counter = 0;
const nextId = () => `${Date.now().toString(36)}-${(counter++).toString(36)}`;

export interface FileChangeInput {
  kind: "fileChange";
  path: string;
  changeType: "add" | "change" | "unlink";
}

export interface CommandInput {
  kind: "command";
  command: string;
  exitCode?: number;
}

export interface LogLineInput {
  kind: "logLine";
  line: string;
  source?: string;
}

export type RawInput = FileChangeInput | CommandInput | LogLineInput;

const TEST_CMD_RE = /\b(jest|vitest|pytest|mocha|cargo\s+test|go\s+test|npm\s+test|yarn\s+test|pnpm\s+test|npm\s+run\s+test)\b/i;
const SHIP_CMD_RE = /\b(git\s+(commit|push|tag)|gh\s+pr\s+create)\b/i;
const ERROR_RE = /\b(error|failed|traceback|exception)\b/i;
const SUCCESS_RE = /\b(passed|success|✓|ok\b|build\s+succeeded)\b/i;

export function classify(input: RawInput, now = Date.now()): ActivityEvent {
  switch (input.kind) {
    case "fileChange": {
      const isRead = false; // chokidar can't tell reads from writes
      const kind: ActivityKind = isRead ? "read" : "edit";
      const verb =
        input.changeType === "add"
          ? "Created"
          : input.changeType === "unlink"
            ? "Deleted"
            : "Editing";
      return {
        id: nextId(),
        timestamp: now,
        kind,
        message: `${verb} ${input.path}`,
        path: input.path,
        source: "fileWatcher",
      };
    }
    case "command": {
      let kind: ActivityKind = "command";
      if (TEST_CMD_RE.test(input.command)) kind = "test";
      else if (SHIP_CMD_RE.test(input.command)) kind = "ship";
      if (input.exitCode != null) {
        kind = input.exitCode === 0 ? "success" : "error";
      }
      return {
        id: nextId(),
        timestamp: now,
        kind,
        message:
          input.exitCode == null
            ? `Running ${input.command}`
            : input.exitCode === 0
              ? `Finished ${input.command}`
              : `Failed ${input.command} (exit ${input.exitCode})`,
        command: input.command,
        source: "cli",
      };
    }
    case "logLine": {
      let kind: ActivityKind = "think";
      if (ERROR_RE.test(input.line)) kind = "error";
      else if (SUCCESS_RE.test(input.line)) kind = "success";
      else if (/\bread(ing)?\b/i.test(input.line)) kind = "read";
      else if (/\bedit(ing)?\b/i.test(input.line)) kind = "edit";
      else if (/\btest(ing)?\b/i.test(input.line)) kind = "test";
      else if (/\bdebug(ging)?\b/i.test(input.line)) kind = "debug";
      else if (/\bplan(ning)?\b/i.test(input.line)) kind = "plan";
      return {
        id: nextId(),
        timestamp: now,
        kind,
        message: input.line.slice(0, 140),
        source: input.source ?? "log",
      };
    }
  }
}

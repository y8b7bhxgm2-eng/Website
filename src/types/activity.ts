/**
 * Activity event data model.
 *
 * An ActivityEvent is the unit of input to the Jarvis state machine.
 * Events come from many possible sources (file watcher, log tailer,
 * CLI wrapper, mock emitter, IPC from external integrations) and are
 * normalized into this shape before being fed to the FSM.
 */

export const ACTIVITY_KINDS = [
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
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export type AgentState =
  | "idle"
  | "thinking"
  | "reading"
  | "editing"
  | "running"
  | "testing"
  | "debugging"
  | "shipping"
  | "success"
  | "error";

export type RoomId =
  | "planning"
  | "editor"
  | "terminal"
  | "lab"
  | "debug"
  | "shipping";

export interface ActivityEvent {
  /** Stable unique id (uuid or monotonic). */
  id: string;
  /** Epoch ms timestamp. */
  timestamp: number;
  /** Categorized kind of activity. */
  kind: ActivityKind;
  /** Short, human-readable description ("Reading src/App.tsx"). */
  message: string;
  /** Optional path of the file involved. */
  path?: string;
  /** Optional command string for command/test/debug events. */
  command?: string;
  /** Optional source identifier (which integration emitted it). */
  source?: string;
  /** Optional structured detail blob — kept loose by design. */
  detail?: Record<string, unknown>;
}

/** Outcome flag for terminal events. */
export type Outcome = "success" | "error" | undefined;

export function isActivityKind(kind: unknown): kind is ActivityKind {
  return typeof kind === "string" && (ACTIVITY_KINDS as readonly string[]).includes(kind);
}

export function isActivityEvent(value: unknown): value is ActivityEvent {
  if (!value || typeof value !== "object") return false;

  const event = value as Record<string, unknown>;
  return (
    typeof event.id === "string" &&
    typeof event.timestamp === "number" &&
    Number.isFinite(event.timestamp) &&
    isActivityKind(event.kind) &&
    typeof event.message === "string"
  );
}

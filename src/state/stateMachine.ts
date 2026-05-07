import {
  isActivityKind,
  type ActivityEvent,
  type ActivityKind,
  type AgentState,
  type RoomId,
} from "@/types/activity";

/**
 * Pure finite state machine for the Jarvis agent worker.
 *
 * The FSM maps an incoming ActivityEvent to a new AgentState. Some
 * transitions are "sticky" (success/error linger for a moment in the
 * UI), but the FSM itself is stateless — it's the caller's job to
 * schedule decay back to idle after a timeout.
 *
 * Keeping this pure makes it trivially testable and platform-agnostic
 * (no Electron / DOM imports here).
 */

const KIND_TO_STATE: Record<ActivityKind, AgentState> = {
  plan: "thinking",
  think: "thinking",
  read: "reading",
  edit: "editing",
  command: "running",
  test: "testing",
  debug: "debugging",
  ship: "shipping",
  success: "success",
  error: "error",
  idle: "idle",
};

const STATE_TO_ROOM: Record<AgentState, RoomId> = {
  idle: "planning",
  thinking: "planning",
  reading: "editor",
  editing: "editor",
  running: "terminal",
  testing: "lab",
  debugging: "debug",
  shipping: "shipping",
  success: "shipping",
  error: "debug",
};

/** Precedence used when multiple events race. Higher = wins. */
const STATE_PRECEDENCE: Record<AgentState, number> = {
  idle: 0,
  thinking: 1,
  reading: 2,
  editing: 3,
  running: 4,
  testing: 5,
  debugging: 7,
  shipping: 6,
  success: 8,
  error: 9,
};

export interface FsmContext {
  state: AgentState;
  room: RoomId;
  /** When did we enter `state`? Used by the UI for animation timing. */
  enteredAt: number;
  /** Last event that drove a transition. */
  lastEvent?: ActivityEvent;
}

export function initialContext(now = Date.now()): FsmContext {
  return { state: "idle", room: STATE_TO_ROOM.idle, enteredAt: now };
}

/**
 * Compute the next FSM context given the current one and an event.
 *
 * - If the event would not change state, we keep `enteredAt` stable so
 *   that the avatar doesn't restart its arrival animation on every
 *   bookkeeping event.
 * - Lower-precedence events do NOT clobber a higher-precedence state
 *   that's still "fresh" (within `freshnessMs`). For example: a "read"
 *   event arriving right after an "error" should not overwrite the
 *   error state instantly.
 */
export function transition(
  ctx: FsmContext,
  event: ActivityEvent,
  now: number = Date.now(),
  freshnessMs = 1500,
): FsmContext {
  if (!isActivityKind(event.kind)) return ctx;

  const nextState = KIND_TO_STATE[event.kind];
  const nextRoom = STATE_TO_ROOM[nextState];

  const currentFresh = now - ctx.enteredAt < freshnessMs;
  const currentRank = STATE_PRECEDENCE[ctx.state];
  const nextRank = STATE_PRECEDENCE[nextState];

  // Don't let a low-precedence event interrupt a fresh high-precedence one.
  if (currentFresh && nextRank < currentRank) {
    return { ...ctx, lastEvent: event };
  }

  if (nextState === ctx.state && nextRoom === ctx.room) {
    return { ...ctx, lastEvent: event };
  }

  return {
    state: nextState,
    room: nextRoom,
    enteredAt: now,
    lastEvent: event,
  };
}

/** Time after which the agent decays back to idle if no events arrive. */
export const IDLE_DECAY_MS = 8_000;

/** Helper used by the React store to drive an idle decay tick. */
export function decayIfStale(ctx: FsmContext, now: number = Date.now()): FsmContext {
  if (ctx.state === "idle") return ctx;
  if (now - ctx.enteredAt < IDLE_DECAY_MS) return ctx;
  return initialContext(now);
}

export const Rooms: Record<RoomId, { id: RoomId; label: string; description: string }> = {
  planning: {
    id: "planning",
    label: "Planning",
    description: "Where ideas get sketched and tasks get scoped.",
  },
  editor: {
    id: "editor",
    label: "Code Editor",
    description: "Reading and writing source files.",
  },
  terminal: {
    id: "terminal",
    label: "Terminal",
    description: "Running shell commands and build scripts.",
  },
  lab: {
    id: "lab",
    label: "Testing Lab",
    description: "Running test suites and validating behavior.",
  },
  debug: {
    id: "debug",
    label: "Debugging",
    description: "Investigating failures and red herrings.",
  },
  shipping: {
    id: "shipping",
    label: "Shipping",
    description: "Committing, pushing, and celebrating.",
  },
};

export const stateToRoom = STATE_TO_ROOM;
export const kindToState = KIND_TO_STATE;

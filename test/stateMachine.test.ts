import { describe, it, expect } from "vitest";
import {
  Rooms,
  decayIfStale,
  initialContext,
  kindToState,
  stateToRoom,
  transition,
} from "@/state/stateMachine";
import type { ActivityEvent, ActivityKind } from "@/types/activity";

let id = 0;
function ev(kind: ActivityKind, ts = 1_000_000): ActivityEvent {
  return { id: `${id++}`, timestamp: ts, kind, message: kind };
}

describe("stateMachine", () => {
  it("starts idle in the planning room", () => {
    const ctx = initialContext(0);
    expect(ctx.state).toBe("idle");
    expect(ctx.room).toBe("planning");
  });

  it("each ActivityKind maps to a known room with a label", () => {
    for (const kind of Object.keys(kindToState) as ActivityKind[]) {
      const state = kindToState[kind];
      const room = stateToRoom[state];
      expect(Rooms[room]).toBeDefined();
      expect(typeof Rooms[room].label).toBe("string");
    }
  });

  it("transitions reading -> editor", () => {
    const ctx = initialContext(0);
    const next = transition(ctx, ev("read"), 100);
    expect(next.state).toBe("reading");
    expect(next.room).toBe("editor");
    expect(next.enteredAt).toBe(100);
  });

  it("transitions test -> lab and debug -> debug room", () => {
    let ctx = initialContext(0);
    ctx = transition(ctx, ev("test"), 100);
    expect(ctx.room).toBe("lab");
    ctx = transition(ctx, ev("debug"), 200);
    expect(ctx.room).toBe("debug");
  });

  it("error has higher precedence than read while fresh", () => {
    let ctx = initialContext(0);
    ctx = transition(ctx, ev("error"), 1000);
    expect(ctx.state).toBe("error");
    // 200ms later, a "read" should NOT clobber the fresh error.
    ctx = transition(ctx, ev("read"), 1200);
    expect(ctx.state).toBe("error");
  });

  it("error is replaced by a newer high-precedence event after staleness", () => {
    let ctx = initialContext(0);
    ctx = transition(ctx, ev("error"), 1000);
    // Past freshness window — read can take over.
    ctx = transition(ctx, ev("read"), 5000);
    expect(ctx.state).toBe("reading");
  });

  it("does not bump enteredAt when state and room are unchanged", () => {
    let ctx = initialContext(0);
    ctx = transition(ctx, ev("read"), 1000);
    const enteredAt = ctx.enteredAt;
    ctx = transition(ctx, ev("read"), 1500);
    expect(ctx.enteredAt).toBe(enteredAt);
  });

  it("decayIfStale returns to idle after IDLE_DECAY_MS", () => {
    let ctx = initialContext(0);
    ctx = transition(ctx, ev("edit"), 1000);
    expect(decayIfStale(ctx, 2000).state).toBe(ctx.state);
    expect(decayIfStale(ctx, 1_000_000).state).toBe("idle");
  });

  it("success transitions to shipping room", () => {
    const ctx = transition(initialContext(0), ev("success"), 100);
    expect(ctx.room).toBe("shipping");
    expect(ctx.state).toBe("success");
  });

  it("ignores unknown event kinds at runtime", () => {
    const ctx = transition(initialContext(0), {
      id: "bad",
      timestamp: 100,
      kind: "unknown",
      message: "bad event",
    } as unknown as ActivityEvent);

    expect(ctx.state).toBe("idle");
    expect(ctx.room).toBe("planning");
  });
});

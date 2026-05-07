import { describe, it, expect, beforeEach } from "vitest";
import { useJarvisStore } from "@/state/store";
import type { ActivityEvent, ActivityKind } from "@/types/activity";

function send(kind: ActivityKind) {
  useJarvisStore.getState().ingest({
    id: `t-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: Date.now(),
    kind,
    message: `${kind} event`,
  });
}

describe("useJarvisStore", () => {
  beforeEach(() => {
    useJarvisStore.getState().reset();
  });

  it("ingests events into the feed in newest-first order", () => {
    send("read");
    send("edit");
    const feed = useJarvisStore.getState().feed;
    expect(feed[0].kind).toBe("edit");
    expect(feed[1].kind).toBe("read");
  });

  it("updates fsm state from ingested events", () => {
    send("test");
    expect(useJarvisStore.getState().fsm.state).toBe("testing");
    expect(useJarvisStore.getState().fsm.room).toBe("lab");
  });

  it("reset clears feed and returns to idle", () => {
    send("error");
    useJarvisStore.getState().reset();
    expect(useJarvisStore.getState().feed).toHaveLength(0);
    expect(useJarvisStore.getState().fsm.state).toBe("idle");
  });

  it("caps the feed at 200 entries", () => {
    for (let i = 0; i < 250; i++) send("think");
    expect(useJarvisStore.getState().feed.length).toBe(200);
  });

  it("ignores malformed runtime events", () => {
    useJarvisStore.getState().ingest({
      id: "bad",
      timestamp: Date.now(),
      kind: "unknown",
      message: "bad event",
    } as unknown as ActivityEvent);

    const state = useJarvisStore.getState();
    expect(state.feed).toHaveLength(0);
    expect(state.fsm.state).toBe("idle");
  });
});

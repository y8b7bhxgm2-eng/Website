import { describe, expect, it } from "vitest";
import { createRequire } from "node:module";
import type { ActivityEvent } from "@/types/activity";

const require = createRequire(import.meta.url);
const { mapCodexEventToActivityEvents } = require("../scripts/codex-to-jarvis.cjs") as {
  mapCodexEventToActivityEvents: (event: unknown, now?: number) => ActivityEvent[];
};

describe("codex-to-jarvis adapter", () => {
  it("maps command execution starts to command or test activity", () => {
    const events = mapCodexEventToActivityEvents(
      {
        type: "item.started",
        item: {
          id: "item_1",
          type: "command_execution",
          command: "npm test",
          status: "in_progress",
        },
      },
      1000,
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      kind: "test",
      message: "Running npm test",
      command: "npm test",
      timestamp: 1000,
      source: "codex",
    });
  });

  it("maps failed command completions to error activity", () => {
    const events = mapCodexEventToActivityEvents({
      type: "item.completed",
      item: {
        id: "item_2",
        type: "command_execution",
        command: "npm run build",
        status: "failed",
        exitCode: 1,
      },
    });

    expect(events[0]).toMatchObject({
      kind: "error",
      message: "Failed npm run build (exit 1)",
      command: "npm run build",
    });
  });

  it("maps file changes to edit activity with a path", () => {
    const events = mapCodexEventToActivityEvents({
      type: "item.completed",
      item: {
        id: "item_3",
        type: "file_change",
        status: "completed",
        changes: [{ path: "src/App.tsx", diff: "", kind: { type: "update" } }],
      },
    });

    expect(events[0]).toMatchObject({
      kind: "edit",
      message: "Updated src/App.tsx",
      path: "src/App.tsx",
    });
  });

  it("maps plan updates to the active plan step", () => {
    const events = mapCodexEventToActivityEvents({
      type: "turn.plan.updated",
      turn_id: "turn_1",
      plan: [
        { step: "Inspect the code", status: "completed" },
        { step: "Patch the adapter", status: "inProgress" },
      ],
    });

    expect(events[0]).toMatchObject({
      kind: "plan",
      message: "Planning: Patch the adapter",
    });
  });

  it("maps app-server item notifications as well as exec JSONL", () => {
    const events = mapCodexEventToActivityEvents({
      method: "item/completed",
      params: {
        threadId: "thread_1",
        turnId: "turn_1",
        item: {
          id: "item_4",
          type: "commandExecution",
          command: "git push",
          status: "completed",
          exitCode: 0,
        },
      },
    });

    expect(events[0]).toMatchObject({
      kind: "success",
      message: "Finished git push",
      command: "git push",
    });
  });

  it("ignores unknown events", () => {
    expect(mapCodexEventToActivityEvents({ type: "mystery.event" })).toEqual([]);
  });
});

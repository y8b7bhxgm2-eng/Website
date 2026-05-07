import { describe, it, expect, afterEach, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { startLogTailer } = require("../electron/logTailer.cjs") as {
  startLogTailer: (file: string, cb: (e: unknown) => void) => () => void;
};

let tmpFile = "";
let stop: (() => void) | undefined;

beforeEach(() => {
  tmpFile = path.join(os.tmpdir(), `jarvis-tailer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jsonl`);
  fs.writeFileSync(tmpFile, "");
});

afterEach(() => {
  stop?.();
  stop = undefined;
  try {
    fs.unlinkSync(tmpFile);
  } catch {
    /* ignore */
  }
});

function waitFor<T>(predicate: () => T | undefined, timeoutMs = 2500): Promise<T> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const v = predicate();
      if (v !== undefined) {
        resolve(v);
        return;
      }
      if (Date.now() - start > timeoutMs) {
        reject(new Error("waitFor timeout"));
        return;
      }
      setTimeout(tick, 50);
    };
    tick();
  });
}

describe("logTailer", () => {
  it("emits events for newly appended JSONL lines", async () => {
    const events: Array<Record<string, unknown>> = [];
    stop = startLogTailer(tmpFile, (e) => events.push(e as Record<string, unknown>));

    fs.appendFileSync(
      tmpFile,
      JSON.stringify({ kind: "read", message: "Reading foo.ts", path: "foo.ts" }) + "\n",
    );

    const got = await waitFor(() => (events.length > 0 ? events[0] : undefined));
    expect(got.kind).toBe("read");
    expect(got.message).toBe("Reading foo.ts");
  });

  it("ignores malformed JSON without crashing", async () => {
    const events: Array<Record<string, unknown>> = [];
    stop = startLogTailer(tmpFile, (e) => events.push(e as Record<string, unknown>));

    fs.appendFileSync(tmpFile, "this is not json\n");
    fs.appendFileSync(tmpFile, JSON.stringify({ kind: "test", message: "ok" }) + "\n");

    const got = await waitFor(() => (events.length > 0 ? events[0] : undefined));
    expect(got.kind).toBe("test");
  });

  it("handles a multi-line append in a single write", async () => {
    const events: Array<Record<string, unknown>> = [];
    stop = startLogTailer(tmpFile, (e) => events.push(e as Record<string, unknown>));

    const lines =
      JSON.stringify({ kind: "plan", message: "a" }) +
      "\n" +
      JSON.stringify({ kind: "edit", message: "b" }) +
      "\n";
    fs.appendFileSync(tmpFile, lines);

    await waitFor(() => (events.length >= 2 ? true : undefined));
    expect(events.map((e) => e.kind)).toEqual(["plan", "edit"]);
  });

  it("ignores unknown event kinds", async () => {
    const events: Array<Record<string, unknown>> = [];
    stop = startLogTailer(tmpFile, (e) => events.push(e as Record<string, unknown>));

    fs.appendFileSync(tmpFile, JSON.stringify({ kind: "oops", message: "bad" }) + "\n");
    fs.appendFileSync(tmpFile, JSON.stringify({ kind: "read", message: "ok" }) + "\n");

    const got = await waitFor(() => (events.length > 0 ? events[0] : undefined));
    expect(got.kind).toBe("read");
    expect(events).toHaveLength(1);
  });
});

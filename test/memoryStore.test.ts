import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

interface MemoryNote {
  id: string;
  title: string;
  tags: string[];
  links: string[];
  source: string;
  createdAt: number;
  updatedAt: number;
  body: string;
  preview: string;
  workspace?: string;
}

interface MemoryStore {
  MEMORY_DIR: string;
  listMemories: () => MemoryNote[];
  loadMemory: (id: string) => MemoryNote | null;
  saveMemory: (input: Partial<MemoryNote>) => MemoryNote;
  deleteMemory: (id: string) => boolean;
  searchMemories: (query: string) => MemoryNote[];
  findBacklinks: (id: string) => string[];
  suggestConnections: (id: string) => Array<{ id: string; title: string; score: number }>;
  buildContextForPrompt: (prompt: string, n?: number) => string;
  createMemoryFromCodexRun: (run: {
    prompt: string;
    workspace?: string;
    model: string;
    reasoningEffort: string;
    speed: string;
    exitCode: number;
    stderrTail: string;
    turnNotes: Array<{ kind: string; message: string; path?: string }>;
  }) => MemoryNote | null;
}

// We require() the CommonJS module dynamically inside each test so that
// the JARVIS_MEMORY_DIR override is picked up before the module captures it.
function loadStore(dir: string): MemoryStore {
  process.env.JARVIS_MEMORY_DIR = dir;
  // Bust Node's cache so subsequent tests get a fresh module bound to `dir`.
  const resolved = require.resolve("../electron/memoryStore.cjs");
  delete require.cache[resolved];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require("../electron/memoryStore.cjs");
  return mod as MemoryStore;
}

describe("memoryStore", () => {
  let dir: string;
  let store: ReturnType<typeof loadStore>;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "jarvis-memory-test-"));
    store = loadStore(dir);
  });

  afterEach(() => {
    delete process.env.JARVIS_MEMORY_DIR;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("starts empty", () => {
    expect(store.listMemories()).toEqual([]);
  });

  it("persists a memory and reloads it", () => {
    const note = store.saveMemory({ title: "Auth pattern", body: "JWT details", tags: ["auth"], links: [] });
    expect(note.id).toBeTruthy();
    expect(fs.existsSync(path.join(dir, `${note.id}.md`))).toBe(true);

    const all = store.listMemories();
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Auth pattern");
    expect(all[0].tags).toEqual(["auth"]);
  });

  it("computes backlinks from the links field of other memories", () => {
    const a = store.saveMemory({ title: "A", body: "anchor", tags: [], links: [] });
    store.saveMemory({ title: "B", body: "link to A", tags: [], links: [a.id] });
    store.saveMemory({ title: "C", body: "also references A", tags: [], links: [a.id] });

    const backlinks = store.findBacklinks(a.id);
    expect(backlinks).toHaveLength(2);
  });

  it("deletes memories by id", () => {
    const note = store.saveMemory({ title: "to-delete", body: "x", tags: [], links: [] });
    expect(store.deleteMemory(note.id)).toBe(true);
    expect(fs.existsSync(path.join(dir, `${note.id}.md`))).toBe(false);
    expect(store.deleteMemory(note.id)).toBe(false);
  });

  it("searches by token and ranks title matches higher", () => {
    store.saveMemory({ title: "Stripe webhook", body: "reads webhook events", tags: [], links: [] });
    store.saveMemory({ title: "Auth pattern", body: "tokens about webhook handling", tags: [], links: [] });
    const found = store.searchMemories("webhook");
    expect(found.length).toBe(2);
    expect(found[0].title).toBe("Stripe webhook");
  });

  it("buildContextForPrompt returns empty when nothing is relevant", () => {
    store.saveMemory({ title: "Stripe webhook", body: "stripe billing notes", tags: [], links: [] });
    expect(store.buildContextForPrompt("a totally unrelated request", 3)).toBe("");
  });

  it("buildContextForPrompt picks relevant memories for a prompt", () => {
    store.saveMemory({ title: "Stripe webhook", body: "stripe billing notes about webhook signatures", tags: [], links: [] });
    store.saveMemory({ title: "Random", body: "totally unrelated", tags: [], links: [] });
    const ctx = store.buildContextForPrompt("Add stripe webhook handler", 3);
    expect(ctx).toContain("Stripe webhook");
    expect(ctx).not.toContain("Random");
  });

  it("suggestConnections proposes memories with overlapping tags or tokens", () => {
    const a = store.saveMemory({
      title: "Auth pattern",
      body: "session cookies and csrf",
      tags: ["auth", "security"],
      links: [],
    });
    store.saveMemory({
      title: "Session bug",
      body: "csrf token mismatch",
      tags: ["auth", "bug"],
      links: [],
    });
    store.saveMemory({ title: "Unrelated", body: "graphics", tags: ["ui"], links: [] });

    const suggestions = store.suggestConnections(a.id);
    expect(suggestions.length).toBeGreaterThanOrEqual(1);
    expect(suggestions[0].title).toBe("Session bug");
  });

  it("createMemoryFromCodexRun records prompt + activity summary", () => {
    const created = store.createMemoryFromCodexRun({
      prompt: "fix failing tests in store.test.ts",
      workspace: "/tmp/some/repo",
      model: "gpt-5.5",
      reasoningEffort: "medium",
      speed: "fast",
      exitCode: 0,
      stderrTail: "",
      turnNotes: [
        { kind: "edit", message: "Edited store.test.ts", path: "store.test.ts" },
        { kind: "test", message: "Ran npm test" },
        { kind: "success", message: "All green" },
      ],
    });
    expect(created).not.toBeNull();
    expect(created?.title).toMatch(/fix failing tests/);
    expect(created?.tags).toContain("codex");
    expect(created?.tags).toContain("ok");
    expect(created?.body).toContain("Edited store.test.ts");
  });

  it("createMemoryFromCodexRun stores stderr tail on failure", () => {
    const created = store.createMemoryFromCodexRun({
      prompt: "broken task",
      workspace: "/tmp/x",
      model: "gpt-5.5",
      reasoningEffort: "medium",
      speed: "standard",
      exitCode: 1,
      stderrTail: "Error: command not found",
      turnNotes: [],
    });
    expect(created?.tags).toContain("failed");
    expect(created?.body).toContain("Error: command not found");
  });
});

/**
 * Memory note shape, mirrored on disk as a Markdown file with YAML
 * frontmatter at `~/.jarvis/memory/<id>.md`.
 *
 * The store is intentionally tiny and grep-friendly so Codex (which gets
 * `--add-dir <memory>`) can read and write notes with normal file tools.
 */
export interface MemoryNote {
  id: string;
  title: string;
  tags: string[];
  links: string[];
  source: "user" | "codex-run" | "system" | string;
  workspace?: string;
  createdAt: number;
  updatedAt: number;
  body: string;
  preview: string;
}

export type MemorySaveInput = Partial<Pick<MemoryNote, "id" | "title" | "tags" | "links" | "workspace" | "body" | "source">>;

export interface MemorySuggestion {
  id: string;
  title: string;
  score: number;
}

export interface MemoryChangedEvent {
  type: "created" | "updated" | "deleted";
  id?: string;
}

export interface MemoryApi {
  list: () => Promise<{ ok: boolean; notes: MemoryNote[]; error?: string }>;
  get: (id: string) => Promise<{ ok: boolean; note?: MemoryNote; error?: string }>;
  save: (note: MemorySaveInput) => Promise<{ ok: boolean; note?: MemoryNote; error?: string }>;
  delete: (id: string) => Promise<{ ok: boolean; error?: string }>;
  search: (query: string) => Promise<{ ok: boolean; notes: MemoryNote[]; error?: string }>;
  backlinks: (id: string) => Promise<{ ok: boolean; ids: string[]; error?: string }>;
  suggest: (id: string) => Promise<{ ok: boolean; suggestions: MemorySuggestion[]; error?: string }>;
}

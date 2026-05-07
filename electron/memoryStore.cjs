/**
 * Jarvis Memory Hub — markdown file store.
 *
 * Each memory is a single .md file at `~/.jarvis/memory/<id>.md` with YAML
 * frontmatter (id, title, tags, links, source, createdAt, updatedAt) and a
 * plain markdown body. The format is intentionally Codex-friendly: we pass
 * the directory to Codex as `--add-dir` so the agent can read and write
 * memories directly using normal file tools.
 *
 * No external indexer; lookups are linear scans on a small set of files.
 * For the MVP this is fast enough (the hub is designed for a few hundred
 * notes max) and keeps the integration boundary clean: every memory is a
 * plain file the user can grep, edit in any editor, or sync via git.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const matter = require("gray-matter");

const MEMORY_ROOT = process.env.JARVIS_MEMORY_DIR || path.join(os.homedir(), ".jarvis", "memory");
const MAX_BODY_PREVIEW = 240;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function ensureDir() {
  fs.mkdirSync(MEMORY_ROOT, { recursive: true });
}

function slugify(input) {
  const base = String(input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `note-${Date.now().toString(36)}`;
}

function ensureUniqueId(id) {
  ensureDir();
  let candidate = ID_RE.test(id) ? id : slugify(id);
  let suffix = 1;
  while (fs.existsSync(path.join(MEMORY_ROOT, `${candidate}.md`))) {
    candidate = `${candidate.replace(/-\d+$/, "")}-${suffix++}`;
  }
  return candidate;
}

function isMemoryFile(name) {
  return name.endsWith(".md") && !name.startsWith(".");
}

function readMemoryFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = matter(raw);
  const data = parsed.data && typeof parsed.data === "object" ? parsed.data : {};
  const body = typeof parsed.content === "string" ? parsed.content.trim() : "";
  const id = path.basename(filePath, ".md");
  return {
    id,
    title: typeof data.title === "string" && data.title.trim() ? data.title.trim() : id,
    tags: Array.isArray(data.tags) ? data.tags.map(String).filter(Boolean) : [],
    links: Array.isArray(data.links) ? data.links.map(String).filter(Boolean) : [],
    source: typeof data.source === "string" ? data.source : "user",
    createdAt: typeof data.createdAt === "number" ? data.createdAt : Number(data.createdAt) || Date.now(),
    updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : Number(data.updatedAt) || Date.now(),
    workspace: typeof data.workspace === "string" ? data.workspace : undefined,
    body,
    preview: body.length > MAX_BODY_PREVIEW ? `${body.slice(0, MAX_BODY_PREVIEW - 1)}\u2026` : body,
  };
}

function listMemories() {
  ensureDir();
  return fs
    .readdirSync(MEMORY_ROOT)
    .filter(isMemoryFile)
    .map((name) => {
      try {
        return readMemoryFile(path.join(MEMORY_ROOT, name));
      } catch (err) {
        return null;
      }
    })
    .filter((note) => note !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function loadMemory(id) {
  if (!id || typeof id !== "string") return null;
  const filePath = path.join(MEMORY_ROOT, `${id}.md`);
  if (!fs.existsSync(filePath)) return null;
  try {
    return readMemoryFile(filePath);
  } catch {
    return null;
  }
}

function saveMemory(note) {
  ensureDir();
  if (!note || typeof note !== "object") {
    throw new Error("Invalid memory payload");
  }

  const now = Date.now();
  const existing = note.id ? loadMemory(note.id) : null;
  const id = existing ? existing.id : ensureUniqueId(note.id || note.title || "note");
  const title = typeof note.title === "string" && note.title.trim() ? note.title.trim() : id;
  const tags = Array.isArray(note.tags) ? note.tags.map(String).filter(Boolean) : [];
  const links = Array.isArray(note.links) ? note.links.map(String).filter(Boolean) : [];
  const source = typeof note.source === "string" ? note.source : existing?.source || "user";
  const workspace = typeof note.workspace === "string" ? note.workspace : existing?.workspace;
  const body = typeof note.body === "string" ? note.body : "";
  const createdAt = existing ? existing.createdAt : now;

  const frontmatter = { id, title, tags, links, source, workspace, createdAt, updatedAt: now };
  // gray-matter strips undefined keys when serializing.
  for (const key of Object.keys(frontmatter)) {
    if (frontmatter[key] === undefined) delete frontmatter[key];
  }

  const serialized = matter.stringify(`${body.trim()}\n`, frontmatter);
  fs.writeFileSync(path.join(MEMORY_ROOT, `${id}.md`), serialized);

  return readMemoryFile(path.join(MEMORY_ROOT, `${id}.md`));
}

function deleteMemory(id) {
  if (!id) return false;
  const filePath = path.join(MEMORY_ROOT, `${id}.md`);
  if (!fs.existsSync(filePath)) return false;
  fs.unlinkSync(filePath);
  return true;
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length > 2);
}

function searchMemories(query) {
  const all = listMemories();
  const q = String(query || "").trim().toLowerCase();
  if (!q) return all;
  const tokens = tokenize(q);
  if (!tokens.length) return all;

  return all
    .map((note) => {
      const haystack = `${note.title}\n${note.tags.join(" ")}\n${note.body}`.toLowerCase();
      let score = 0;
      for (const tok of tokens) {
        const occurrences = haystack.split(tok).length - 1;
        if (occurrences > 0) score += occurrences + (note.title.toLowerCase().includes(tok) ? 4 : 0);
      }
      return { note, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.note);
}

function findBacklinks(id) {
  if (!id) return [];
  return listMemories()
    .filter((note) => note.id !== id && note.links.includes(id))
    .map((note) => note.id);
}

/**
 * Lightweight "suggest connections" — for each other note, score by tag
 * overlap + token overlap in the body. Returns the top 5 suggestions that
 * are not already linked.
 */
function suggestConnections(id) {
  const target = loadMemory(id);
  if (!target) return [];
  const others = listMemories().filter((note) => note.id !== id && !target.links.includes(note.id));
  const targetTags = new Set(target.tags);
  const targetTokens = new Set(tokenize(`${target.title} ${target.body}`));

  return others
    .map((other) => {
      const tagScore = other.tags.filter((tag) => targetTags.has(tag)).length * 3;
      const tokens = new Set(tokenize(`${other.title} ${other.body}`));
      let overlap = 0;
      for (const tok of tokens) if (targetTokens.has(tok)) overlap += 1;
      const score = tagScore + overlap;
      return { id: other.id, title: other.title, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

/**
 * Build a short "memory context" string to prepend to a Codex prompt. Picks
 * the top-N memories most relevant to the prompt by simple token overlap.
 * Output is intentionally short — Codex pays for every token.
 */
function buildContextForPrompt(prompt, n = 5) {
  const all = listMemories();
  if (!all.length) return "";
  const tokens = new Set(tokenize(prompt));
  if (!tokens.size) return "";

  const ranked = all
    .map((note) => {
      const noteTokens = new Set(tokenize(`${note.title} ${note.tags.join(" ")} ${note.body}`));
      let overlap = 0;
      for (const tok of noteTokens) if (tokens.has(tok)) overlap += 1;
      return { note, score: overlap };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);

  if (!ranked.length) return "";

  const lines = ["Relevant Jarvis memories:"];
  for (const { note } of ranked) {
    const body = note.body.replace(/\s+/g, " ").trim().slice(0, 200);
    lines.push(`- (${note.id}) ${note.title}: ${body}`);
  }
  return lines.join("\n");
}

function summarizeTurnNotes(notes) {
  if (!Array.isArray(notes) || !notes.length) return "";
  const lines = [];
  const seen = new Set();
  for (const note of notes) {
    const key = `${note.kind}:${note.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const path = note.path ? ` (\`${note.path}\`)` : "";
    lines.push(`- **${note.kind}**: ${note.message}${path}`);
    if (lines.length >= 12) {
      lines.push("- _\u2026truncated_");
      break;
    }
  }
  return lines.join("\n");
}

function inferTags({ workspace, model, exitCode, turnNotes }) {
  const tags = new Set(["codex", model]);
  if (workspace) tags.add(`workspace:${path.basename(workspace)}`);
  tags.add(exitCode === 0 ? "ok" : "failed");
  if (Array.isArray(turnNotes)) {
    for (const note of turnNotes) {
      if (note?.kind === "test") tags.add("tests");
      if (note?.kind === "ship") tags.add("ship");
      if (note?.kind === "edit" && note.path) tags.add(`edited:${path.basename(note.path)}`);
    }
  }
  return Array.from(tags).slice(0, 8);
}

function createMemoryFromCodexRun(run) {
  if (!run || typeof run !== "object") return null;
  const { prompt, workspace, model, reasoningEffort, speed, exitCode, stderrTail, turnNotes } = run;
  if (!prompt || typeof prompt !== "string") return null;

  const date = new Date();
  const stamp = date.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const promptSlug = slugify(prompt.split("\n")[0]);
  const id = ensureUniqueId(`run-${stamp}-${promptSlug}`);
  const summary = summarizeTurnNotes(turnNotes);
  const stderr = exitCode !== 0 && stderrTail ? `\n\n## Stderr tail\n\n\`\`\`\n${stderrTail.trim().slice(-500)}\n\`\`\`` : "";

  const body = [
    `## Prompt`,
    "",
    "```",
    prompt.trim().slice(0, 600),
    "```",
    "",
    `## Result`,
    "",
    `Exit code: ${exitCode}`,
    workspace ? `Workspace: \`${workspace}\`` : "",
    `Model: \`${model}\` (${reasoningEffort}, ${speed})`,
    "",
    summary ? "## Activity\n\n" + summary : "",
    stderr,
  ]
    .filter(Boolean)
    .join("\n")
    .trim();

  return saveMemory({
    id,
    title: prompt.split("\n")[0].slice(0, 80),
    tags: inferTags({ workspace, model, exitCode, turnNotes }),
    links: [],
    source: "codex-run",
    workspace,
    body,
  });
}

module.exports = {
  MEMORY_DIR: MEMORY_ROOT,
  listMemories,
  loadMemory,
  saveMemory,
  deleteMemory,
  searchMemories,
  findBacklinks,
  suggestConnections,
  buildContextForPrompt,
  createMemoryFromCodexRun,
  // exposed for tests
  _slugify: slugify,
  _summarizeTurnNotes: summarizeTurnNotes,
};

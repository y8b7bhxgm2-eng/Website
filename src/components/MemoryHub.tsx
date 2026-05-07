import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type {
  MemoryApi,
  MemoryChangedEvent,
  MemoryNote,
  MemorySaveInput,
  MemorySuggestion,
} from "@/types/memory";
import { buildGraph, relaxLayout, viewBoxForGraph, type GraphNode } from "@/utils/memoryGraph";

interface JarvisHubApi {
  memory?: MemoryApi;
  onMemoryChanged?: (cb: (evt: MemoryChangedEvent) => void) => () => void;
}

interface MemoryHubProps {
  open: boolean;
  onClose: () => void;
}

function jarvisApi(): JarvisHubApi | undefined {
  return (window as unknown as { jarvis?: JarvisHubApi }).jarvis;
}

const ACTIONS = ["CREATE_MEMORY", "SEARCH_MEMORIES", "FIND_BACKLINKS", "SUGGEST_CONNECTIONS"] as const;
type Action = (typeof ACTIONS)[number];

export function MemoryHub({ open, onClose }: MemoryHubProps) {
  const api = useMemo(jarvisApi, []);
  const memory = api?.memory;
  const [notes, setNotes] = useState<MemoryNote[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftTags, setDraftTags] = useState("");
  const [draftLinks, setDraftLinks] = useState("");
  const [backlinks, setBacklinks] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<MemorySuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [unsupported, setUnsupported] = useState(false);
  const [activeAction, setActiveAction] = useState<Action | null>(null);

  const refresh = useCallback(async () => {
    if (!memory) {
      setUnsupported(true);
      return;
    }
    const result = await memory.list();
    if (result?.ok) {
      setNotes(result.notes);
      setUnsupported(false);
    } else {
      setUnsupported(false);
    }
  }, [memory]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const off = api?.onMemoryChanged?.(() => refresh());
    return off;
  }, [api, open, refresh]);

  // Load active note details.
  useEffect(() => {
    if (!activeId) {
      setDraftBody("");
      setDraftTitle("");
      setDraftTags("");
      setDraftLinks("");
      setBacklinks([]);
      setSuggestions([]);
      return;
    }
    const note = notes.find((n) => n.id === activeId);
    if (note) {
      setDraftBody(note.body);
      setDraftTitle(note.title);
      setDraftTags(note.tags.join(", "));
      setDraftLinks(note.links.join(", "));
    }
    if (memory) {
      void memory.backlinks(activeId).then((res) => res?.ok && setBacklinks(res.ids));
      void memory.suggest(activeId).then((res) => res?.ok && setSuggestions(res.suggestions));
    }
  }, [activeId, memory, notes]);

  const filteredNotes = useMemo(() => {
    if (!search.trim()) return notes;
    const q = search.toLowerCase();
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.id.toLowerCase().includes(q) ||
        n.tags.some((t) => t.toLowerCase().includes(q)) ||
        n.body.toLowerCase().includes(q),
    );
  }, [notes, search]);

  const graph = useMemo(() => {
    const g = buildGraph(filteredNotes);
    relaxLayout(g, { iterations: filteredNotes.length > 80 ? 120 : 220 });
    return g;
  }, [filteredNotes]);
  const viewBox = useMemo(() => viewBoxForGraph(graph), [graph]);

  const onAction = useCallback(
    async (action: Action) => {
      if (!memory) return;
      setActiveAction(action);
      switch (action) {
        case "CREATE_MEMORY": {
          setBusy(true);
          const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-").toLowerCase();
          const res = await memory.save({
            title: `New memory ${stamp}`,
            body: "## Notes\n\n",
            tags: [],
            links: [],
            source: "user",
          });
          setBusy(false);
          if (res?.ok && res.note) {
            await refresh();
            setActiveId(res.note.id);
          }
          break;
        }
        case "SEARCH_MEMORIES": {
          // Focus the search input — handled by the input ref below.
          searchRef.current?.focus();
          break;
        }
        case "FIND_BACKLINKS": {
          if (!activeId) return;
          const res = await memory.backlinks(activeId);
          if (res?.ok) setBacklinks(res.ids);
          break;
        }
        case "SUGGEST_CONNECTIONS": {
          if (!activeId) return;
          const res = await memory.suggest(activeId);
          if (res?.ok) setSuggestions(res.suggestions);
          break;
        }
      }
    },
    [activeId, memory, refresh],
  );

  const searchRef = useRef<HTMLInputElement>(null);

  const handleSave = useCallback(async () => {
    if (!memory || !activeId) return;
    setBusy(true);
    const next: MemorySaveInput = {
      id: activeId,
      title: draftTitle.trim() || activeId,
      body: draftBody,
      tags: draftTags.split(",").map((t) => t.trim()).filter(Boolean),
      links: draftLinks.split(",").map((t) => t.trim()).filter(Boolean),
    };
    const res = await memory.save(next);
    setBusy(false);
    if (res?.ok) {
      await refresh();
    }
  }, [activeId, draftBody, draftLinks, draftTags, draftTitle, memory, refresh]);

  const handleDelete = useCallback(async () => {
    if (!memory || !activeId) return;
    setBusy(true);
    const res = await memory.delete(activeId);
    setBusy(false);
    if (res?.ok) {
      setActiveId(null);
      await refresh();
    }
  }, [activeId, memory, refresh]);

  const handleAddLink = useCallback(
    (id: string) => {
      const current = draftLinks
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (current.includes(id)) return;
      setDraftLinks([...current, id].join(", "));
    },
    [draftLinks],
  );

  if (!open) return null;

  return (
    <motion.div
      className="memory-hub"
      role="dialog"
      aria-label="Jarvis Memory Hub"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <header className="memory-hub-head">
        <div className="memory-hub-brand">
          <span className="memory-hub-mono">.jarvismemory/</span>
          <span className="memory-hub-tag">— LIVE HUB</span>
        </div>
        <div className="memory-hub-counts">
          <span>
            {notes.length} note{notes.length === 1 ? "" : "s"}
          </span>
          <span>
            {graph.edges.length} link{graph.edges.length === 1 ? "" : "s"}
          </span>
          <button type="button" className="btn btn-ghost btn-mini" onClick={onClose}>
            Close
          </button>
        </div>
      </header>

      {unsupported ? (
        <div className="memory-hub-unsupported">
          <p>Memory Hub is only available in the Electron app.</p>
          <p className="memory-hub-hint">
            The browser preview can&apos;t read or write <code>~/.jarvis/memory/</code>. Run{" "}
            <code>npm run app</code> to use the hub.
          </p>
        </div>
      ) : (
        <div className="memory-hub-body">
          <aside className="memory-hub-sidebar">
            <div className="memory-hub-search">
              <input
                ref={searchRef}
                type="text"
                placeholder="Search memories"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <ul className="memory-hub-list">
              {filteredNotes.map((note) => (
                <li
                  key={note.id}
                  className={`memory-hub-item ${activeId === note.id ? "memory-hub-item-active" : ""}`}
                  onClick={() => setActiveId(note.id)}
                >
                  <div className="memory-hub-item-title">{note.title}</div>
                  <div className="memory-hub-item-meta">
                    <span className="memory-hub-item-id">{note.id}</span>
                    {note.tags.slice(0, 3).map((tag) => (
                      <span key={tag} className="memory-hub-tag-pill">
                        {tag}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
              {filteredNotes.length === 0 ? (
                <li className="memory-hub-empty">
                  {search ? "No matches." : "No memories yet. Run a Codex task or click CREATE_MEMORY."}
                </li>
              ) : null}
            </ul>
          </aside>

          <div className="memory-hub-graph">
            <Graph graph={graph} viewBox={viewBox} activeId={activeId} onSelect={setActiveId} />
          </div>

          <aside className="memory-hub-detail">
            {activeId ? (
              <ActiveNoteEditor
                id={activeId}
                title={draftTitle}
                tags={draftTags}
                links={draftLinks}
                body={draftBody}
                backlinks={backlinks}
                suggestions={suggestions}
                onTitle={setDraftTitle}
                onTags={setDraftTags}
                onLinks={setDraftLinks}
                onBody={setDraftBody}
                onSave={handleSave}
                onDelete={handleDelete}
                onAddLink={handleAddLink}
                busy={busy}
              />
            ) : (
              <div className="memory-hub-detail-empty">
                <p>Select a memory or create a new one.</p>
              </div>
            )}
          </aside>
        </div>
      )}

      <footer className="memory-hub-actions">
        {ACTIONS.map((action, i) => (
          <button
            key={action}
            type="button"
            className={`memory-hub-action ${activeAction === action ? "memory-hub-action-active" : ""}`}
            onClick={() => onAction(action)}
            disabled={busy || (action !== "CREATE_MEMORY" && action !== "SEARCH_MEMORIES" && !activeId)}
            title={
              action === "FIND_BACKLINKS" || action === "SUGGEST_CONNECTIONS"
                ? activeId
                  ? action.replace(/_/g, " ").toLowerCase()
                  : "Select a memory first"
                : action.replace(/_/g, " ").toLowerCase()
            }
          >
            <span>{action}</span>
            {i < ACTIONS.length - 1 ? <em aria-hidden>{">"}</em> : null}
          </button>
        ))}
      </footer>
    </motion.div>
  );
}

function Graph({
  graph,
  viewBox,
  activeId,
  onSelect,
}: {
  graph: ReturnType<typeof buildGraph>;
  viewBox: { x: number; y: number; w: number; h: number };
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  if (!graph.nodes.length) {
    return (
      <div className="memory-graph-empty">
        <span>The hub is empty. Memories appear as nodes connected by their links.</span>
      </div>
    );
  }

  return (
    <svg
      className="memory-graph-svg"
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <radialGradient id="memoryHalo" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.55)" />
          <stop offset="60%" stopColor="rgba(255,255,255,0.05)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </radialGradient>
      </defs>
      {/* Edges */}
      <g className="memory-graph-edges">
        {graph.edges.map((edge, i) => {
          const a = graph.byId[edge.from];
          const b = graph.byId[edge.to];
          if (!a || !b) return null;
          const isActive = activeId && (edge.from === activeId || edge.to === activeId);
          return (
            <line
              key={`${edge.from}-${edge.to}-${i}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={`memory-graph-edge ${isActive ? "memory-graph-edge-active" : ""}`}
            />
          );
        })}
      </g>
      {/* Nodes */}
      <g className="memory-graph-nodes">
        {graph.nodes.map((node) => (
          <NodeMark key={node.id} node={node} active={activeId === node.id} onSelect={onSelect} />
        ))}
      </g>
    </svg>
  );
}

function NodeMark({
  node,
  active,
  onSelect,
}: {
  node: GraphNode;
  active: boolean;
  onSelect: (id: string) => void;
}) {
  const radius = active ? node.radius + 3 : node.radius;
  const labelOffset = radius + 12;
  return (
    <g
      className={`memory-graph-node ${active ? "memory-graph-node-active" : ""}`}
      transform={`translate(${node.x}, ${node.y})`}
      onClick={() => onSelect(node.id)}
      role="button"
    >
      {active ? <circle r={radius * 3} fill="url(#memoryHalo)" pointerEvents="none" /> : null}
      <circle r={radius} className="memory-graph-node-core" />
      <circle r={radius - 1.5} className="memory-graph-node-inner" />
      <text x={0} y={-labelOffset} textAnchor="middle" className="memory-graph-node-label">
        {node.title.length > 28 ? `${node.title.slice(0, 27)}\u2026` : node.title}
      </text>
    </g>
  );
}

function ActiveNoteEditor({
  id,
  title,
  tags,
  links,
  body,
  backlinks,
  suggestions,
  onTitle,
  onTags,
  onLinks,
  onBody,
  onSave,
  onDelete,
  onAddLink,
  busy,
}: {
  id: string;
  title: string;
  tags: string;
  links: string;
  body: string;
  backlinks: string[];
  suggestions: MemorySuggestion[];
  onTitle: (v: string) => void;
  onTags: (v: string) => void;
  onLinks: (v: string) => void;
  onBody: (v: string) => void;
  onSave: () => void;
  onDelete: () => void;
  onAddLink: (id: string) => void;
  busy: boolean;
}) {
  return (
    <div className="memory-detail">
      <div className="memory-detail-header">
        <span className="memory-detail-id">{id}</span>
        <div className="memory-detail-buttons">
          <button type="button" className="btn btn-ghost btn-mini" onClick={onSave} disabled={busy}>
            Save
          </button>
          <button type="button" className="btn btn-ghost btn-mini btn-destructive" onClick={onDelete} disabled={busy}>
            Delete
          </button>
        </div>
      </div>
      <input
        type="text"
        className="memory-detail-title"
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        placeholder="Memory title"
      />
      <div className="memory-detail-row">
        <label>
          <span>tags</span>
          <input type="text" value={tags} onChange={(e) => onTags(e.target.value)} placeholder="comma, separated" />
        </label>
        <label>
          <span>links</span>
          <input type="text" value={links} onChange={(e) => onLinks(e.target.value)} placeholder="other-memory-id, ..." />
        </label>
      </div>
      <textarea
        className="memory-detail-body"
        value={body}
        onChange={(e) => onBody(e.target.value)}
        placeholder="Markdown body"
      />
      <section className="memory-detail-related">
        <header>
          <span>backlinks</span>
          <em>{backlinks.length}</em>
        </header>
        {backlinks.length === 0 ? <p className="memory-detail-empty">None yet.</p> : null}
        <ul>
          {backlinks.map((b) => (
            <li key={b}>
              <span>{b}</span>
            </li>
          ))}
        </ul>
        <header>
          <span>suggested connections</span>
          <em>{suggestions.length}</em>
        </header>
        {suggestions.length === 0 ? <p className="memory-detail-empty">No suggestions.</p> : null}
        <ul>
          {suggestions.map((s) => (
            <li key={s.id}>
              <span>
                {s.title} <em>({s.score})</em>
              </span>
              <button type="button" className="btn btn-ghost btn-mini" onClick={() => onAddLink(s.id)}>
                Link
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

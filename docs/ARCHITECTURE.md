# Jarvis — Architecture

## 1. Goals & non-goals

**Goals**

- Give a calm, ambient view of what an AI coding agent is doing right now.
- Be agent-agnostic: Codex, Aider, Cursor, Claude Code, plain shell commands all work.
- Make the common Codex path simple enough to run from the Jarvis window.
- Stay snappy on long sessions: no unbounded memory growth, no jank.
- Keep the trust boundary clean: Jarvis never touches model code, credentials, or prompts.

**Non-goals**

- Replacing the actual AI tool's UI (terminal, IDE plugin, etc.).
- Reimplementing Codex or talking directly to model APIs. Jarvis may launch the local Codex CLI,
  but it treats Codex as an external process and consumes only its public event stream.
- Persisting activity beyond the current session (out of MVP scope).

## 2. Tech stack

| Layer | Choice | Rationale |
| --- | --- | --- |
| Shell | Electron 32 | Mature, predictable native integration: tray, transparent floating windows, FS access. |
| Renderer | React 18 + TypeScript + Vite 5 | Fast iteration, strict types for the event model. |
| Animation | Framer Motion | Spring physics for natural avatar movement; AnimatePresence for feed enter/exit. |
| State | Zustand + a pure FSM | The FSM is decoupled from React for trivial unit testing; Zustand wraps it for the UI. |
| Tests | Vitest + Testing Library | Native ESM/TS, jsdom env, parity with Jest API. |
| Lint/format | ESLint + Prettier | Industry default; minimal custom rules. |

### Why Electron over Tauri

Tauri is lighter at runtime, but the MVP needs:

- A preload bridge with structured IPC. Electron's `contextBridge` is the most documented path.
- Reliable tray + transparent always-on-top windows on macOS, Windows, Linux. Electron has
  fewer platform-specific edge cases here.
- Optional `child_process.spawn` for future CLI wrappers. Both Electron and Tauri can do this,
  but Node's API is more familiar to JS-only contributors.

If/when the MVP graduates and binary size matters, swapping the shell for Tauri is a localized
change — the renderer, FSM, and integration formats are untouched.

### Why a WebSocket bridge isn't enough

A pure-browser app over WebSockets could work for visualization, but it can't:

- Watch the local filesystem (chokidar requires Node).
- Tail a log file outside the browser sandbox.
- Render a tray icon or floating, transparent, always-on-top window.

Electron gives all of those for free. The renderer still works in a plain browser
(`npm run dev`) thanks to the `BroadcastChannel("jarvis")` and `CustomEvent` fallbacks in
`useActivityBridge.ts`, so day-to-day development doesn't require launching Electron.

## 3. State machine

The core of Jarvis is a pure finite state machine in [`src/state/stateMachine.ts`](../src/state/stateMachine.ts).

```
ActivityEvent.kind  →  AgentState  →  RoomId
─────────────────────────────────────────────
plan, think         →  thinking    →  planning
read                →  reading     →  editor
edit                →  editing     →  editor
command             →  running     →  terminal
test                →  testing     →  lab
debug               →  debugging   →  debug
ship                →  shipping    →  shipping
success             →  success     →  shipping
error               →  error       →  debug
idle                →  idle        →  planning
```

Two key rules make the visualization feel right:

1. **Precedence on contention.** When multiple events fire close together (e.g. an
   `error` event followed by an unrelated `read` 200ms later), low-precedence events do
   **not** clobber a fresh high-precedence state. `error > success > debugging > shipping
   > testing > running > editing > reading > thinking > idle`.
2. **Idle decay.** If no events arrive for `IDLE_DECAY_MS` (8s), the agent drifts back
   to `idle` in the Planning room. The renderer schedules a 1s ticker to drive this.

The FSM has zero React or DOM imports and is fully unit tested.

## 4. Data model

```ts
interface ActivityEvent {
  id: string;
  timestamp: number;          // epoch ms
  kind: ActivityKind;         // 11 kinds, see types/activity.ts
  message: string;            // human-readable
  path?: string;              // optional file path
  command?: string;           // optional command string
  source?: string;            // which integration emitted it
  detail?: Record<string, unknown>;
}
```

This shape is the **wire format** for every integration. JSONL lines in
`~/.jarvis/activity.jsonl` are direct `JSON.stringify(ActivityEvent)` calls.

## 5. Integration layer

### 5.1 JSONL log file (canonical)

Path: `~/.jarvis/activity.jsonl` (override with `JARVIS_LOG`).

Producers append one JSON object per line:

```jsonl
{"kind":"read","timestamp":1700000000000,"message":"Reading src/App.tsx","path":"src/App.tsx"}
{"kind":"test","timestamp":1700000001500,"message":"Running npm test","command":"npm test"}
{"kind":"success","timestamp":1700000010500,"message":"All tests passed"}
```

Electron tails the file via `electron/logTailer.cjs` (polling watchFile + chunked read from the
last consumed byte offset, with truncation handling). Each parsed line is forwarded to all
windows over `webContents.send("jarvis:activity", event)`.

### 5.2 CLI wrapper

`scripts/jarvis-wrap.sh <kind> -- <command...>` runs the command and appends a start event
followed by a `success` or `error` event with the exit code. This is the lowest-effort way to
make any agent or build script visible.

### 5.3 Codex adapter

`scripts/codex-to-jarvis.cjs` consumes `codex exec --json` output and maps Codex JSONL events
into Jarvis `ActivityEvent` JSONL. It handles thread/turn lifecycle events, plan updates,
command executions, file changes, MCP/dynamic tool calls, web searches, and errors. The wrapper
`scripts/jarvis-codex.cjs` runs `codex exec --json`, preserves Codex's JSONL stdout, and appends
the translated activity stream to the canonical Jarvis log.

The Electron app also exposes a simpler in-app path: `window.jarvis.selectWorkspace()` opens a
native folder picker, and `window.jarvis.runCodex()` launches `codex exec --json` from the main
process. It passes `--sandbox workspace-write`, `-C <workspace>`, and
`-c model_reasoning_effort="<value>"`, where the UI offers `low`, `medium`, `high`, and `xhigh`
(shown as Extra High). The UI also exposes Codex Speed: Standard passes
`features.fast_mode=false`, while Fast passes `features.fast_mode=true` and `service_tier='fast'`.
Events are parsed with the same adapter and broadcast directly to the renderer.

This keeps Codex integration out-of-process: Jarvis observes public Codex event output and never
needs model credentials or direct access to Codex internals.

### 5.4 In-renderer fallbacks

`useActivityBridge` also listens for:

- `BroadcastChannel("jarvis")` messages (cross-tab + arbitrary producers).
- `window.dispatchEvent(new CustomEvent("jarvis-activity", { detail: event }))`.

These exist mostly so the renderer is useful in a plain browser tab during development and
testing.

### 5.5 Future hooks

The same `ActivityEvent` shape supports:

- A WebSocket server in the main process (e.g. for remote agents).
- A chokidar-based file watcher pointed at a project root for "Editing X" detection.
- Rich payload panels for command output, diffs, and grouped activity bursts.

None of these are required for the MVP, but their interface is already locked: emit
`ActivityEvent` shaped objects and ingest into the same store.

## 6. UI architecture

```
App
├── StatusBar          ← brand, current state pill, actions
├── CodexPanel         ← workspace picker, task prompt, reasoning selector
├── Building           ← container; reads fsm.room from store
│   ├── Room × 6       ← positioned absolutely in 0..1 coords
│   └── Avatar         ← animated to room center via Framer Motion
└── ActivityFeed       ← reverse-chronological list of events
```

- The building grid uses **normalized coordinates** so the layout scales with window size —
  no media queries needed for the avatar's position.
- The avatar is a single absolutely-positioned element; we animate `left`/`top` percentages
  to the active room's center via a Framer spring. Walk animation comes from leg rotation.
- All transitions read from the **store**, not from props. This makes adding new sources
  (and tests) trivial.

## 7. System tray & floating window

- **Tray** is created in `electron/main.cjs` with a hand-crafted 16×16 PNG icon (no asset
  pipeline needed for MVP). The tray menu reflects the current state and exposes "Show",
  "Toggle floating mode", "Quit".
- **Floating window** is a small, transparent, always-on-top, frameless `BrowserWindow`
  loading the same renderer with `?floating=1`. Future work: split a `<MiniView>` component
  that only renders the avatar + a one-line status when the query string is present.

## 8. Performance & robustness

- The activity feed is hard-capped at 200 entries (configurable in `store.ts`). Older
  entries fall off; the UI only renders the first 60 to stay responsive.
- The log tailer uses chunked streams from the last byte offset, so megabyte-scale logs
  catch up in O(new bytes).
- Malformed JSON lines are logged once and skipped — never crash the watcher.
- File watching uses `fs.watchFile` (poll) instead of `fs.watch` (inotify) because the
  former is more reliable across Linux configurations and the file is tiny anyway.

## 9. Testing strategy

- **Unit tests** for the FSM (transitions, precedence, idle decay) and the classifier
  (`fileChange`, `command`, `logLine` heuristics).
- **Store tests** verify the React-facing API: ingest order, state updates, reset, cap.
- **Manual / e2e** is the demo timeline (`npm run mock-events`) — visual confirmation that
  the worker walks the right path.

The canonical `TEST_COMMAND` is **`npm test`**.

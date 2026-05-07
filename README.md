# Jarvis — AI Workspace

A desktop companion app that visualizes AI activity as an animated worker moving through a 2D
building cutaway. Built to give you a calm, premium-feeling window into what an AI coding agent
(OpenAI Codex, Aider, Claude Code, plain `npm test`, etc.) is doing right now — without burying
you in raw logs.

![rooms](docs/preview-placeholder.txt)

> **Status:** MVP prototype. Renderer + state machine are fully implemented and tested. Electron
> shell, system tray, floating window, file/log integration scaffolding are in place; running them
> requires `npm install` and a desktop OS.

## Why this exists

Most AI coding tools dump JSON logs or terminal output that's hard to skim. Jarvis turns those
logs into a continuous visual story: a worker walking from the **Planning** room to the **Code
Editor**, stopping by the **Terminal** to run a command, ducking into the **Testing Lab**,
celebrating in **Shipping** — or sounding the alarm in **Debugging** when something fails.

## Features

- **2D building cutaway** with six rooms: Planning, Code Editor, Terminal, Testing Lab,
  Debugging, Shipping. Dark-mode-first, premium feel, smooth Framer Motion animations.
- **Animated worker avatar** with distinct visual states: idle, thinking (glowing head ring),
  reading, editing (caret blink in the editor), running commands (terminal CRT lights up),
  testing (lab flask bubbles), debugging (warning light pulses), success (confetti burst),
  error (red alert halo).
- **Activity feed** — clean, non-overwhelming log of specific actions ("Reading
  `src/App.tsx`", "Running `npm test`").
- **Built-in Codex launcher** — choose a workspace, type a task, pick Low / Medium / High /
  Extra High reasoning, and watch Codex activity sync into Jarvis without extra terminals.
  Includes an inline **Stop Codex** control and an opt-in toggle that injects relevant
  Memory Hub notes as additional context before each run.
- **Live terminal panel** — an `xterm.js` view that streams the real Codex stdout, stderr,
  and parsed activity events with ANSI colors. The Terminal room CRT shows a 4-line
  live-tail of the same stream while Codex is running.
- **Memory Hub** — a local Markdown knowledge graph at `~/.jarvis/memory/` with a
  force-directed graph view, full-text search, backlinks, suggested connections, and
  automatic capture of every Codex run. Codex receives the directory via `--add-dir`,
  so the agent can read and write memories with normal file tools.
- **State machine** — pure, testable FSM that maps incoming events to agent states with sane
  precedence (an `error` doesn't get clobbered by a stray `read` 200ms later).
- **Integration layer** — multiple ways to feed activity in:
  - Append JSONL events to `~/.jarvis/activity.jsonl` (the canonical channel).
  - Launch Codex directly from the desktop app through the Codex Mission Control panel.
  - Run `npm run codex:jarvis -- "your Codex prompt"` to mirror `codex exec --json`
    activity into the Jarvis feed.
  - Use `scripts/jarvis-wrap.sh` to wrap any shell command and emit start/finish events.
  - Drop a file watcher / log tailer (provided) into your editor or agent harness.
  - In a browser, post to `BroadcastChannel("jarvis")` or dispatch
    `window.dispatchEvent(new CustomEvent("jarvis-activity", { detail }))`.
- **System tray** with quick toggles, plus a **floating mini-window** mode that stays on top.

## Tech stack & why

| Choice | Why |
| --- | --- |
| **Electron** | Native filesystem access (chokidar, log tailing), system tray, frameless floating windows, and an existing well-trodden path for desktop dev tools. Tauri was tempting but adds a Rust toolchain dependency that's unnecessary for an MVP. |
| **React + TypeScript** | Tight feedback loop, strict types for the event/state model, large ecosystem. |
| **Vite** | Fast HMR, simple config, ESM-first. |
| **Framer Motion** | Spring-based animations that read smoothly even on slow events. |
| **Zustand** | Tiny, ergonomic store; no Provider boilerplate, easy to test. |
| **Vitest + Testing Library** | First-class TS, fast, jsdom out of the box. |

### Why an out-of-process integration

We deliberately do **not** instrument or wrap any specific AI model. Instead, Jarvis listens on
a single, dumb channel: append-only JSONL at `~/.jarvis/activity.jsonl`. Any agent or shell
wrapper can publish events with a one-liner. This keeps the trust boundary clean (Jarvis never
touches model code or credentials), makes it trivial to support new agents (Codex, Aider,
Cursor, Claude Code, plain `npm test`), and means tests are just "append a JSON line and assert
on the FSM".

For Codex, `scripts/codex-to-jarvis.cjs` translates `codex exec --json` events into the same
JSONL shape Jarvis already tails. For agents that don't expose structured events, the
`scripts/jarvis-wrap.sh` wrapper turns any shell command into a pair of "start" / "finish"
events — the simplest possible escape hatch.

## File / folder structure

```
Jarvis/
├── electron/                 # Electron main process (CommonJS)
│   ├── main.cjs              # Window + tray + IPC + activity sources
│   ├── preload.cjs           # contextBridge: activity, workspace picker, Codex run IPC
│   └── logTailer.cjs         # JSONL tailer for ~/.jarvis/activity.jsonl
├── src/                      # Renderer (React + TS)
│   ├── App.tsx               # App shell
│   ├── main.tsx              # ReactDOM root
│   ├── index.css             # Design system (dark mode, tokens, components)
│   ├── components/
│   │   ├── Building.tsx      # The 2D building grid
│   │   ├── Room.tsx          # Per-room scenes (whiteboard, monitor, CRT, ...)
│   │   ├── Avatar.tsx        # Animated worker
│   │   ├── ActivityFeed.tsx  # Right-rail log
│   │   ├── CodexPanel.tsx    # Built-in Codex launcher + reasoning selector
│   │   └── StatusBar.tsx     # Top bar: brand, state, actions
│   ├── state/
│   │   ├── stateMachine.ts   # Pure FSM (transition, decayIfStale, room map)
│   │   └── store.ts          # Zustand store wrapping the FSM
│   ├── hooks/
│   │   └── useActivityBridge.ts  # Wires Electron + browser sources to the store
│   ├── data/
│   │   ├── rooms.ts          # Layout coordinates + accents for each room
│   │   └── mockEvents.ts     # Demo timeline used by the "Run demo" button
│   ├── types/activity.ts     # ActivityEvent, ActivityKind, AgentState, RoomId
│   └── utils/classifyEvent.ts# Heuristics: file change / command / log line → ActivityEvent
├── scripts/
│   ├── codex-to-jarvis.cjs   # Convert `codex exec --json` JSONL into Jarvis events
│   ├── jarvis-codex.cjs      # Run Codex and mirror its activity into Jarvis
│   ├── jarvis-wrap.sh        # Wrap a shell command and emit JSONL events
│   └── mock-events.cjs       # Replay the demo timeline into ~/.jarvis/activity.jsonl
├── test/
│   ├── stateMachine.test.ts  # FSM transitions, precedence, idle decay
│   ├── classifyEvent.test.ts # Event classification heuristics
│   └── store.test.ts         # Zustand store integration
├── docs/
│   ├── ARCHITECTURE.md       # Deeper architecture notes
│   └── MVP_SCOPE.md          # What's in / out of the MVP
├── index.html
├── vite.config.ts
├── tsconfig*.json
├── .eslintrc.cjs
├── .prettierrc
└── package.json
```

## Run the prototype

```bash
# 1. Install
npm install

# 2. Run the renderer in dev mode (browser preview)
npm run dev          # opens http://localhost:5173

# 3. Verify state transitions (the canonical TEST_COMMAND)
npm test             # runs vitest (FSM, classifier, store)

# 4. Launch the full desktop app
npm run app
```

Inside the desktop app, use **Codex Mission Control** to pick the workspace you want Codex to
work in, choose the speed and reasoning level, enter the task, and click **Run Codex**. Jarvis
launches `codex exec --json --sandbox workspace-write` for you and mirrors the JSONL stream into
the visual companion.

To verify state transitions visually:

1. Run `npm run dev` and open the URL shown.
2. Click **Run demo** in the top-right. The worker walks Planning → Editor → Terminal → Lab →
   Debugging → Editor → Lab → Shipping while the activity feed populates.
3. To drive it from outside: `node scripts/mock-events.cjs --once` (or run without `--once`
   to replay the full timeline) and watch the feed react.

To pipe a real command:

```bash
chmod +x scripts/jarvis-wrap.sh
scripts/jarvis-wrap.sh test -- npm test
```

To sync a Codex run with Jarvis:

```bash
npm run codex:jarvis -- "summarize this repo and suggest one improvement"
```

If the project folder is not a Git checkout, the wrapper automatically passes
`--skip-git-repo-check` to `codex exec`.

The in-app launcher uses Codex's config override flag to set reasoning per run:
`-c model_reasoning_effort="<low|medium|high|xhigh>"`. Extra High maps to Codex's `xhigh`
value.

Jarvis also passes `--sandbox workspace-write` for in-app Codex runs so Codex can create and
edit files inside the selected workspace.

For speed, Standard disables the Fast-mode feature for that run. Fast passes
`-c service_tier='fast'` plus `-c features.fast_mode=true`, which requires a Codex account/plan
that supports Fast mode.

On Windows, Jarvis auto-detects Codex from PATH, the global npm shim folder, the Windows app
execution alias folder, and the OpenAI Codex Store package location. If your install is somewhere
custom, set `JARVIS_CODEX_BIN` to the full path of `codex.exe` or `codex.cmd` before launching
Jarvis.

Or, if you already have a Codex JSONL stream:

```bash
codex exec --json "fix the failing tests" | npm run codex:pipe
```

## Verifying state transitions (TEST_COMMAND)

The canonical, deterministic check that every kind of event maps to the right state, room, and
precedence ordering:

```bash
npm test
```

Or, more narrowly:

```bash
npx vitest run test/stateMachine.test.ts
```

Both must pass with zero failures before merging changes that touch the FSM.

## Lint / typecheck

```bash
npm run lint
npm run typecheck
```

## Build a Windows installer

```bash
npm run dist:win
```

The installer is written to `release/` as `Jarvis AI Workspace Setup <version>.exe`. Use
`npm run pack:win` for an unpacked app folder without an installer.

## License

Internal prototype — no license declared yet.

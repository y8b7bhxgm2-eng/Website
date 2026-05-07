const { contextBridge, ipcRenderer } = require("electron");

/**
 * Safe IPC surface exposed to the renderer.
 *
 *  - `onActivity(cb)` subscribes to events emitted by the main
 *    process (file watcher, log tailer, etc.). Returns an off()
 *    handle for cleanup.
 *  - `selectWorkspace()` opens a native folder picker for Codex runs.
 *  - `runCodex(request)` launches the local Codex CLI from the main process.
 *  - `stopCodex()` requests cancellation of the active Codex run.
 *  - `onCodexOutput(cb)` streams raw Codex stdout / stderr / system frames.
 *  - `memory.*` exposes the local Markdown memory store and graph.
 *  - `emit(event)` lets the renderer push synthetic events back
 *    through the same fan-out (used by the demo button + tests).
 */
function listen(channel, cb) {
  const handler = (_evt, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld("jarvis", {
  onActivity: (cb) => listen("jarvis:activity", cb),
  onCodexStatus: (cb) => listen("jarvis:codex-status", cb),
  onAgentStatus: (cb) => listen("jarvis:agent-status", cb),
  onCodexOutput: (cb) => listen("jarvis:codex-output", cb),
  onMemoryChanged: (cb) => listen("jarvis:memory-changed", cb),
  selectWorkspace: () => ipcRenderer.invoke("jarvis:select-workspace"),
  runAgent: (request) => ipcRenderer.invoke("jarvis:agent-run", request),
  runCodex: (request) => ipcRenderer.invoke("jarvis:codex-run", request),
  stopCodex: () => ipcRenderer.invoke("jarvis:codex-stop"),
  emit: (event) => ipcRenderer.invoke("jarvis:emit", event),
  memory: {
    list: () => ipcRenderer.invoke("jarvis:memory-list"),
    get: (id) => ipcRenderer.invoke("jarvis:memory-get", id),
    save: (note) => ipcRenderer.invoke("jarvis:memory-save", note),
    delete: (id) => ipcRenderer.invoke("jarvis:memory-delete", id),
    search: (query) => ipcRenderer.invoke("jarvis:memory-search", query),
    backlinks: (id) => ipcRenderer.invoke("jarvis:memory-backlinks", id),
    suggest: (id) => ipcRenderer.invoke("jarvis:memory-suggest", id),
  },
});

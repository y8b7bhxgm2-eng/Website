import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Building } from "@/components/Building";
import { ActivityFeed } from "@/components/ActivityFeed";
import { StatusBar } from "@/components/StatusBar";
import { CodexPanel } from "@/components/CodexPanel";
import { PhasePills } from "@/components/PhasePills";
import { MatrixRain } from "@/components/MatrixRain";
import { useActivityBridge } from "@/hooks/useActivityBridge";
import { useJarvisStore } from "@/state/store";
import { demoTimeline } from "@/data/mockEvents";
import type { ActivityEvent } from "@/types/activity";

const CodexTerminal = lazy(() => import("@/components/Terminal").then((m) => ({ default: m.CodexTerminal })));
const MemoryHub = lazy(() => import("@/components/MemoryHub").then((m) => ({ default: m.MemoryHub })));

export function App() {
  useActivityBridge();
  const ingest = useJarvisStore((s) => s.ingest);
  const reset = useJarvisStore((s) => s.reset);
  const timersRef = useRef<number[]>([]);
  const [theme, setTheme] = useState("monochrome");
  const [memoryOpen, setMemoryOpen] = useState(false);

  useEffect(() => {
    document.body.className = `theme-${theme}`;
  }, [theme]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(window.clearTimeout);
    timersRef.current = [];
  }, []);

  const runDemo = useCallback(() => {
    clearTimers();
    let cumulative = 0;
    let counter = 0;
    demoTimeline.forEach(([delay, body]) => {
      cumulative += delay;
      const handle = window.setTimeout(() => {
        const event: ActivityEvent = {
          id: `demo-${Date.now().toString(36)}-${counter++}`,
          timestamp: Date.now(),
          ...body,
        };
        ingest(event);
      }, cumulative);
      timersRef.current.push(handle);
    });
  }, [ingest, clearTimers]);

  const onReset = useCallback(() => {
    clearTimers();
    reset();
  }, [reset, clearTimers]);

  useEffect(() => () => clearTimers(), [clearTimers]);

  return (
    <div className="app">
      {theme === "matrix" && <MatrixRain />}
      <StatusBar
        onDemo={runDemo}
        onReset={onReset}
        theme={theme}
        onThemeChange={setTheme}
        onOpenMemory={() => setMemoryOpen(true)}
      />
      <main className="layout">
        <div className="workspace-column">
          <CodexPanel />
          <PhasePills />
          <Building />
          <Suspense fallback={<TerminalSkeleton />}>
            <CodexTerminal />
          </Suspense>
        </div>
        <ActivityFeed />
      </main>
      <footer className="footer">
        <span>Local-only / no telemetry</span>
        <span className="footer-hint">
          Pick a workspace, choose a provider, and let Jarvis coordinate the handoff.
        </span>
      </footer>
      <AnimatePresence>
        {memoryOpen ? (
          <Suspense fallback={null}>
            <MemoryHub key="memory-hub" open={memoryOpen} onClose={() => setMemoryOpen(false)} />
          </Suspense>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function TerminalSkeleton() {
  return (
    <section className="terminal-panel terminal-panel-skeleton">
      <header className="terminal-header">
        <div className="terminal-title">
          <span className="terminal-dot dot-red" aria-hidden />
          <span className="terminal-dot dot-amber" aria-hidden />
          <span className="terminal-dot dot-green" aria-hidden />
          <span className="terminal-label">codex.live</span>
          <span className="terminal-meta">loading</span>
        </div>
      </header>
      <div className="terminal-surface" />
    </section>
  );
}

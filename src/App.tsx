import { useCallback, useEffect, useRef, useState } from "react";
import { Building } from "@/components/Building";
import { ActivityFeed } from "@/components/ActivityFeed";
import { StatusBar } from "@/components/StatusBar";
import { CodexPanel } from "@/components/CodexPanel";
import { MatrixRain } from "@/components/MatrixRain";
import { useActivityBridge } from "@/hooks/useActivityBridge";
import { useJarvisStore } from "@/state/store";
import { demoTimeline } from "@/data/mockEvents";
import type { ActivityEvent } from "@/types/activity";

export function App() {
  useActivityBridge();
  const ingest = useJarvisStore((s) => s.ingest);
  const reset = useJarvisStore((s) => s.reset);
  const timersRef = useRef<number[]>([]);
  const [theme, setTheme] = useState("monochrome");

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
      <StatusBar onDemo={runDemo} onReset={onReset} theme={theme} onThemeChange={setTheme} />
      <main className="layout">
        <div className="workspace-column">
          <CodexPanel />
          <Building />
        </div>
        <ActivityFeed />
      </main>
      <footer className="footer">
        <span>Local-only / no telemetry</span>
        <span className="footer-hint">
          Pick a workspace, choose a provider, and let Jarvis coordinate the handoff.
        </span>
      </footer>
    </div>
  );
}

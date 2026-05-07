import { useEffect } from "react";
import { useJarvisStore } from "@/state/store";
import type { ActivityEvent } from "@/types/activity";

/**
 * Wires up incoming ActivityEvents from whatever runtime we're in.
 *
 * - Inside Electron, the preload script exposes
 *   `window.jarvis.onActivity(cb)` which forwards events from the main
 *   process (file watcher, log tailer, CLI wrapper, etc.).
 * - In a plain browser context (e.g. `npm run dev` with no Electron),
 *   we fall back to a `BroadcastChannel("jarvis")` and a window-level
 *   `"jarvis-activity"` CustomEvent so external tooling or the demo
 *   panel can post events trivially.
 *
 * It also runs an idle-decay tick so the avatar relaxes back to "idle"
 * if nothing happens for a while.
 */
export function useActivityBridge() {
  const ingest = useJarvisStore((s) => s.ingest);
  const tickIdle = useJarvisStore((s) => s.tickIdle);

  useEffect(() => {
    const handlers: Array<() => void> = [];

    // Electron bridge.
    const w = window as unknown as {
      jarvis?: { onActivity: (cb: (e: ActivityEvent) => void) => () => void };
    };
    if (w.jarvis?.onActivity) {
      const off = w.jarvis.onActivity(ingest);
      handlers.push(off);
    }

    // BroadcastChannel — works in any modern browser.
    let bc: BroadcastChannel | undefined;
    try {
      bc = new BroadcastChannel("jarvis");
      bc.onmessage = (ev: MessageEvent<ActivityEvent>) => {
        if (ev.data && typeof ev.data === "object" && "kind" in ev.data) {
          ingest(ev.data);
        }
      };
      handlers.push(() => bc?.close());
    } catch {
      // BroadcastChannel not available — ignore.
    }

    // Custom DOM event.
    const onCustom = (e: Event) => {
      const ce = e as CustomEvent<ActivityEvent>;
      if (ce.detail) ingest(ce.detail);
    };
    window.addEventListener("jarvis-activity", onCustom as EventListener);
    handlers.push(() => window.removeEventListener("jarvis-activity", onCustom as EventListener));

    return () => handlers.forEach((h) => h());
  }, [ingest]);

  useEffect(() => {
    const t = setInterval(tickIdle, 1000);
    return () => clearInterval(t);
  }, [tickIdle]);
}

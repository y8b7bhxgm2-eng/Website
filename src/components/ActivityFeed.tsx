import { useJarvisStore } from "@/state/store";
import type { ActivityKind } from "@/types/activity";
import { motion, AnimatePresence } from "framer-motion";
import type { CSSProperties, PointerEvent } from "react";

const KIND_COLOR: Record<ActivityKind, string> = {
  plan: "#cccccc",
  think: "#cccccc",
  read: "#bbbbbb",
  edit: "#bbbbbb",
  command: "#aaaaaa",
  test: "#999999",
  debug: "#888888",
  ship: "#dddddd",
  success: "#dddddd",
  error: "#666666",
  idle: "#6b7280",
};

function relativeTime(ts: number, now: number): string {
  const diff = Math.max(0, now - ts);
  if (diff < 1000) return "just now";
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function ActivityIcon({ kind }: { kind: ActivityKind }) {
  switch (kind) {
    case "plan":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 17.5 16.5 5 19 7.5 6.5 20H4v-2.5Z" />
          <path d="m14.5 7 2.5 2.5" />
        </svg>
      );
    case "think":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 4a6 6 0 0 0-3 11.2V18h6v-2.8A6 6 0 0 0 12 4Z" />
          <path d="M9.5 21h5" />
        </svg>
      );
    case "read":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M5 5.5h6a3 3 0 0 1 3 3V20a3 3 0 0 0-3-3H5V5.5Z" />
          <path d="M19 5.5h-5a3 3 0 0 0-3 3" />
          <path d="M19 5.5V17h-5" />
        </svg>
      );
    case "edit":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M4 16.5V20h3.5L18.8 8.7l-3.5-3.5L4 16.5Z" />
          <path d="m14 6.5 3.5 3.5" />
        </svg>
      );
    case "command":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="m6 8 4 4-4 4" />
          <path d="M13 17h5" />
        </svg>
      );
    case "test":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M10 3v5l-5.5 9.5A2 2 0 0 0 6.2 20h11.6a2 2 0 0 0 1.7-2.5L14 8V3" />
          <path d="M8 3h8" />
          <path d="M7 16h10" />
        </svg>
      );
    case "debug":
    case "error":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3 21 20H3L12 3Z" />
          <path d="M12 9v4" />
          <path d="M12 17h.01" />
        </svg>
      );
    case "ship":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M12 3 19 21l-7-4-7 4 7-18Z" />
          <path d="M12 3v14" />
        </svg>
      );
    case "success":
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="4" />
        </svg>
      );
  }
}

function updateSpotlight(e: PointerEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
}

export function ActivityFeed() {
  const feed = useJarvisStore((s) => s.feed);
  const now = Date.now();

  return (
    <aside className="feed" onPointerMove={updateSpotlight}>
      <header className="feed-header">
        <span className="feed-title">Activity</span>
        <span className="feed-count">{feed.length}</span>
      </header>
      <ul className="feed-list">
        <AnimatePresence initial={false}>
          {feed.slice(0, 60).map((event) => (
            <motion.li
              key={event.id}
              layout
              className="feed-item"
              style={{ "--event-color": KIND_COLOR[event.kind] } as CSSProperties}
              onPointerMove={updateSpotlight}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ type: "spring", stiffness: 420, damping: 32, mass: 0.65 }}
            >
              <span className="feed-icon" style={{ color: KIND_COLOR[event.kind] }} aria-hidden>
                <ActivityIcon kind={event.kind} />
              </span>
              <div className="feed-body">
                <div className="feed-message">{event.message}</div>
                <div className="feed-meta">
                  <span className="feed-kind">{event.kind}</span>
                  <span className="feed-time">{relativeTime(event.timestamp, now)}</span>
                  {event.source ? <span className="feed-source">{event.source}</span> : null}
                </div>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
        {feed.length === 0 ? (
          <li className="feed-empty">
            No activity yet. Click &ldquo;Run demo&rdquo; to see it in action.
          </li>
        ) : null}
      </ul>
    </aside>
  );
}

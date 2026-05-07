import { create } from "zustand";
import { isActivityEvent, type ActivityEvent } from "@/types/activity";
import {
  type FsmContext,
  decayIfStale,
  initialContext,
  transition,
} from "./stateMachine";

const FEED_LIMIT = 200;

interface JarvisState {
  fsm: FsmContext;
  feed: ActivityEvent[];
  ingest: (event: ActivityEvent) => void;
  tickIdle: () => void;
  reset: () => void;
}

export const useJarvisStore = create<JarvisState>((set) => ({
  fsm: initialContext(),
  feed: [],
  ingest: (event) => {
    if (!isActivityEvent(event)) return;
    set((s) => ({
      fsm: transition(s.fsm, event),
      feed: [event, ...s.feed].slice(0, FEED_LIMIT),
    }));
  },
  tickIdle: () => set((s) => ({ fsm: decayIfStale(s.fsm) })),
  reset: () => set({ fsm: initialContext(), feed: [] }),
}));

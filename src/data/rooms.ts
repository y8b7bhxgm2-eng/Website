import type { RoomId } from "@/types/activity";

/**
 * Layout of the building cutaway, in normalized 0..1 coordinates so it
 * scales smoothly with the window. Each room is a rectangle on a 3x2
 * grid, and the avatar is positioned at the room's center for now.
 *
 *  ┌───────────┬───────────┬───────────┐
 *  │ Planning  │   Editor  │ Terminal  │
 *  ├───────────┼───────────┼───────────┤
 *  │  Lab      │   Debug   │ Shipping  │
 *  └───────────┴───────────┴───────────┘
 */

export interface RoomLayout {
  id: RoomId;
  label: string;
  /** Top-left corner in 0..1 coordinates. */
  x: number;
  y: number;
  /** Width / height in 0..1 coordinates. */
  w: number;
  h: number;
  /** Accent color for the room glow. */
  accent: string;
  /** Short tagline shown when the worker is in this room. */
  tagline: string;
}

const COL = 1 / 3;
const ROW = 1 / 2;

export const roomLayouts: RoomLayout[] = [
  {
    id: "planning",
    label: "Planning",
    x: 0,
    y: 0,
    w: COL,
    h: ROW,
    accent: "#cccccc",
    tagline: "Sketching the plan",
  },
  {
    id: "editor",
    label: "Code Editor",
    x: COL,
    y: 0,
    w: COL,
    h: ROW,
    accent: "#bbbbbb",
    tagline: "Reading & writing code",
  },
  {
    id: "terminal",
    label: "Terminal",
    x: 2 * COL,
    y: 0,
    w: COL,
    h: ROW,
    accent: "#aaaaaa",
    tagline: "Running commands",
  },
  {
    id: "lab",
    label: "Testing Lab",
    x: 0,
    y: ROW,
    w: COL,
    h: ROW,
    accent: "#999999",
    tagline: "Validating behavior",
  },
  {
    id: "debug",
    label: "Debugging",
    x: COL,
    y: ROW,
    w: COL,
    h: ROW,
    accent: "#888888",
    tagline: "Hunting bugs",
  },
  {
    id: "shipping",
    label: "Shipping",
    x: 2 * COL,
    y: ROW,
    w: COL,
    h: ROW,
    accent: "#dddddd",
    tagline: "Committing & shipping",
  },
];

export const roomById: Record<RoomId, RoomLayout> = roomLayouts.reduce(
  (acc, r) => ({ ...acc, [r.id]: r }),
  {} as Record<RoomId, RoomLayout>,
);

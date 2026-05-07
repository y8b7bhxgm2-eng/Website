import type { PointerEvent } from "react";
import { useJarvisStore } from "@/state/store";
import { roomLayouts, roomById } from "@/data/rooms";
import { Room } from "./Room";
import { Avatar } from "./Avatar";

function updateSpotlight(e: PointerEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
  e.currentTarget.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
}

export function Building() {
  const fsm = useJarvisStore((s) => s.fsm);
  const activeRoom = roomById[fsm.room];

  return (
    <div className="building" onPointerMove={updateSpotlight}>
      <div className="building-grid">
        {roomLayouts.map((room) => (
          <Room key={room.id} room={room} active={room.id === fsm.room} agentState={fsm.state} />
        ))}
        <Avatar fsm={fsm} />
      </div>
      <div className="building-tagline">
        <span className="building-tagline-dot" style={{ background: activeRoom.accent }} />
        {activeRoom.tagline}
      </div>
    </div>
  );
}

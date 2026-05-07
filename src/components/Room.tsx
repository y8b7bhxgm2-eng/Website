import { motion } from "framer-motion";
import type { RoomLayout } from "@/data/rooms";
import type { AgentState } from "@/types/activity";

interface RoomProps {
  room: RoomLayout;
  active: boolean;
  agentState: AgentState;
}

/**
 * Each room is rendered as a positioned div with a stylized icon set.
 * When the agent is in this room, the room "lights up" via a stronger
 * accent glow + subtle motion to convey activity.
 */
export function Room({ room, active, agentState }: RoomProps) {
  return (
    <motion.div
      className={`room room-${room.id} ${active ? "room-active" : ""}`}
      style={{
        left: `${room.x * 100}%`,
        top: `${room.y * 100}%`,
        width: `${room.w * 100}%`,
        height: `${room.h * 100}%`,
        // CSS custom property used by the stylesheet to drive the glow color.
        ["--accent" as string]: room.accent,
      }}
      animate={{
        boxShadow: active
          ? `inset 0 0 60px 0 ${room.accent}33, 0 0 32px 0 ${room.accent}55`
          : `inset 0 0 24px 0 #00000040`,
      }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="room-header">
        <span className="room-label">{room.label}</span>
        {active ? (
          <motion.span
            className="room-pulse"
            initial={{ opacity: 0.4 }}
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.6, repeat: Infinity }}
          />
        ) : null}
      </div>
      <RoomScene roomId={room.id} active={active} agentState={agentState} />
    </motion.div>
  );
}

function RoomScene({
  roomId,
  active,
  agentState,
}: {
  roomId: RoomLayout["id"];
  active: boolean;
  agentState: AgentState;
}) {
  switch (roomId) {
    case "planning":
      return (
        <div className="room-scene scene-planning">
          <div className="whiteboard">
            <div className="wb-line" />
            <div className="wb-line short" />
            <div className="wb-line" />
            <div className="wb-line short" />
          </div>
          <div className="desk" />
        </div>
      );
    case "editor":
      return (
        <div className="room-scene scene-editor">
          <div className={`monitor ${active ? "monitor-active" : ""}`}>
            <div className="code-line" />
            <div className="code-line short" />
            <div className="code-line" />
            <div className="code-line shorter" />
            <div className="code-line short" />
            {active && agentState === "editing" ? (
              <motion.div
                className="caret"
                animate={{ opacity: [0, 1, 0] }}
                transition={{ duration: 0.9, repeat: Infinity }}
              />
            ) : null}
          </div>
          <div className="desk" />
        </div>
      );
    case "terminal":
      return (
        <div className="room-scene scene-terminal">
          <div className={`crt ${active && agentState === "running" ? "crt-on" : ""}`}>
            <div className="prompt">$ _</div>
          </div>
          <div className="desk" />
        </div>
      );
    case "lab":
      return (
        <div className="room-scene scene-lab">
          <div className="flask">
            <motion.div
              className="bubble"
              initial={{ x: "-50%" }}
              animate={active ? { x: "-50%", y: [0, -14, 0], opacity: [0.7, 1, 0.7] } : { x: "-50%", y: 0, opacity: 0.5 }}
              transition={{ duration: 1.4, repeat: Infinity }}
            />
          </div>
          <div className="bench" />
        </div>
      );
    case "debug":
      return (
        <div className="room-scene scene-debug">
          <motion.div
            className="warning-light"
            animate={
              active && agentState === "debugging"
                ? { opacity: [0.3, 1, 0.3] }
                : { opacity: 0.25 }
            }
            transition={{ duration: 0.8, repeat: Infinity }}
          />
          <div className="bug" />
          <div className="desk" />
        </div>
      );
    case "shipping":
      return (
        <div className="room-scene scene-shipping">
          <div className="crate" />
          <div className="crate small" />
          <motion.div
            className="conveyor"
            animate={active ? { backgroundPosition: ["0% 0%", "100% 0%"] } : {}}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
        </div>
      );
  }
}

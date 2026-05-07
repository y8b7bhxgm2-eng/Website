import { motion, type TargetAndTransition, type Transition } from "framer-motion";
import type { FsmContext } from "@/state/stateMachine";
import { roomById } from "@/data/rooms";

interface AvatarProps {
  fsm: FsmContext;
}

/**
 * The animated AI core that glides between rooms. It is intentionally
 * effect-heavy and compact, so success/error states can bloom around it
 * without making the room layout jump.
 */
export function Avatar({ fsm }: AvatarProps) {
  const room = roomById[fsm.room];
  const x = (room.x + room.w / 2) * 100;
  const y = (room.y + room.h * 0.5) * 100;
  const halo = haloForState(fsm.state);

  return (
    <motion.div
      className={`avatar avatar-${fsm.state}`}
      animate={{ left: `${x}%`, top: `${y}%` }}
      transition={{ type: "spring", stiffness: 74, damping: 20, mass: 0.9 }}
    >
      <motion.div
        className="avatar-halo"
        style={{ background: halo.color, opacity: halo.opacity }}
        animate={halo.animate}
        transition={halo.transition}
      />
      <div className="avatar-body">
        <motion.div
          className="avatar-orbit orbit-wide"
          animate={{ rotate: 360 }}
          transition={{
            duration: isBusy(fsm.state) ? 1.6 : 5,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <motion.div
          className="avatar-orbit orbit-tight"
          animate={{ rotate: -360 }}
          transition={{
            duration: fsm.state === "thinking" ? 2.1 : 4.2,
            repeat: Infinity,
            ease: "linear",
          }}
        />
        <motion.div
          className="avatar-core"
          animate={
            fsm.state === "idle"
              ? { scale: [1, 1.03, 1] }
              : { scale: [1, 1.1, 1], y: [0, -2, 0] }
          }
          transition={{
            duration: fsm.state === "idle" ? 3 : 1.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
        <span className="avatar-satellite satellite-a" />
        <span className="avatar-satellite satellite-b" />
      </div>
      {fsm.state === "success" ? <Confetti /> : null}
      {fsm.state === "error" ? <RedAlert /> : null}
    </motion.div>
  );
}

function isBusy(state: FsmContext["state"]) {
  return state !== "idle" && state !== "success";
}

interface Halo {
  color: string;
  opacity: number;
  animate?: TargetAndTransition;
  transition?: Transition;
}

function haloForState(state: FsmContext["state"]): Halo {
  switch (state) {
    case "thinking":
      return {
        color: "radial-gradient(circle, color-mix(in srgb, var(--accent) 40%, transparent) 0%, transparent 70%)",
        opacity: 0.9,
        animate: { scale: [1, 1.18, 1] },
        transition: { duration: 1.6, repeat: Infinity, ease: "easeInOut" },
      };
    case "reading":
      return {
        color: "radial-gradient(circle, color-mix(in srgb, var(--text-1) 40%, transparent) 0%, transparent 70%)",
        opacity: 0.75,
      };
    case "editing":
      return {
        color: "radial-gradient(circle, color-mix(in srgb, var(--text-1) 60%, transparent) 0%, transparent 70%)",
        opacity: 0.9,
      };
    case "running":
      return {
        color: "radial-gradient(circle, color-mix(in srgb, var(--warn) 40%, transparent) 0%, transparent 70%)",
        opacity: 0.9,
        animate: { scale: [1, 1.1, 1] },
        transition: { duration: 0.8, repeat: Infinity },
      };
    case "testing":
      return {
        color: "radial-gradient(circle, color-mix(in srgb, var(--text-2) 50%, transparent) 0%, transparent 70%)",
        opacity: 0.85,
      };
    case "debugging":
      return {
        color: "radial-gradient(circle, color-mix(in srgb, var(--bad) 60%, transparent) 0%, transparent 70%)",
        opacity: 1,
        animate: { opacity: [0.55, 1, 0.55] },
        transition: { duration: 0.6, repeat: Infinity },
      };
    case "shipping":
      return {
        color: "radial-gradient(circle, color-mix(in srgb, var(--good) 50%, transparent) 0%, transparent 70%)",
        opacity: 0.9,
      };
    case "success":
      return {
        color: "radial-gradient(circle, color-mix(in srgb, var(--good) 70%, transparent) 0%, transparent 70%)",
        opacity: 1,
        animate: { scale: [1, 1.45, 1] },
        transition: { duration: 1, repeat: 1 },
      };
    case "error":
      return {
        color: "radial-gradient(circle, color-mix(in srgb, var(--bad) 70%, transparent) 0%, transparent 70%)",
        opacity: 1,
        animate: { opacity: [0.55, 1, 0.55] },
        transition: { duration: 0.4, repeat: Infinity },
      };
    default:
      return { color: "transparent", opacity: 0 };
  }
}

function Confetti() {
  const colors = ["#dddddd", "#cccccc", "#bbbbbb", "#aaaaaa", "#999999", "#888888"];
  return (
    <div className="confetti">
      {colors.map((c, i) => (
        <motion.span
          key={c}
          className="confetti-piece"
          style={{ background: c }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.8 }}
          animate={{
            x: Math.cos((i / colors.length) * Math.PI * 2) * 46,
            y: Math.sin((i / colors.length) * Math.PI * 2) * 46 - 14,
            opacity: 0,
            scale: 1.25,
          }}
          transition={{ duration: 1.1, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

function RedAlert() {
  return (
    <motion.div
      className="red-alert"
      animate={{ opacity: [0.18, 0.7, 0.18], scale: [0.96, 1.06, 0.96] }}
      transition={{ duration: 0.5, repeat: Infinity }}
    />
  );
}

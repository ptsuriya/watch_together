"use client";

import { REACTIONS } from "../../lib/room-state";

export type EmojiParticle = { x: number; delay: number; duration: number; size: number; drift: number; spin: number };
export type EmojiBurst = { id: number; emoji: string; from: string; particles: EmojiParticle[] };

const PARTICLES_PER_BURST = 9;
export const BURST_LIFETIME_MS = 4200;

/** Random flight paths, made once when the burst arrives so re-renders do not reshuffle them. */
export function makeBurst(id: number, emoji: string, from: string): EmojiBurst {
  const particles = Array.from({ length: PARTICLES_PER_BURST }, () => ({
    x: 4 + Math.random() * 92,
    delay: Math.random() * 0.5,
    duration: 2.4 + Math.random() * 1.2,
    size: 28 + Math.random() * 34,
    drift: Math.round((Math.random() - 0.5) * 160),
    spin: Math.round((Math.random() - 0.5) * 60),
  }));
  return { id, emoji, from, particles };
}

/** Emoji flying up the TV screen when someone taps one on their phone. */
export function EmojiRain({ bursts }: { bursts: EmojiBurst[] }) {
  if (bursts.length === 0) return null;
  return (
    <div className="emoji-rain" aria-hidden="true">
      {bursts.map((burst) => (
        <div key={burst.id}>
          {burst.particles.map((particle, index) => (
            <span
              key={index}
              className="emoji-particle"
              style={{
                left: `${particle.x}%`,
                fontSize: `${particle.size}px`,
                animationDelay: `${particle.delay}s`,
                animationDuration: `${particle.duration}s`,
                "--drift": `${particle.drift}px`,
                "--spin": `${particle.spin}deg`,
              } as React.CSSProperties}
            >
              {burst.emoji}
            </span>
          ))}
          <span className="emoji-from">{burst.from} {burst.emoji}</span>
        </div>
      ))}
    </div>
  );
}

export function EmojiPad({ onSend, compact = false }: { onSend: (emoji: string) => void; compact?: boolean }) {
  return (
    <div className={`emoji-pad${compact ? " emoji-pad-compact" : ""}`}>
      {REACTIONS.map((emoji) => (
        <button key={emoji} type="button" className="emoji-button" onClick={() => onSend(emoji)} aria-label={`ส่ง ${emoji}`}>
          {emoji}
        </button>
      ))}
    </div>
  );
}

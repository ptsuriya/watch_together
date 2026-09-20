"use client";

import { Plus } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { REACTIONS, sanitizeReaction } from "../../lib/room-state";
import { Dialog } from "./ui";

export type EmojiParticle = { x: number; delay: number; duration: number; size: number; drift: number; spin: number };
export type EmojiBurst = { id: number; emoji: string; from: string; particles: EmojiParticle[] };

const PARTICLES_PER_BURST = 9;
export const BURST_LIFETIME_MS = 4200;
const CUSTOM_EMOJI_KEY = "kuma-custom-emoji";

/** A few more to tap, for people whose keyboard makes emoji hard to reach. */
const EXTRA_EMOJI = [
  "😭", "🥹", "🤣", "😎", "🤩", "🥰", "😴", "🙈",
  "🎸", "🥁", "🎹", "🎺", "🍻", "🍕", "🌶️", "🍰",
  "⭐", "✨", "💖", "🫶", "🙏", "👑", "🚀", "🐱",
];

/** Random flight paths, made once when the burst arrives so re-renders do not reshuffle them. */
export function makeBurst(id: number, emoji: string, from: string): EmojiBurst {
  const particles = Array.from({ length: PARTICLES_PER_BURST }, () => ({
    x: 4 + Math.random() * 92,
    delay: Math.random() * 0.5,
    duration: 2.4 + Math.random() * 1.2,
    // Sized against the screen, so a burst reads from across the room on a TV.
    size: 5 + Math.random() * 4,
    drift: Math.round((Math.random() - 0.5) * 220),
    spin: Math.round((Math.random() - 0.5) * 60),
  }));
  return { id, emoji, from, particles };
}

/**
 * Emoji flying up when someone taps one. On a shared TV they cross the whole screen; in watch mode they stay in the
 * strip under the video, where they cover nobody's picture.
 */
export function EmojiRain({ bursts, variant = "stage" }: { bursts: EmojiBurst[]; variant?: "stage" | "strip" }) {
  if (bursts.length === 0) return null;
  return (
    <div className={`emoji-rain emoji-rain-${variant}`} aria-hidden="true">
      {bursts.map((burst) => (
        <div key={burst.id}>
          {burst.particles.map((particle, index) => (
            <span
              key={index}
              className="emoji-particle"
              style={{
                left: `${particle.x}%`,
                fontSize: variant === "stage" ? `${particle.size}vmin` : `${Math.round(particle.size * 4)}px`,
                animationDelay: `${particle.delay}s`,
                animationDuration: `${variant === "stage" ? particle.duration : particle.duration * 0.7}s`,
                "--drift": `${variant === "stage" ? particle.drift : Math.round(particle.drift / 3)}px`,
                "--spin": `${particle.spin}deg`,
              } as CSSProperties}
            >
              {burst.emoji}
            </span>
          ))}
          {variant === "stage" && <span className="emoji-from">{burst.from} {burst.emoji}</span>}
        </div>
      ))}
    </div>
  );
}

function readCustomEmoji() {
  try {
    return sanitizeReaction(window.localStorage.getItem(CUSTOM_EMOJI_KEY)) ?? "";
  } catch {
    return "";
  }
}

export function EmojiPad({ onSend, compact = false }: { onSend: (emoji: string) => void; compact?: boolean }) {
  const [custom, setCustom] = useState("");
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setCustom(readCustomEmoji()), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  function saveCustom(emoji: string) {
    setCustom(emoji);
    setPicking(false);
    try {
      window.localStorage.setItem(CUSTOM_EMOJI_KEY, emoji);
    } catch {
      // It still works for this visit.
    }
    onSend(emoji);
  }

  return (
    <>
      <div className={`emoji-pad${compact ? " emoji-pad-compact" : ""}`}>
        {REACTIONS.map((emoji) => (
          <button key={emoji} type="button" className="emoji-button" onClick={() => onSend(emoji)} aria-label={`ส่ง ${emoji}`}>
            {emoji}
          </button>
        ))}
        {custom && (
          <button type="button" className="emoji-button is-custom" onClick={() => onSend(custom)} aria-label={`ส่ง ${custom}`}>
            {custom}
          </button>
        )}
        <button
          type="button"
          className="emoji-button emoji-add"
          onClick={() => setPicking(true)}
          aria-label={custom ? "เปลี่ยนอีโมจิของคุณ" : "เพิ่มอีโมจิของคุณเอง"}
        >
          <Plus size={compact ? 18 : 24} aria-hidden="true" />
        </button>
      </div>
      {picking && <EmojiPicker current={custom} onPick={saveCustom} onClose={() => setPicking(false)} />}
    </>
  );
}

function EmojiPicker({ current, onPick, onClose }: { current: string; onPick: (emoji: string) => void; onClose: () => void }) {
  const [typed, setTyped] = useState(current);
  const valid = sanitizeReaction(typed);

  return (
    <Dialog labelledBy="emoji-picker-title" onClose={onClose}>
      <h2 id="emoji-picker-title" className="dialog-title">อีโมจิของคุณ</h2>
      <p className="dialog-text">เลือกได้คนละหนึ่งตัว จะไปอยู่ท้ายแถวปุ่มของคุณ เปลี่ยนใหม่ได้ทุกเมื่อ</p>
      <div className="emoji-pad emoji-pad-picker">
        {EXTRA_EMOJI.map((emoji) => (
          <button
            key={emoji}
            type="button"
            className={`emoji-button${emoji === typed ? " is-custom" : ""}`}
            onClick={() => onPick(emoji)}
            aria-label={`ใช้ ${emoji}`}
          >
            {emoji}
          </button>
        ))}
      </div>
      <form
        className="add-row"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onPick(valid);
        }}
      >
        <label htmlFor="custom-emoji" className="sr-only">พิมพ์อีโมจิที่อยากใช้</label>
        <input
          id="custom-emoji"
          className="field emoji-input"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          maxLength={12}
          placeholder="หรือพิมพ์อีโมจิเอง"
        />
        <button type="submit" className="btn btn-primary" disabled={!valid}>ใช้อันนี้</button>
      </form>
    </Dialog>
  );
}

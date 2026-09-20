"use client";

import { Plus } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { REACTIONS, sanitizeReaction } from "../../lib/room-state";
import { Dialog } from "./ui";

export type EmojiParticle = {
  x: number; delay: number; duration: number; size: number; drift: number; spin: number;
  /** How far up this one goes, as a share of the burst's height. */
  rise: number;
};
export type EmojiBurst = { id: number; emoji: string; from: string; particles: EmojiParticle[]; rise?: number };

export const BURST_LIFETIME_MS = 4600;
const CUSTOM_EMOJI_KEY = "kuma-custom-emoji";

/** A few more to tap, for people whose keyboard makes emoji hard to reach. */
const EXTRA_EMOJI = [
  "😭", "🥹", "🤣", "😎", "🤩", "🥰", "😴", "🙈",
  "🎸", "🥁", "🎹", "🎺", "🍻", "🍕", "🌶️", "🍰",
  "⭐", "✨", "💖", "🫶", "🙏", "👑", "🚀", "🐱",
];

type Mood = {
  count: number;
  duration: [number, number];
  delay: number;
  drift: number;
  spin: number;
  size: [number, number];
};

/** How tall a burst is by default; particles scatter within it. */
export const BURST_HEIGHT_DVH = 30;

/** Cheering shoots up fast and scatters wide; affection drifts up slowly. */
const MOODS: Record<"fast" | "normal" | "slow", Mood> = {
  fast: { count: 14, duration: [0.9, 1.6], delay: 0.35, drift: 320, spin: 140, size: [4, 9] },
  normal: { count: 10, duration: [1.5, 2.4], delay: 0.6, drift: 230, spin: 70, size: [4.5, 9] },
  slow: { count: 7, duration: [2.6, 4], delay: 1, drift: 120, spin: 24, size: [5.5, 10] },
};

const EMOJI_MOOD: Record<string, keyof typeof MOODS> = {
  "🔥": "fast", "💯": "fast", "🎉": "fast", "👏": "fast", "😂": "fast", "🤣": "fast", "🚀": "fast",
  "🥁": "fast", "🎸": "fast", "⭐": "fast", "✨": "fast", "🍻": "fast",
  "❤️": "slow", "🍯": "slow", "🐻": "slow", "😍": "slow", "🥰": "slow", "😴": "slow", "🥹": "slow",
  "🙏": "slow", "💖": "slow", "🫶": "slow", "🙈": "slow", "🐱": "slow",
};

const between = ([low, high]: [number, number]) => low + Math.random() * (high - low);

/** Random flight paths, made once when the burst arrives so re-renders do not reshuffle them. */
export function makeBurst(id: number, emoji: string, from: string, rise?: number): EmojiBurst {
  const mood = MOODS[EMOJI_MOOD[emoji] ?? "normal"];
  const particles = Array.from({ length: mood.count }, () => ({
    x: 2 + Math.random() * 96,
    delay: Math.random() * mood.delay,
    duration: between(mood.duration),
    // Sized against the screen, so a burst reads from across the room on a TV.
    size: between(mood.size),
    drift: Math.round((Math.random() - 0.5) * mood.drift),
    spin: Math.round((Math.random() - 0.5) * mood.spin),
    rise: 0.45 + Math.random() * 0.75,
  }));
  return { id, emoji, from, particles, rise };
}

/**
 * Emoji flying up when someone taps one. On a shared TV they cross the whole screen; on a page where everyone has
 * their own small player they rise across the window but stop short of the video.
 */
export function EmojiRain({ bursts, variant = "stage" }: { bursts: EmojiBurst[]; variant?: "stage" | "page" }) {
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
                fontSize: `${particle.size}vmin`,
                animationDelay: `${particle.delay}s`,
                animationDuration: `${particle.duration}s`,
                "--drift": `${particle.drift}px`,
                "--spin": `${particle.spin}deg`,
                "--emoji-rise": variant === "stage"
                  ? `-${(BURST_HEIGHT_DVH * particle.rise).toFixed(1)}dvh`
                  : `${Math.round((burst.rise ?? -260) * particle.rise)}px`,
              } as CSSProperties}
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

"use client";

import { MessageSquare, Send } from "lucide-react";
import { useId, useState, type CSSProperties } from "react";
import { MAX_CHAT } from "../../lib/room-state";

export type ChatMessage = { id: number; text: string; from: string; at: number; lane: number; top?: number };

/** How long a message takes to cross the screen, and how long it stays in the phone's list. */
export const CHAT_FLIGHT_MS = 9000;
export const CHAT_LANES = 6;
export const CHAT_LOG_SIZE = 8;

/**
 * Messages flying across the screen, the way live streams in China show comments. On a shared TV they cross the video
 * itself; on a page where everyone has their own small player they cross the whole window but skip the video.
 */
export function ChatFlights({ messages, variant = "stage" }: { messages: ChatMessage[]; variant?: "stage" | "page" }) {
  if (messages.length === 0) return null;
  return (
    <div className={`chat-flights chat-flights-${variant}`} aria-hidden="true">
      {messages.map((message) => (
        <span
          key={message.id}
          className="chat-flight"
          style={{
            top: variant === "page" ? `${message.top ?? 16}px` : `${8 + message.lane * 11}%`,
            animationDuration: `${CHAT_FLIGHT_MS}ms`,
          } as CSSProperties}
        >
          <b>{message.from}</b> {message.text}
        </span>
      ))}
    </div>
  );
}

/**
 * Picks a height for a message on a page where a video must stay clear: anywhere in the window except the band the
 * player occupies.
 */
export function pickFlightTop(avoid: DOMRect | null) {
  const height = window.innerHeight;
  const margin = 56;
  const bands: [number, number][] = [];
  if (!avoid || avoid.bottom <= 0 || avoid.top >= height) {
    bands.push([8, height - margin]);
  } else {
    if (avoid.top > margin + 16) bands.push([8, avoid.top - margin]);
    if (avoid.bottom < height - margin - 16) bands.push([avoid.bottom + 8, height - margin]);
    if (bands.length === 0) bands.push([8, Math.max(16, height - margin)]);
  }
  const [start, end] = bands[Math.floor(Math.random() * bands.length)];
  return Math.round(start + Math.random() * Math.max(0, end - start));
}

export function ChatBar({ onSend, compact = false }: { onSend: (text: string) => void; compact?: boolean }) {
  const inputId = useId();
  const [text, setText] = useState("");

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = text.trim();
    if (!message) return;
    onSend(message);
    setText("");
  }

  return (
    <form className={`chat-bar${compact ? " chat-bar-compact" : ""}`} onSubmit={submit}>
      <label htmlFor={inputId} className="sr-only">ข้อความที่จะวิ่งบนจอ</label>
      <input
        id={inputId}
        className="field"
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={MAX_CHAT}
        placeholder="พิมพ์ข้อความส่งขึ้นจอ…"
        enterKeyHint="send"
      />
      <button type="submit" className="btn btn-primary btn-icon" disabled={!text.trim()} aria-label="ส่งข้อความขึ้นจอ">
        <Send size={18} aria-hidden="true" />
      </button>
    </form>
  );
}

/** The phone has no big screen to fly messages across, so it keeps a short list instead. */
export function ChatLog({ messages, selfName }: { messages: ChatMessage[]; selfName: string }) {
  if (messages.length === 0) {
    return <p className="chat-log-empty"><MessageSquare size={15} aria-hidden="true" /> ข้อความที่ส่งจะวิ่งบนจอกลาง</p>;
  }
  return (
    <ul className="chat-log">
      {messages.map((message) => (
        <li key={message.id}>
          <b>{message.from === selfName ? "คุณ" : message.from}</b> {message.text}
        </li>
      ))}
    </ul>
  );
}

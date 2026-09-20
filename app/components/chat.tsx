"use client";

import { MessageSquare, Send } from "lucide-react";
import { useId, useState, type CSSProperties } from "react";
import { MAX_CHAT } from "../../lib/room-state";

export type ChatMessage = { id: number; text: string; from: string; at: number; lane: number };

/** How long a message takes to cross the screen, and how long it stays in the phone's list. */
export const CHAT_FLIGHT_MS = 9000;
export const CHAT_LANES = 6;
export const CHAT_LOG_SIZE = 8;

/** Messages flying across the screen, the way live streams in China show comments. */
export function ChatFlights({ messages }: { messages: ChatMessage[] }) {
  if (messages.length === 0) return null;
  return (
    <div className="chat-flights" aria-hidden="true">
      {messages.map((message) => (
        <span
          key={message.id}
          className="chat-flight"
          style={{ top: `${8 + message.lane * 11}%`, animationDuration: `${CHAT_FLIGHT_MS}ms` } as CSSProperties}
        >
          <b>{message.from}</b> {message.text}
        </span>
      ))}
    </div>
  );
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

"use client";

import { Check, Copy, Headphones, HelpCircle } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { MAX_VOICE_ROOM, type RoomIntent } from "../../lib/room-state";

/**
 * Jamulus carries the singing; this room carries the song. Jamulus has no link a browser can open, so the most a
 * room can do is hand everyone the same address to paste, and say the four settings that matter.
 */
export function VoiceRoomCard({ address, compact = false }: { address: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeoutId = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  if (!address) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      // The address is on screen anyway.
    }
  }

  return (
    <div className={`voice-room${compact ? " is-compact" : ""}`}>
      <p className="voice-room-head"><Headphones size={16} aria-hidden="true" /> ห้องเสียงสำหรับร้องพร้อมกัน</p>
      <div className="voice-room-address">
        <code>{address}</code>
        <button type="button" className="btn btn-honey btn-sm" onClick={copy}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
      </div>
      <small>เปิดแอป Jamulus → Connection Setup → วางที่อยู่นี้ → Connect (ใส่หูฟังก่อนเสมอ)</small>
      <a className="voice-room-help" href="/jamulus" target="_blank" rel="noopener noreferrer">
        <HelpCircle size={14} aria-hidden="true" /> วิธีตั้งค่าครั้งแรก
      </a>
    </div>
  );
}

/** The host types the address once; everyone else gets it on their own screen. */
export function VoiceRoomField({ value, dispatch }: { value: string; dispatch: (intent: RoomIntent) => void }) {
  const fieldId = useId();
  const [draft, setDraft] = useState(value);
  const [touched, setTouched] = useState(false);
  const shown = touched ? draft : value;
  const bad = shown.trim() !== "" && !/^[a-z0-9.-]{1,60}(:\d{1,5})?$/i.test(shown.trim().replace(/^jamulus:\/\//i, ""));

  return (
    <div className="party-row">
      <label htmlFor={fieldId}><Headphones size={16} aria-hidden="true" /> ห้องเสียง (Jamulus)</label>
      <input
        id={fieldId}
        className="field"
        value={shown}
        maxLength={MAX_VOICE_ROOM}
        placeholder="เช่น jam.example.com:22124"
        inputMode="url"
        autoComplete="off"
        onChange={(event) => {
          setTouched(true);
          setDraft(event.target.value);
        }}
        onBlur={() => {
          setTouched(false);
          dispatch({ kind: "voiceRoom", address: draft });
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          setTouched(false);
          dispatch({ kind: "voiceRoom", address: draft });
        }}
      />
      <small className={bad ? "is-error" : undefined}>
        {bad
          ? "ใส่เป็นที่อยู่เซิร์ฟเวอร์อย่างเดียว เช่น jam.example.com:22124"
          : "ใส่ที่อยู่เซิร์ฟเวอร์ Jamulus แล้วทุกคนในห้องจะเห็นที่อยู่เดียวกัน พร้อมปุ่มคัดลอก — เว้นว่างไว้ถ้าไม่ใช้"}
      </small>
      <a className="voice-room-help" href="/jamulus" target="_blank" rel="noopener noreferrer">
        <HelpCircle size={14} aria-hidden="true" /> ห้องเสียงคืออะไร ตั้งยังไง
      </a>
    </div>
  );
}

"use client";

import { ClipboardPaste, ListPlus, Pause, Play, Search, SkipForward, Trash } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { QueueItem, RoomIntent, RoomState } from "../../lib/room-state";
import { parseYouTubeId } from "../../lib/youtube";
import type { AddVideoResult } from "./room-model";
import { EmptyNote, VideoThumb } from "./ui";

export function AddVideoForm({
  onAdd,
  label = "ลิงก์ YouTube",
  submitLabel = "เข้าคิว",
  compact = false,
}: {
  onAdd: (input: string) => Promise<AddVideoResult>;
  label?: string;
  submitLabel?: string;
  compact?: boolean;
}) {
  const inputId = useId();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AddVideoResult | null>(null);
  const valid = parseYouTubeId(value) !== null;

  useEffect(() => {
    if (!result) return;
    const timeoutId = window.setTimeout(() => setResult(null), 4500);
    return () => window.clearTimeout(timeoutId);
  }, [result]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!valid) {
      setResult({ ok: false, message: "วางลิงก์ YouTube ก่อนนะ เช่น https://youtu.be/…" });
      return;
    }
    setBusy(true);
    const outcome = await onAdd(value);
    setBusy(false);
    setResult(outcome);
    if (outcome.ok) setValue("");
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setValue(text.trim());
    } catch {
      setResult({ ok: false, message: "เบราว์เซอร์ไม่ให้อ่านคลิปบอร์ด ลองกดค้างในช่องแล้วเลือก “วาง”" });
    }
  }

  return (
    <form className={`add-form${compact ? " add-form-compact" : ""}`} onSubmit={submit}>
      <label htmlFor={inputId} className={compact ? "sr-only" : "field-label"}>{label}</label>
      <div className="add-row">
        <input
          id={inputId}
          className="field"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="วางลิงก์ YouTube ที่นี่"
          inputMode="url"
          autoComplete="off"
          enterKeyHint="send"
        />
        {!compact && (
          <button type="button" className="btn btn-secondary btn-icon" onClick={paste} aria-label="วางลิงก์จากคลิปบอร์ด" title="วางจากคลิปบอร์ด">
            <ClipboardPaste size={18} aria-hidden="true" />
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy || !value.trim()}>
          {busy ? <span className="spinner" aria-hidden="true" /> : <ListPlus size={18} aria-hidden="true" />}
          <span className={compact ? "sr-only" : undefined}>{submitLabel}</span>
        </button>
      </div>
      {result && <p className={`form-note ${result.ok ? "is-ok" : "is-error"}`} role="status">{result.message}</p>}
    </form>
  );
}

export function YouTubeSearch({ karaoke }: { karaoke: boolean }) {
  const inputId = useId();
  const [query, setQuery] = useState("");

  function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = query.trim();
    if (!text) return;
    const q = karaoke && !/karaoke|คาราโอเกะ/i.test(text) ? `${text} karaoke` : text;
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, "_blank", "noopener");
  }

  return (
    <form className="add-form" onSubmit={search}>
      <label htmlFor={inputId} className="field-label">ยังไม่มีลิงก์? ค้นใน YouTube แล้วกดแชร์ › คัดลอกลิงก์</label>
      <div className="add-row">
        <input
          id={inputId}
          className="field"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={karaoke ? "ชื่อเพลง หรือศิลปิน" : "ค้นหาวิดีโอ"}
          enterKeyHint="search"
        />
        <button type="submit" className="btn btn-secondary" disabled={!query.trim()}>
          <Search size={18} aria-hidden="true" /> ค้นหา
        </button>
      </div>
    </form>
  );
}

export function PlaybackButtons({ state, dispatch, size = "md" }: {
  state: RoomState;
  dispatch: (intent: RoomIntent) => void;
  size?: "md" | "lg";
}) {
  const className = size === "lg" ? "btn-round btn-round-lg" : "btn-round";
  return (
    <div className="playback-buttons">
      <button
        type="button"
        className={`btn btn-primary ${className}`}
        onClick={() => dispatch({ kind: state.isPlaying ? "pause" : "play" })}
        disabled={!state.nowPlaying}
        aria-label={state.isPlaying ? "หยุดชั่วคราว" : "เล่น"}
      >
        {state.isPlaying ? <Pause size={20} fill="currentColor" aria-hidden="true" /> : <Play size={20} fill="currentColor" aria-hidden="true" />}
      </button>
      <button
        type="button"
        className={`btn btn-secondary ${className}`}
        onClick={() => dispatch({ kind: "next" })}
        disabled={!state.nowPlaying && state.queue.length === 0}
        aria-label="ข้ามไปเพลงถัดไป"
      >
        <SkipForward size={20} fill="currentColor" aria-hidden="true" />
      </button>
    </div>
  );
}

export function QueueList({
  items,
  selfName,
  isHost,
  dispatch,
  limit,
  emptyText = "ยังไม่มีคิวถัดไป",
}: {
  items: QueueItem[];
  selfName: string;
  isHost: boolean;
  dispatch: (intent: RoomIntent) => void;
  limit?: number;
  emptyText?: string;
}) {
  if (items.length === 0) return <EmptyNote art="clipboard">{emptyText}</EmptyNote>;
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <>
      <ol className="queue-list">
        {shown.map((item, index) => (
          <li key={item.id} className="queue-item">
            <span className="queue-index" aria-hidden="true">{index + 1}</span>
            <VideoThumb videoId={item.videoId} />
            <span className="queue-copy">
              <strong>{item.title}</strong>
              <small>
                {item.addedBy === selfName && <em className="tag">ของคุณ</em>}
                {item.addedBy}
              </small>
            </span>
            {isHost && (
              <span className="queue-actions">
                <button type="button" className="icon-btn" onClick={() => dispatch({ kind: "jump", itemId: item.id })} aria-label={`เล่น ${item.title} ตอนนี้`} title="เล่นตอนนี้">
                  <Play size={16} aria-hidden="true" />
                </button>
                <button type="button" className="icon-btn" onClick={() => dispatch({ kind: "remove", itemId: item.id })} aria-label={`เอา ${item.title} ออกจากคิว`} title="เอาออก">
                  <Trash size={16} aria-hidden="true" />
                </button>
              </span>
            )}
          </li>
        ))}
      </ol>
      {items.length > shown.length && <p className="queue-more">และอีก {items.length - shown.length} เพลงในคิว</p>}
    </>
  );
}

"use client";

import { Minus, Plus, RotateCcw, Timer } from "lucide-react";
import { useEffect, useId, useState } from "react";

const OFFSET_KEY = "sidewave-sync-offset";
/** Screen-share delay is rarely over a couple of seconds, but the room does not need to argue about it. */
export const OFFSET_RANGE = 5;
const OFFSET_NUDGE = 0.1;

function clampOffset(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-OFFSET_RANGE, Math.min(OFFSET_RANGE, Math.round(value * 100) / 100));
}

export function formatOffset(offset: number) {
  if (offset === 0) return "0 วิ";
  return `${offset > 0 ? "+" : "−"}${Math.abs(offset).toFixed(2).replace(/\.?0+$/, "")} วิ`;
}

/**
 * How far ahead of the host this device plays, in seconds. It lives on the device, not in the room: everyone
 * watching a shared screen (Discord, Meet, a TV over a call) has their own delay to cancel.
 */
export function useSyncOffset() {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const saved = Number(window.localStorage.getItem(OFFSET_KEY));
        if (saved) setOffset(clampOffset(saved));
      } catch {
        // Starting in step with the host is a fine default.
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const change = (value: number) => {
    const next = clampOffset(value);
    setOffset(next);
    try {
      window.localStorage.setItem(OFFSET_KEY, String(next));
    } catch {
      // Remembering it is a convenience only.
    }
  };

  return { offset, change };
}

/** Watch mode, guests: line this player up with a screen someone else is sharing. */
export function SyncOffsetControl({ offset, onChange }: { offset: number; onChange: (value: number) => void }) {
  const sliderId = useId();
  return (
    <div className="sync-offset">
      <label htmlFor={sliderId}>
        <Timer size={15} aria-hidden="true" /> ชดเชยดีเลย์จอแชร์
        <strong>{formatOffset(offset)}</strong>
      </label>
      <div className="sync-offset-row">
        <button type="button" className="icon-btn" onClick={() => onChange(offset - OFFSET_NUDGE)} aria-label="ช้าลง 0.1 วินาที">
          <Minus size={16} aria-hidden="true" />
        </button>
        <input
          id={sliderId}
          type="range"
          min={-OFFSET_RANGE}
          max={OFFSET_RANGE}
          step={0.05}
          value={offset}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <button type="button" className="icon-btn" onClick={() => onChange(offset + OFFSET_NUDGE)} aria-label="เร็วขึ้น 0.1 วินาที">
          <Plus size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" onClick={() => onChange(0)} aria-label="กลับไปตรงกับโฮสต์" title="ตรงกับโฮสต์">
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      </div>
      <small>
        {offset === 0
          ? "ดูผ่านจอแชร์ เช่น Discord แล้วภาพมาช้ากว่าเสียงของคุณ? เลื่อนขวาให้เครื่องนี้เล่นล่วงหน้า"
          : offset > 0
            ? `เครื่องนี้เล่นล่วงหน้าโฮสต์ ${formatOffset(offset)} ค่านี้อยู่เฉพาะเครื่องนี้`
            : `เครื่องนี้เล่นตามหลังโฮสต์ ${formatOffset(Math.abs(offset))} ค่านี้อยู่เฉพาะเครื่องนี้`}
      </small>
    </div>
  );
}

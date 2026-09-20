"use client";

import { HelpCircle, Minus, Plus, RotateCcw, Timer } from "lucide-react";
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

/**
 * Line this screen up with the room. A guest moves their own player; the host cannot — every screen follows the
 * host — so for the host the room moves instead, which is what late headphones on the host's head need.
 */
export function SyncOffsetControl({ offset, onChange, isHost = false }: {
  offset: number;
  onChange: (value: number) => void;
  isHost?: boolean;
}) {
  const sliderId = useId();
  return (
    <div className="sync-offset">
      <label htmlFor={sliderId}>
        <Timer size={15} aria-hidden="true" /> ปรับหน่วงเวลา
        <strong>{formatOffset(offset)}</strong>
      </label>
      <div className="sync-offset-row">
        <button type="button" className="icon-btn" onClick={() => onChange(offset - OFFSET_NUDGE)} aria-label="ตามหลังอีก 0.1 วินาที" title="ตามหลัง">
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
        <button type="button" className="icon-btn" onClick={() => onChange(offset + OFFSET_NUDGE)} aria-label="ล่วงหน้าอีก 0.1 วินาที" title="ล่วงหน้า">
          <Plus size={16} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" onClick={() => onChange(0)} aria-label="กลับไปตรงกับโฮสต์" title="ตรงกับโฮสต์">
          <RotateCcw size={16} aria-hidden="true" />
        </button>
      </div>
      <small>
        {offset === 0
          ? isHost
            ? "ใส่หูฟังบลูทูธแล้วเสียงถึงหูช้ากว่าคนอื่น? เลื่อนขวา แล้วห้องจะเลื่อนมาตรงกับหูคุณเอง"
            : "ไม่ตรงกับคนอื่น? ดูจอที่เขาแชร์แล้วภาพมาช้า เลื่อนซ้าย · ใส่หูฟังบลูทูธแล้วเสียงมาช้า เลื่อนขวา"
          : isHost
            ? `ห้องเล่น${offset > 0 ? "ตามหลัง" : "ล่วงหน้า"}จอนี้ ${formatOffset(Math.abs(offset))} — ขยับให้ตรงกับหูของคุณ`
            : `เครื่องนี้เล่น${offset > 0 ? "ล่วงหน้า" : "ตามหลัง"}ห้อง ${formatOffset(Math.abs(offset))} — ค่านี้อยู่เฉพาะเครื่องนี้`}
      </small>
      <a className="sync-offset-help" href="/discord" target="_blank" rel="noopener noreferrer">
        <HelpCircle size={14} aria-hidden="true" /> วิธีดูด้วยกันผ่าน Discord
      </a>
    </div>
  );
}

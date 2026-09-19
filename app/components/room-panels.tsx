"use client";

import { QRCodeSVG } from "qrcode.react";
import {
  AArrowDown, AArrowUp, Check, Copy, Crown, Maximize, Maximize2, Mic, Minus, MonitorPlay, Plus, QrCode, RotateCcw, Tv,
  UserRound,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { RealtimeStatus, RoomMember } from "../../lib/room-realtime";
import { formatKey, KEY_RANGE, MAX_NOTES, type RoomIntent, type RoomMode } from "../../lib/room-state";
import { MODE_LABELS, type RoomModel } from "./room-model";
import { Art, Avatar, Brand, Dialog, EmptyNote } from "./ui";

const MODE_ICONS: Record<RoomMode, typeof Tv> = { watch: MonitorPlay, remote: Tv, karaoke: Mic };

const STATUS_TEXT: Record<RealtimeStatus, string> = {
  connected: "ออนไลน์",
  connecting: "กำลังเชื่อมต่อ",
  disabled: "โหมดทดลอง",
  error: "การเชื่อมต่อสะดุด",
  "room-not-found": "ไม่พบห้อง",
};

export function RoomHeader({
  model,
  onHome,
  onInvite,
  onRename,
  onModeChange,
  onFullscreen,
}: {
  model: RoomModel;
  onHome: () => void;
  onInvite: () => void;
  onRename: () => void;
  onModeChange: (mode: RoomMode) => void;
  onFullscreen?: () => void;
}) {
  const { state, isHost, status, roomCode } = model;
  const ModeIcon = MODE_ICONS[state.mode];
  return (
    <header className="room-header">
      <Brand onClick={onHome} />
      <span className="room-code" title={STATUS_TEXT[status]}>
        <span className={`status-dot status-${status}`} aria-hidden="true" />
        <span className="room-code-text">{roomCode}</span>
        <span className="room-status">{STATUS_TEXT[status]}</span>
      </span>
      {isHost ? (
        <div className="mode-switch" role="radiogroup" aria-label="โหมดของห้อง">
          {(Object.keys(MODE_LABELS) as RoomMode[]).map((mode) => {
            const Icon = MODE_ICONS[mode];
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={state.mode === mode}
                aria-label={MODE_LABELS[mode].name}
                className={state.mode === mode ? "is-active" : undefined}
                onClick={() => onModeChange(mode)}
                title={MODE_LABELS[mode].description}
              >
                <Icon size={16} aria-hidden="true" />
                <span>{MODE_LABELS[mode].short}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <span className="pill mode-pill" title={`โหมด${MODE_LABELS[state.mode].name}`}>
          <ModeIcon size={16} aria-hidden="true" /> <span className="mode-pill-label">{MODE_LABELS[state.mode].name}</span>
        </span>
      )}
      <div className="header-actions">
        <button type="button" className="icon-btn" onClick={onInvite} aria-label="ชวนเพื่อน / QR" title="ชวนเพื่อน">
          <QrCode size={19} aria-hidden="true" />
        </button>
        <button type="button" className="icon-btn" onClick={onRename} aria-label="เปลี่ยนชื่อที่แสดง" title="เปลี่ยนชื่อ">
          <UserRound size={19} aria-hidden="true" />
        </button>
        {onFullscreen && (
          <button type="button" className="icon-btn" onClick={onFullscreen} aria-label="เต็มจอ" title="เต็มจอ">
            <Maximize size={19} aria-hidden="true" />
          </button>
        )}
      </div>
    </header>
  );
}

export function MemberList({ members, selfId, selfName, selfIsHost }: {
  members: RoomMember[];
  selfId: string | null;
  selfName: string;
  selfIsHost: boolean;
}) {
  // Presence has not arrived yet (or the room runs without realtime): show this person alone.
  const list = members.length ? members : [{ id: selfId ?? "self", name: selfName, isHost: selfIsHost }];
  const sorted = [...list].sort((a, b) => Number(b.isHost) - Number(a.isHost));
  return (
    <ul className="member-list">
      {sorted.map((member) => (
        <li key={member.id}>
          <Avatar name={member.name} tone={member.isHost ? "gold" : "honey"} />
          <span className="member-name">{member.name}</span>
          {(member.id === selfId || !members.length) && <em className="tag">คุณ</em>}
          {member.isHost && <span className="host-badge"><Crown size={14} aria-hidden="true" /> โฮสต์</span>}
        </li>
      ))}
    </ul>
  );
}

export function NotesPanel({
  notes,
  editable,
  dispatch,
  onExpand,
}: {
  notes: string;
  editable: boolean;
  dispatch: (intent: RoomIntent) => void;
  onExpand: () => void;
}) {
  const inputId = useId();
  return (
    <section className="card notes-card" aria-labelledby={`${inputId}-title`}>
      <div className="card-head">
        <h2 id={`${inputId}-title`}>โน้ต &amp; เนื้อเพลง</h2>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onExpand}>
          <Maximize2 size={16} aria-hidden="true" /> ขยาย
        </button>
      </div>
      {editable ? (
        <>
          <label htmlFor={inputId} className="sr-only">โน้ตถึงทุกคนในห้อง</label>
          <textarea
            id={inputId}
            className="notes-input"
            value={notes}
            maxLength={MAX_NOTES}
            onChange={(event) => dispatch({ kind: "notes", text: event.target.value })}
            placeholder={"แปะเนื้อเพลง ลิงก์ หรือโน้ตถึงทุกคนในห้อง…\nทุกคนเห็นทันที และกด “ขยาย” เพื่ออ่านตัวใหญ่"}
          />
          <p className="notes-meta">เฉพาะโฮสต์แก้ไขได้ · {notes.length.toLocaleString("th-TH")}/{MAX_NOTES.toLocaleString("th-TH")} ตัวอักษร</p>
        </>
      ) : notes.trim() ? (
        <div className="notes-text" tabIndex={0}>{notes}</div>
      ) : (
        <EmptyNote art="notebook">โฮสต์ยังไม่ได้แปะเนื้อเพลงหรือโน้ต</EmptyNote>
      )}
    </section>
  );
}

const NOTE_SIZES = [20, 26, 32, 40, 52];

export function NotesDialog({
  notes,
  editable,
  dispatch,
  onClose,
}: {
  notes: string;
  editable: boolean;
  dispatch: (intent: RoomIntent) => void;
  onClose: () => void;
}) {
  const [sizeIndex, setSizeIndex] = useState(2);
  return (
    <Dialog labelledBy="notes-dialog-title" onClose={onClose} className="dialog-wide">
      <div className="notes-dialog-head">
        <h2 id="notes-dialog-title">โน้ต &amp; เนื้อเพลง</h2>
        <div className="size-control" role="group" aria-label="ขนาดตัวอักษร">
          <button type="button" className="icon-btn" onClick={() => setSizeIndex((index) => Math.max(0, index - 1))} disabled={sizeIndex === 0} aria-label="ตัวอักษรเล็กลง">
            <AArrowDown size={20} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" onClick={() => setSizeIndex((index) => Math.min(NOTE_SIZES.length - 1, index + 1))} disabled={sizeIndex === NOTE_SIZES.length - 1} aria-label="ตัวอักษรใหญ่ขึ้น">
            <AArrowUp size={20} aria-hidden="true" />
          </button>
        </div>
      </div>
      {editable ? (
        <textarea
          className="notes-input notes-large"
          style={{ fontSize: NOTE_SIZES[sizeIndex] }}
          value={notes}
          maxLength={MAX_NOTES}
          onChange={(event) => dispatch({ kind: "notes", text: event.target.value })}
          aria-label="โน้ตถึงทุกคนในห้อง"
          placeholder="แปะเนื้อเพลงหรือโน้ตที่นี่"
        />
      ) : (
        <div className="notes-text notes-large" style={{ fontSize: NOTE_SIZES[sizeIndex] }} tabIndex={0}>
          {notes.trim() || "โฮสต์ยังไม่ได้แปะเนื้อเพลงหรือโน้ต"}
        </div>
      )}
    </Dialog>
  );
}

export function KeyControl({ value, dispatch, large = false }: {
  value: number;
  dispatch: (intent: RoomIntent) => void;
  large?: boolean;
}) {
  return (
    <div className={`key-control${large ? " key-control-lg" : ""}`}>
      <div className="key-row">
        <button type="button" className="btn btn-secondary key-btn" onClick={() => dispatch({ kind: "key", step: -1 })} disabled={value <= -KEY_RANGE} aria-label="ลดคีย์ครึ่งเสียง">
          <Minus size={large ? 28 : 20} aria-hidden="true" />
          {large && <span>ลดคีย์</span>}
        </button>
        <p className="key-value" aria-live="polite">
          <small>คีย์</small>
          <strong>{formatKey(value)}</strong>
        </p>
        <button type="button" className="btn btn-secondary key-btn" onClick={() => dispatch({ kind: "key", step: 1 })} disabled={value >= KEY_RANGE} aria-label="เพิ่มคีย์ครึ่งเสียง">
          <Plus size={large ? 28 : 20} aria-hidden="true" />
          {large && <span>เพิ่มคีย์</span>}
        </button>
      </div>
      <button type="button" className="key-reset" onClick={() => dispatch({ kind: "key", step: 0 })} disabled={value === 0}>
        <RotateCcw size={15} aria-hidden="true" /> กลับคีย์ต้นฉบับ
      </button>
    </div>
  );
}

export function RoomQr({ url, size }: { url: string; size: number }) {
  return (
    <span className="qr-frame">
      <QRCodeSVG value={url} size={size} bgColor="#FFFFFF" fgColor="#2A1010" level="M" marginSize={1} title="QR เข้าห้อง" />
    </span>
  );
}

export function InviteDialog({ model, onClose }: { model: RoomModel; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeoutId = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(model.inviteUrl);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the link stays visible and selectable.
    }
  }

  const remote = model.state.mode !== "watch";
  return (
    <Dialog labelledBy="invite-title" onClose={onClose}>
      <Art name="envelope" className="dialog-bear" sizes="96px" />
      <h2 id="invite-title" className="dialog-title">ชวนเพื่อนเข้าห้อง</h2>
      <p className="dialog-text">
        {remote ? "สแกนด้วยมือถือเพื่อใช้เป็นรีโมท เพิ่มเพลงเข้าคิวได้ทันที ไม่ต้องสมัคร" : "สแกน QR หรือส่งลิงก์ให้เพื่อน ทุกคนจะดูวิดีโอเดียวกันพร้อมกัน"}
      </p>
      <div className="invite-qr"><RoomQr url={model.inviteUrl} size={208} /></div>
      <div className="invite-link">
        <span>{model.inviteUrl}</span>
        <button type="button" className="btn btn-honey btn-sm" onClick={copy}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          {copied ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
      </div>
      <p className="invite-code">รหัสห้อง <strong>{model.roomCode}</strong></p>
    </Dialog>
  );
}

export function NameDialog({ name, onSave, onClose }: { name: string; onSave: (name: string) => void; onClose: () => void }) {
  const [draft, setDraft] = useState(name);
  return (
    <Dialog labelledBy="name-title" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const next = draft.trim().replace(/\s+/g, " ").slice(0, 32);
          if (next) onSave(next);
        }}
      >
        <Art name="hello" className="dialog-bear" sizes="96px" />
        <h2 id="name-title" className="dialog-title">ให้ทุกคนเรียกคุณว่าอะไรดี?</h2>
        <p className="dialog-text">ชื่อนี้จะโชว์ในรายชื่อสมาชิกและข้างเพลงที่คุณเพิ่ม</p>
        <label htmlFor="listener-name" className="field-label">ชื่อที่แสดง</label>
        <input id="listener-name" className="field" value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={32} placeholder="เช่น ต้น" autoFocus />
        <button type="submit" className="btn btn-primary btn-block" disabled={!draft.trim()}>บันทึกชื่อ</button>
      </form>
    </Dialog>
  );
}

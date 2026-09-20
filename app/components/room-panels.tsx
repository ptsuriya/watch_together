"use client";

import { QRCodeSVG } from "qrcode.react";
import {
  AArrowDown, AArrowUp, Check, Copy, Crown, Maximize, Maximize2, Mic, Minus, MonitorPlay, Plus, QrCode, RotateCcw, Tv,
  MessageSquare, MessageSquareOff, NotebookPen, NotebookText, ShieldCheck, ShieldOff, UserRound, UsersRound,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { RealtimeStatus, RoomMember } from "../../lib/room-realtime";
import {
  CROSSFADE_OPTIONS, formatKey, KEY_CONTROL_OPTIONS, KEY_RANGE, KEY_UNIT, MAX_NOTES,
  type KeyControl as KeyControlMode, type KeyStep, type RoomIntent, type RoomMode,
} from "../../lib/room-state";
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

export function MemberList({ members, selfId, selfName, selfIsHost, cohosts = [], onToggleCohost }: {
  members: RoomMember[];
  selfId: string | null;
  selfName: string;
  selfIsHost: boolean;
  cohosts?: string[];
  /** Only the host gets this: hand the run of the room to someone, or take it back. */
  onToggleCohost?: (memberId: string, enabled: boolean) => void;
}) {
  // Presence has not arrived yet (or the room runs without realtime): show this person alone.
  const list = members.length ? members : [{ id: selfId ?? "self", name: selfName, isHost: selfIsHost }];
  const sorted = [...list].sort((a, b) => Number(b.isHost) - Number(a.isHost));
  return (
    <ul className="member-list">
      {sorted.map((member) => {
        const cohost = cohosts.includes(member.id);
        return (
          <li key={member.id}>
            <Avatar name={member.name} tone={member.isHost ? "gold" : cohost ? "sand" : "honey"} />
            <span className="member-name">{member.name}</span>
            {(member.id === selfId || !members.length) && <em className="tag">คุณ</em>}
            {member.isHost && <span className="host-badge"><Crown size={14} aria-hidden="true" /> โฮสต์</span>}
            {!member.isHost && cohost && <span className="host-badge is-cohost"><ShieldCheck size={14} aria-hidden="true" /> หัวห้องร่วม</span>}
            {onToggleCohost && !member.isHost && (
              <button
                type="button"
                className="icon-btn"
                onClick={() => onToggleCohost(member.id, !cohost)}
                title={cohost ? `ยกเลิกสิทธิ์หัวห้องร่วมของ ${member.name}` : `ให้ ${member.name} เป็นหัวห้องร่วม`}
                aria-label={cohost ? `ยกเลิกสิทธิ์หัวห้องร่วมของ ${member.name}` : `ให้ ${member.name} เป็นหัวห้องร่วม`}
              >
                {cohost ? <ShieldOff size={16} aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

const NOTE_SIZES = [17, 21, 26, 32, 40, 52];
const NOTE_SIZE_KEY = "kuma-notes-size";
/** Notes coming in while someone is typing would move their cursor, so they are adopted during a pause. */
const TYPING_GRACE_MS = 1200;

function useNoteSize() {
  const [index, setIndex] = useState(1);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        const saved = Number(window.localStorage.getItem(NOTE_SIZE_KEY));
        if (Number.isInteger(saved) && saved >= 0 && saved < NOTE_SIZES.length) setIndex(saved);
      } catch {
        // The default size is fine.
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  const change = (step: number) => {
    setIndex((current) => {
      const next = Math.max(0, Math.min(NOTE_SIZES.length - 1, current + step));
      try {
        window.localStorage.setItem(NOTE_SIZE_KEY, String(next));
      } catch {
        // Remembering the size is a convenience only.
      }
      return next;
    });
  };
  return { size: NOTE_SIZES[index], index, change };
}

function useNoteDraft(notes: string, dispatch: (intent: RoomIntent) => void) {
  const [draft, setDraft] = useState(notes);
  const typedAt = useRef(0);

  useEffect(() => {
    if (notes === draft || Date.now() - typedAt.current < TYPING_GRACE_MS) return;
    const timeoutId = window.setTimeout(() => setDraft(notes), 0);
    return () => window.clearTimeout(timeoutId);
  }, [draft, notes]);

  const write = (text: string) => {
    typedAt.current = Date.now();
    setDraft(text);
    dispatch({ kind: "notes", text });
  };
  return [draft, write] as const;
}

function NoteSizeControl({ index, change }: { index: number; change: (step: number) => void }) {
  return (
    <div className="size-control" role="group" aria-label="ขนาดตัวอักษร">
      <button type="button" className="icon-btn" onClick={() => change(-1)} disabled={index === 0} aria-label="ตัวอักษรเล็กลง">
        <AArrowDown size={20} aria-hidden="true" />
      </button>
      <button type="button" className="icon-btn" onClick={() => change(1)} disabled={index === NOTE_SIZES.length - 1} aria-label="ตัวอักษรใหญ่ขึ้น">
        <AArrowUp size={20} aria-hidden="true" />
      </button>
    </div>
  );
}

export function NotesPanel({
  notes,
  isHost,
  canManage,
  shared,
  dispatch,
  onExpand,
}: {
  notes: string;
  isHost: boolean;
  /** The host or a co-host: may edit and may open the notes to everyone. */
  canManage: boolean;
  /** The host lets everyone write in the notes too. */
  shared: boolean;
  dispatch: (intent: RoomIntent) => void;
  onExpand: () => void;
}) {
  const inputId = useId();
  const { size, index, change } = useNoteSize();
  const [draft, write] = useNoteDraft(notes, dispatch);
  const canEdit = canManage || shared;

  return (
    <section className="card notes-card" aria-labelledby={`${inputId}-title`}>
      <div className="card-head">
        <h2 id={`${inputId}-title`}>โน้ต &amp; เนื้อเพลง</h2>
        <div className="notes-tools">
          <NoteSizeControl index={index} change={change} />
          <button type="button" className="btn btn-secondary btn-sm" onClick={onExpand}>
            <Maximize2 size={16} aria-hidden="true" /> ขยาย
          </button>
        </div>
      </div>
      {canManage && (
        <button
          type="button"
          className={`pill notes-toggle${shared ? " is-on" : ""}`}
          aria-pressed={shared}
          onClick={() => dispatch({ kind: "notesShared", shared: !shared })}
        >
          <UsersRound size={16} aria-hidden="true" /> ให้เพื่อนในห้องช่วยเขียน
        </button>
      )}
      {canEdit ? (
        <>
          <label htmlFor={inputId} className="sr-only">โน้ตถึงทุกคนในห้อง</label>
          <textarea
            id={inputId}
            className="notes-input"
            style={{ fontSize: size }}
            value={draft}
            maxLength={MAX_NOTES}
            onChange={(event) => write(event.target.value)}
            placeholder={"แปะเนื้อเพลง ลิงก์ หรือโน้ตถึงทุกคนในห้อง…\nทุกคนเห็นทันที กด A+ ให้ตัวใหญ่ขึ้น หรือกด “ขยาย” เพื่ออ่านเต็มจอ"}
          />
          <p className="notes-meta">
            {canManage && !shared ? "เฉพาะหัวห้องแก้ไขได้" : "ทุกคนในห้องช่วยเขียนได้"} · {draft.length.toLocaleString("th-TH")}/{MAX_NOTES.toLocaleString("th-TH")} ตัวอักษร
          </p>
        </>
      ) : notes.trim() ? (
        <div className="notes-text" style={{ fontSize: size }} tabIndex={0}>{notes}</div>
      ) : (
        <EmptyNote art="notebook">โฮสต์ยังไม่ได้แปะเนื้อเพลงหรือโน้ต</EmptyNote>
      )}
    </section>
  );
}

export function NotesDialog({
  notes,
  canManage,
  shared,
  dispatch,
  onClose,
}: {
  notes: string;
  canManage: boolean;
  shared: boolean;
  dispatch: (intent: RoomIntent) => void;
  onClose: () => void;
}) {
  const { size, index, change } = useNoteSize();
  const [draft, write] = useNoteDraft(notes, dispatch);
  const canEdit = canManage || shared;

  return (
    <Dialog labelledBy="notes-dialog-title" onClose={onClose} className="dialog-wide">
      <div className="notes-dialog-head">
        <h2 id="notes-dialog-title">โน้ต &amp; เนื้อเพลง</h2>
        <NoteSizeControl index={index} change={change} />
      </div>
      {canEdit ? (
        <textarea
          className="notes-input notes-large"
          style={{ fontSize: size }}
          value={draft}
          maxLength={MAX_NOTES}
          onChange={(event) => write(event.target.value)}
          aria-label="โน้ตถึงทุกคนในห้อง"
          placeholder="แปะเนื้อเพลงหรือโน้ตที่นี่"
        />
      ) : (
        <div className="notes-text notes-large" style={{ fontSize: size }} tabIndex={0}>
          {notes.trim() || "โฮสต์ยังไม่ได้แปะเนื้อเพลงหรือโน้ต"}
        </div>
      )}
    </Dialog>
  );
}

export function CrossfadeSelect({ value, dispatch }: { value: number; dispatch: (intent: RoomIntent) => void }) {
  const selectId = useId();
  return (
    <span className="crossfade-select">
      <label htmlFor={selectId}>ครอสเฟด</label>
      <select
        id={selectId}
        className="field"
        value={value}
        onChange={(event) => dispatch({ kind: "crossfade", seconds: Number(event.target.value) })}
      >
        {CROSSFADE_OPTIONS.map((seconds) => (
          <option key={seconds} value={seconds}>{seconds === 0 ? "ปิด" : `${seconds} วิ`}</option>
        ))}
      </select>
    </span>
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
        <button type="button" className="btn btn-secondary key-btn" onClick={() => dispatch({ kind: "key", step: -KEY_UNIT as KeyStep })} disabled={value <= -KEY_RANGE} aria-label="ลดคีย์">
          <Minus size={large ? 28 : 20} aria-hidden="true" />
          {large && <span>ลดคีย์</span>}
        </button>
        <p className="key-value" aria-live="polite">
          <small>คีย์</small>
          <strong>{formatKey(value)}</strong>
        </p>
        <button type="button" className="btn btn-secondary key-btn" onClick={() => dispatch({ kind: "key", step: KEY_UNIT })} disabled={value >= KEY_RANGE} aria-label="เพิ่มคีย์">
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

const KEY_CONTROL_LABELS: Record<KeyControlMode, string> = {
  everyone: "ทุกคนในห้อง",
  owner: "คนที่ขอเพลงนั้น",
  host: "โฮสต์เท่านั้น",
};

export function KeyControlSelect({ value, dispatch }: { value: KeyControlMode; dispatch: (intent: RoomIntent) => void }) {
  const selectId = useId();
  return (
    <span className="crossfade-select">
      <label htmlFor={selectId}>ใครปรับคีย์ได้</label>
      <select id={selectId} className="field" value={value} onChange={(event) => dispatch({ kind: "keyControl", value: event.target.value as KeyControlMode })}>
        {KEY_CONTROL_OPTIONS.map((option) => <option key={option} value={option}>{KEY_CONTROL_LABELS[option]}</option>)}
      </select>
    </span>
  );
}

export function NotesToggle({ enabled, dispatch }: { enabled: boolean; dispatch: (intent: RoomIntent) => void }) {
  return (
    <button
      type="button"
      className={`pill notes-toggle${enabled ? " is-on" : ""}`}
      aria-pressed={enabled}
      onClick={() => dispatch({ kind: "notesOn", enabled: !enabled })}
      title={enabled ? "ซ่อนโน้ตและเนื้อเพลง" : "แสดงโน้ตและเนื้อเพลง"}
    >
      {enabled ? <NotebookText size={16} aria-hidden="true" /> : <NotebookPen size={16} aria-hidden="true" />}
      โน้ต
    </button>
  );
}

export function ChatToggle({ enabled, dispatch }: { enabled: boolean; dispatch: (intent: RoomIntent) => void }) {
  return (
    <button
      type="button"
      className={`pill notes-toggle${enabled ? " is-on" : ""}`}
      aria-pressed={enabled}
      onClick={() => dispatch({ kind: "chat", enabled: !enabled })}
      title={enabled ? "ปิดข้อความวิ่งบนจอ" : "เปิดข้อความวิ่งบนจอ"}
    >
      {enabled ? <MessageSquare size={16} aria-hidden="true" /> : <MessageSquareOff size={16} aria-hidden="true" />}
      ข้อความวิ่ง
    </button>
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

      <div className="invite-members">
        <h3>คนในห้อง</h3>
        <MemberList
          members={model.members}
          selfId={model.selfId}
          selfName={model.selfName}
          selfIsHost={model.isHost}
          cohosts={model.state.cohosts}
          onToggleCohost={model.isHost ? (memberId, enabled) => model.dispatch({ kind: "cohost", memberId, enabled }) : undefined}
        />
        {model.isHost && (
          <p className="invite-hint">
            กดโล่ข้างชื่อเพื่อให้เป็นหัวห้องร่วม คนนั้นจะจัดคิวและตั้งค่าห้องได้เหมือนคุณ ยกเว้นการแต่งตั้งคนอื่น
          </p>
        )}
      </div>
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

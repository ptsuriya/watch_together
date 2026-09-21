"use client";

import { QRCodeSVG } from "qrcode.react";
import {
  AArrowDown, AArrowUp, Check, ChevronDown, Copy, Crown, HelpCircle, Maximize, Maximize2, Mic, MicOff, MicVocal, Minus, MonitorPlay,
  Plus, QrCode, RotateCcw, SlidersHorizontal, Sparkles, Tv, UserMinus,
  MessageSquare, MessageSquareOff, NotebookPen, NotebookText, ShieldCheck, ShieldOff, UserRound, UsersRound,
} from "lucide-react";
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import type { HelperAi } from "../../lib/karaoke-key";
import type { RealtimeStatus, RoomMember } from "../../lib/room-realtime";
import {
  CROSSFADE_OPTIONS, EQ_PRESETS, EQ_RANGE, eqPreset, formatKey, KEY_CONTROL_OPTIONS, KEY_RANGE, KEY_UNIT, MAX_NOTES,
  VOCAL_CUT_OPTIONS,
  type KeyControl as KeyControlMode, type KeyStep, type RoomEq, type RoomIntent, type RoomMode,
} from "../../lib/room-state";
import { canCrossfade } from "../../lib/youtube";
import { MODE_LABELS, type RoomModel } from "./room-model";
import { Art, Avatar, Brand, Dialog, EmptyNote } from "./ui";

const MODE_ICONS: Record<RoomMode, typeof Tv> = { watch: MonitorPlay, remote: Tv, karaoke: Mic, singalong: MicVocal };

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
  onOpenModes,
  onFullscreen,
}: {
  model: RoomModel;
  onHome: () => void;
  onInvite: () => void;
  onRename: () => void;
  onOpenModes: () => void;
  onFullscreen?: () => void;
}) {
  const { state, status, roomCode } = model;
  const ModeIcon = MODE_ICONS[state.mode];
  return (
    <header className="room-header">
      <Brand onClick={onHome} />
      <span className="room-code" title={STATUS_TEXT[status]}>
        <span className={`status-dot status-${status}`} aria-hidden="true" />
        <span className="room-code-text">{roomCode}</span>
        <span className="room-status">{STATUS_TEXT[status]}</span>
      </span>
      {model.canManage ? (
        <button type="button" className="pill mode-pill is-button" onClick={onOpenModes}>
          <ModeIcon size={16} aria-hidden="true" />
          <span className="mode-pill-label">{MODE_LABELS[state.mode].name}</span>
          <ChevronDown size={15} aria-hidden="true" />
        </button>
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

export function MemberList({ members, selfId, selfName, selfIsHost, cohosts = [], onToggleCohost, onKick }: {
  members: RoomMember[];
  selfId: string | null;
  selfName: string;
  selfIsHost: boolean;
  cohosts?: string[];
  /** Only the host gets this: hand the run of the room to someone, or take it back. */
  onToggleCohost?: (memberId: string, enabled: boolean) => void;
  /** Whoever runs the room can show someone the door; the host is never on that list. */
  onKick?: (member: RoomMember) => void;
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
            {onKick && !member.isHost && member.id !== selfId && (
              <button
                type="button"
                className="icon-btn is-danger"
                onClick={() => onKick(member)}
                title={`นำ ${member.name} ออกจากห้อง`}
                aria-label={`นำ ${member.name} ออกจากห้อง`}
              >
                <UserMinus size={16} aria-hidden="true" />
              </button>
            )}
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

const noSubscribe = () => () => {};

export function CrossfadeSelect({ value, dispatch }: { value: number; dispatch: (intent: RoomIntent) => void }) {
  const selectId = useId();
  // Read after hydration: the server has no idea what device this is. It never changes, so nothing to subscribe to.
  const supported = useSyncExternalStore(noSubscribe, canCrossfade, () => true);
  return (
    <span className="crossfade-select">
      <label htmlFor={selectId}>ครอสเฟด{value > 0 && !supported && <em className="hint-off"> จอนี้ต่อแบบตัด</em>}</label>
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

const VOCAL_CUT_LABELS: Record<number, string> = { 0: "ปกติ", 0.5: "ลดครึ่ง", 1: "ตัดออก" };

/** What this screen's extension is doing with the AI, in a line under the control. */
function aiLine(helperAi: HelperAi | null | undefined) {
  if (!helperAi || helperAi.state === "off") return null;
  switch (helperAi.state) {
    case "loading":
      return { tone: "", text: "AI กำลังโหลดบนเครื่องนี้ ระหว่างนี้ใช้แบบเดิมไปก่อน" };
    case "ready":
      return helperAi.delayMs > 0
        ? { tone: "is-ready", text: `AI ตัดเสียงร้องอยู่ · ภาพกับเสียงเครื่องนี้หน่วง ${(helperAi.delayMs / 1000).toFixed(1)} วิ ให้ตรงกัน` }
        : { tone: "is-ready", text: "AI พร้อมบนเครื่องนี้" };
    case "unsupported":
      return { tone: "is-warn", text: "เบราว์เซอร์เครื่องนี้ไม่มี WebGPU ใช้แบบเดิมแทน" };
    case "slow":
      return { tone: "is-warn", text: "การ์ดจอเครื่องนี้ช้าเกินไปสำหรับ AI ใช้แบบเดิมแทน" };
    default:
      return { tone: "is-warn", text: "เปิด AI ไม่สำเร็จ ใช้แบบเดิมแทน ลองรีเฟรชหน้า" };
  }
}

/**
 * Karaoke: how much of the original singer the room wants left, and whether the extension's neural network takes it
 * out (clean, stereo, half a second late on every screen that runs it) or the old L−R trick does. It sits with the key.
 */
export function VocalCutSelect({ value, ai, helperAi, canManage, dispatch }: {
  value: number;
  ai: boolean;
  /** This screen's own extension, where this screen plays the song. */
  helperAi?: HelperAi | null;
  canManage: boolean;
  dispatch: (intent: RoomIntent) => void;
}) {
  const selectId = useId();
  const line = value > 0 && ai ? aiLine(helperAi) : null;
  const status = line ? <p className={`vocal-ai-line ${line.tone}`}>{line.text}</p> : null;
  if (!canManage) {
    if (value === 0) return null;
    return (
      <>
        <p className="hint">ห้องนี้{VOCAL_CUT_LABELS[value]}เสียงร้องต้นฉบับอยู่{ai ? " ด้วย AI" : ""}</p>
        {status}
      </>
    );
  }
  return (
    <div className="vocal-cut">
      <span className="crossfade-select">
        <label htmlFor={selectId}><MicOff size={15} aria-hidden="true" /> เสียงร้องต้นฉบับ</label>
        <select
          id={selectId}
          className="field"
          value={value}
          onChange={(event) => dispatch({ kind: "vocalCut", amount: Number(event.target.value) })}
        >
          {VOCAL_CUT_OPTIONS.map((amount) => <option key={amount} value={amount}>{VOCAL_CUT_LABELS[amount]}</option>)}
        </select>
        <button
          type="button"
          className={`pill vocal-ai-toggle${ai ? " is-on" : ""}`}
          aria-pressed={ai}
          onClick={() => dispatch({ kind: "vocalAi", enabled: !ai })}
          title={ai ? "ตัดด้วย AI: สะอาดกว่า เป็นสเตอริโอ แต่ภาพกับเสียงหน่วงราวครึ่งวินาที" : "ตัดแบบเดิม (L−R): ไม่หน่วง แต่ได้ผลเฉพาะเพลงที่ร้องกลางวง"}
        >
          <Sparkles size={14} aria-hidden="true" /> AI
        </button>
      </span>
      {status}
    </div>
  );
}

const EQ_BANDS = [
  { key: "low", label: "เบส", hz: "90" },
  { key: "lowMid", label: "ทุ้ม", hz: "250" },
  { key: "mid", label: "กลาง", hz: "1k" },
  { key: "highMid", label: "ใส", hz: "3k" },
  { key: "high", label: "แหลม", hz: "8k" },
] as const;

/**
 * Karaoke: presets first, because one tap is what most rooms want; five sliders folded under them for the rest.
 * The extension keeps whatever the bands add from clipping, so a preset can lean hard without crackling.
 */
export function EqControl({ value, canManage, dispatch }: {
  value: RoomEq;
  canManage: boolean;
  dispatch: (intent: RoomIntent) => void;
}) {
  const groupId = useId();
  if (!canManage) return null;
  const preset = eqPreset(value);
  return (
    <div className="eq-control">
      <span className="eq-head"><SlidersHorizontal size={15} aria-hidden="true" /> โทนเสียง</span>
      <div className="eq-presets" role="radiogroup" aria-label="โทนเสียง">
        {EQ_PRESETS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={preset?.id === option.id}
            className={`chip-btn${preset?.id === option.id ? " is-on" : ""}`}
            onClick={() => dispatch({ kind: "eq", eq: option.eq })}
          >
            {option.label}
          </button>
        ))}
      </div>
      <details className="eq-custom" open={!preset}>
        <summary>
          ปรับเอง
          {!preset && <strong>{EQ_BANDS.map((band) => `${value[band.key] > 0 ? "+" : ""}${value[band.key]}`).join(" ")}</strong>}
        </summary>
        {EQ_BANDS.map((band) => (
          <label key={band.key} className="eq-band" htmlFor={`${groupId}-${band.key}`}>
            <span>{band.label}<small>{band.hz}</small></span>
            <input
              id={`${groupId}-${band.key}`}
              type="range"
              min={-EQ_RANGE}
              max={EQ_RANGE}
              step={1}
              value={value[band.key]}
              onChange={(event) => dispatch({ kind: "eq", eq: { ...value, [band.key]: Number(event.target.value) } })}
            />
            <em>{value[band.key] > 0 ? `+${value[band.key]}` : value[band.key]}</em>
          </label>
        ))}
      </details>
    </div>
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

/** Changing the room's mode, described rather than guessed from an icon. */
export function ModeDialog({ mode, onPick, onClose }: {
  mode: RoomMode;
  onPick: (mode: RoomMode) => void;
  onClose: () => void;
}) {
  return (
    <Dialog labelledBy="mode-title" onClose={onClose}>
      <h2 id="mode-title" className="dialog-title">โหมดของห้อง</h2>
      <p className="dialog-text">เปลี่ยนได้ตลอด ทุกคนในห้องจะเปลี่ยนตามทันที เพลงที่เล่นอยู่ไม่หลุด</p>
      <div className="mode-list">
        {(Object.keys(MODE_LABELS) as RoomMode[]).map((option) => {
          const Icon = MODE_ICONS[option];
          const active = option === mode;
          return (
            <button
              key={option}
              type="button"
              className={`mode-option${active ? " is-active" : ""}`}
              aria-current={active}
              onClick={() => {
                if (!active) onPick(option);
                onClose();
              }}
            >
              <span className="mode-icon"><Icon size={22} aria-hidden="true" /></span>
              <span className="mode-copy">
                <strong>{MODE_LABELS[option].name}</strong>
                <small>{MODE_LABELS[option].description}</small>
              </span>
              <span className="mode-check" aria-hidden="true">{active && <Check size={16} strokeWidth={3} />}</span>
            </button>
          );
        })}
      </div>
    </Dialog>
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
      <a className="invite-guide" href="/discord" target="_blank" rel="noopener noreferrer">
        <HelpCircle size={15} aria-hidden="true" /> ดูด้วยกันผ่าน Discord ทำยังไง
      </a>

      <div className="invite-members">
        <h3>คนในห้อง</h3>
        <MemberList
          members={model.members}
          selfId={model.selfId}
          selfName={model.selfName}
          selfIsHost={model.isHost}
          cohosts={model.state.cohosts}
          onToggleCohost={model.isHost ? (memberId, enabled) => model.dispatch({ kind: "cohost", memberId, enabled }) : undefined}
          onKick={model.canManage ? (member) => model.dispatch({ kind: "kick", memberId: member.id }) : undefined}
        />
        {model.isHost && model.state.banned.length > 0 && (
          <p className="invite-hint">
            นำออกจากห้องแล้ว {model.state.banned.length} คน
            <button type="button" className="text-btn" onClick={() => model.dispatch({ kind: "unban" })}>ให้กลับเข้าได้ทุกคน</button>
          </p>
        )}
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

"use client";

import { AlarmClock, FerrisWheel, Pause, Pencil, Play, TimerReset, Trash2, UsersRound, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { RoomMember } from "../../lib/room-realtime";
import {
  MAX_TIMER_SECONDS, MAX_WHEEL_NAMES, TIMER_PRESETS, wheelNames,
  type RoomIntent, type RoomState, type RoomTimer, type Wheel,
} from "../../lib/room-state";
import { celebrate, originOf } from "./celebrate";

/** How long a spin takes to settle. The CSS transition on .wheel-disc uses the same number. */
const SPIN_MS = 4200;
/** Whole turns before the wheel slows onto its name, so nobody can call it early. */
const SPIN_TURNS = 6;
const SLICE_COLORS = ["#EEC65D", "#FFF0CC", "#C86858", "#7AA36F", "#C07B2A", "#FAE4DC"];

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Where on the circle an angle is, measured clockwise from twelve o'clock. */
function point(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return [radius * Math.sin(radians), -radius * Math.cos(radians)] as const;
}

/**
 * The turn that puts the picked slice under the pointer. Each spin lands a little off the slice's middle, the same
 * little bit on every screen, so it does not look like it was placed there.
 */
function restingAngle(wheel: Wheel) {
  const count = wheel.names.length;
  if (wheel.pick === null || count === 0) return 0;
  const slice = 360 / count;
  const nudge = (((wheel.spin * 7919) % 100) / 100 - 0.5) * slice * 0.6;
  return (((-(wheel.pick + 0.5) * slice + nudge) % 360) + 360) % 360;
}

function spunTo(from: number, wheel: Wheel) {
  const target = restingAngle(wheel);
  const extra = (((target - from) % 360) + 360) % 360;
  return from + SPIN_TURNS * 360 + extra;
}

/** Watch together's extras: up to three name wheels the host turns on one at a time, and a countdown for the room. */
export function RoomToolsCard({ state, canManage, members, dispatch }: {
  state: RoomState;
  canManage: boolean;
  members: RoomMember[];
  dispatch: (intent: RoomIntent) => void;
}) {
  const shown = state.wheels.flatMap((wheel, index) => (wheel.on ? [{ wheel, index }] : []));
  if (!canManage && shown.length === 0 && !state.timer) return null;

  return (
    <section className="card tools-card" aria-labelledby="tools-title">
      <div className="card-head">
        <h2 id="tools-title"><FerrisWheel size={22} aria-hidden="true" /> กงล้อและจับเวลา</h2>
      </div>
      {canManage && (
        <div className="party-chips" role="group" aria-label="เปิดหรือปิดกงล้อ">
          {state.wheels.map((wheel, index) => (
            <button
              key={index}
              type="button"
              className={`chip-btn${wheel.on ? " is-on" : ""}`}
              aria-pressed={wheel.on}
              onClick={() => dispatch({ kind: "wheel", index, on: !wheel.on })}
            >
              <FerrisWheel size={16} aria-hidden="true" /> {wheel.title}
            </button>
          ))}
          {!state.timer && (
            <button type="button" className="chip-btn" onClick={() => dispatch({ kind: "timer", action: "set", seconds: TIMER_PRESETS[2] })}>
              <AlarmClock size={16} aria-hidden="true" /> จับเวลา
            </button>
          )}
        </div>
      )}
      {state.timer && <TimerPanel timer={state.timer} canManage={canManage} dispatch={dispatch} />}
      {shown.length > 0 && (
        <div className="wheel-grid">
          {shown.map(({ wheel, index }) => (
            <WheelPanel key={index} wheel={wheel} index={index} canManage={canManage} members={members} dispatch={dispatch} />
          ))}
        </div>
      )}
      {canManage && shown.length === 0 && (
        <p className="empty-note">กดเปิดกงล้อด้านบนได้สูงสุด 3 อัน ใส่ชื่อแล้วหมุนให้ทั้งห้องลุ้นพร้อมกัน</p>
      )}
    </section>
  );
}

function WheelPanel({ wheel, index, canManage, members, dispatch }: {
  wheel: Wheel;
  index: number;
  canManage: boolean;
  members: RoomMember[];
  dispatch: (intent: RoomIntent) => void;
}) {
  const discRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(false);
  // What this screen has shown so far. A new spin number from the host is what sets it turning.
  const [view, setView] = useState(() => ({ spin: wheel.spin, rotation: restingAngle(wheel), spinning: false }));
  if (view.spin !== wheel.spin) {
    setView({ spin: wheel.spin, rotation: spunTo(view.rotation, wheel), spinning: wheel.pick !== null });
  }

  useEffect(() => {
    if (!view.spinning) return;
    const timeoutId = window.setTimeout(() => {
      setView((current) => ({ ...current, spinning: false }));
      celebrate("pop", originOf(discRef.current));
    }, SPIN_MS);
    return () => window.clearTimeout(timeoutId);
  }, [view.spin, view.spinning]);

  const count = wheel.names.length;
  const slice = count > 0 ? 360 / count : 360;
  const picked = !view.spinning && wheel.pick !== null ? wheel.names[wheel.pick] : null;
  const fontSize = count > 16 ? 6 : count > 10 ? 8 : 10;

  return (
    <div className="wheel-panel">
      <strong className="wheel-title">{wheel.title}</strong>
      <div ref={discRef} className="wheel-stage">
        <span className="wheel-pointer" aria-hidden="true" />
        <svg viewBox="-104 -104 208 208" className="wheel-svg" role="img" aria-label={`${wheel.title} มี ${count} ชื่อ`}>
          <g className={`wheel-disc${view.spinning ? " is-spinning" : ""}`} style={{ transform: `rotate(${view.rotation}deg)` }}>
            {count === 0 && <circle r="100" className="wheel-empty" />}
            {count === 1 && <circle r="100" fill={SLICE_COLORS[0]} stroke="#2A1010" strokeWidth="2" />}
            {count > 1 && wheel.names.map((_, at) => {
              const [x1, y1] = point(at * slice, 100);
              const [x2, y2] = point((at + 1) * slice, 100);
              const large = slice > 180 ? 1 : 0;
              // The last slice never takes the first one's colour, so the two never run together.
              const wraps = at === count - 1 && count % SLICE_COLORS.length === 1;
              const color = SLICE_COLORS[(wraps ? at + 1 : at) % SLICE_COLORS.length];
              return (
                <path
                  key={at}
                  d={`M0 0L${x1.toFixed(2)} ${y1.toFixed(2)}A100 100 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}Z`}
                  fill={color}
                  stroke="#2A1010"
                  strokeWidth="1.5"
                />
              );
            })}
            {count === 1 && (
              <text className="wheel-label" fontSize={fontSize} y="-50" textAnchor="middle" dominantBaseline="central">{wheel.names[0]}</text>
            )}
            {count > 1 && wheel.names.map((name, at) => {
              const middle = (at + 0.5) * slice;
              return (
                <text
                  key={at}
                  className="wheel-label"
                  fontSize={fontSize}
                  transform={`rotate(${middle - 90}) translate(92 0)`}
                  textAnchor="end"
                  dominantBaseline="central"
                >
                  {name.length > 12 ? `${name.slice(0, 11)}…` : name}
                </text>
              );
            })}
          </g>
          <circle r="9" className="wheel-hub" />
        </svg>
      </div>
      <p className="wheel-result" aria-live="polite">
        {view.spinning ? "กำลังหมุน…" : picked ? <>ได้ <b>{picked}</b></> : count < 2 ? "ใส่ชื่ออย่างน้อย 2 ชื่อ" : "พร้อมหมุน"}
      </p>
      {canManage && (
        <div className="wheel-actions">
          <button
            type="button"
            className="btn btn-honey btn-sm"
            disabled={count < 2 || view.spinning}
            onClick={() => dispatch({ kind: "wheelSpin", index })}
          >
            <FerrisWheel size={16} aria-hidden="true" /> หมุน
          </button>
          {picked && wheel.pick !== null && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => dispatch({ kind: "wheel", index, names: wheel.names.filter((_, at) => at !== wheel.pick) })}
            >
              <Trash2 size={16} aria-hidden="true" /> เอาชื่อนี้ออก
            </button>
          )}
          <button type="button" className="btn btn-secondary btn-sm" aria-expanded={editing} onClick={() => setEditing((open) => !open)}>
            <Pencil size={16} aria-hidden="true" /> {editing ? "ปิด" : "แก้ชื่อ"}
          </button>
        </div>
      )}
      {canManage && editing && (
        <WheelEditor wheel={wheel} index={index} members={members} dispatch={dispatch} onDone={() => setEditing(false)} />
      )}
    </div>
  );
}

function WheelEditor({ wheel, index, members, dispatch, onDone }: {
  wheel: Wheel;
  index: number;
  members: RoomMember[];
  dispatch: (intent: RoomIntent) => void;
  onDone: () => void;
}) {
  const titleId = useId();
  const namesId = useId();
  const [title, setTitle] = useState(wheel.title);
  const [draft, setDraft] = useState(wheel.names.join("\n"));
  const count = wheelNames(draft).length;

  function fillFromRoom() {
    setDraft(wheelNames(members.map((member) => member.name)).join("\n"));
  }

  return (
    <form
      className="wheel-editor"
      onSubmit={(event) => {
        event.preventDefault();
        dispatch({ kind: "wheel", index, title, names: wheelNames(draft) });
        onDone();
      }}
    >
      <label htmlFor={titleId} className="field-label">ชื่อกงล้อ</label>
      <input id={titleId} className="field" value={title} maxLength={24} onChange={(event) => setTitle(event.target.value)} />
      <label htmlFor={namesId} className="field-label">รายชื่อ (บรรทัดละชื่อ) · {count}/{MAX_WHEEL_NAMES}</label>
      <textarea
        id={namesId}
        className="notes-input wheel-names"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={"หมี\nน้ำผึ้ง\nพุดดิ้ง"}
      />
      <div className="wheel-actions">
        <button type="button" className="btn btn-secondary btn-sm" onClick={fillFromRoom} disabled={members.length === 0}>
          <UsersRound size={16} aria-hidden="true" /> ใช้ชื่อคนในห้อง
        </button>
        <button type="submit" className="btn btn-primary btn-sm">บันทึก</button>
      </div>
    </form>
  );
}

function TimerPanel({ timer, canManage, dispatch }: {
  timer: RoomTimer;
  canManage: boolean;
  dispatch: (intent: RoomIntent) => void;
}) {
  const minutesId = useId();
  const secondsId = useId();
  const [minutes, setMinutes] = useState(String(Math.floor(timer.total / 60)));
  const [seconds, setSeconds] = useState(String(timer.total % 60));
  const done = timer.left === 0 && !timer.running;

  // The moment it runs out, every screen rings, not only the host's.
  const doneRef = useRef(done);
  useEffect(() => {
    if (done && !doneRef.current) {
      ring();
      celebrate("cheer");
    }
    doneRef.current = done;
  }, [done]);

  function setCustom() {
    const total = (Number(minutes) || 0) * 60 + (Number(seconds) || 0);
    if (total > 0) dispatch({ kind: "timer", action: "set", seconds: Math.min(MAX_TIMER_SECONDS, total) });
  }

  return (
    <div className={`timer-panel${done ? " is-done" : ""}${timer.running ? " is-running" : ""}`}>
      <div className="timer-face" aria-live={done ? "assertive" : "off"}>
        <AlarmClock size={28} aria-hidden="true" />
        {/* A fresh number from the host restarts the local tick, so every screen stays within a second of it. */}
        <TimerClock key={`${timer.left}-${timer.running}`} left={timer.left} running={timer.running} />
        <small>{done ? "หมดเวลาแล้ว!" : timer.running ? "กำลังนับถอยหลัง" : "หยุดอยู่"}</small>
      </div>
      {canManage && (
        <>
          <div className="wheel-actions">
            {timer.running ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => dispatch({ kind: "timer", action: "pause" })}>
                <Pause size={16} fill="currentColor" aria-hidden="true" /> หยุด
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" onClick={() => dispatch({ kind: "timer", action: "start" })}>
                <Play size={16} fill="currentColor" aria-hidden="true" /> {done ? "เริ่มใหม่" : "เริ่ม"}
              </button>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => dispatch({ kind: "timer", action: "reset" })}>
              <TimerReset size={16} aria-hidden="true" /> รีเซ็ต
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => dispatch({ kind: "timer", action: "off" })}>
              <X size={16} aria-hidden="true" /> ปิดตัวจับเวลา
            </button>
          </div>
          <div className="party-chips">
            {TIMER_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                className={`chip-btn${timer.total === preset ? " is-on" : ""}`}
                onClick={() => {
                  setMinutes(String(preset / 60));
                  setSeconds("0");
                  dispatch({ kind: "timer", action: "set", seconds: preset });
                }}
              >
                {preset / 60} นาที
              </button>
            ))}
          </div>
          <form
            className="timer-custom"
            onSubmit={(event) => {
              event.preventDefault();
              setCustom();
            }}
          >
            <label htmlFor={minutesId}>นาที</label>
            <input id={minutesId} className="field" type="number" inputMode="numeric" min={0} max={99} value={minutes} onChange={(event) => setMinutes(event.target.value)} />
            <label htmlFor={secondsId}>วินาที</label>
            <input id={secondsId} className="field" type="number" inputMode="numeric" min={0} max={59} value={seconds} onChange={(event) => setSeconds(event.target.value)} />
            <button type="submit" className="btn btn-secondary btn-sm">ตั้งเวลา</button>
          </form>
        </>
      )}
    </div>
  );
}

/** Counts down from the seconds the host sent while it runs; the host's next number takes over from there. */
function TimerClock({ left, running }: { left: number; running: boolean }) {
  const [value, setValue] = useState(left);
  useEffect(() => {
    if (!running) return;
    const intervalId = window.setInterval(() => setValue((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(intervalId);
  }, [running]);
  return <span className="timer-clock">{clock(value)}</span>;
}

/** Three short beeps. A browser that has not heard from the person yet may keep quiet, and that is fine. */
function ring() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const context = new AudioCtx();
    [0, 0.35, 0.7].forEach((at) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, context.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.25, context.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + at + 0.25);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(context.currentTime + at);
      oscillator.stop(context.currentTime + at + 0.3);
    });
    window.setTimeout(() => void context.close(), 1500);
  } catch {
    // No sound on this screen; the clock still says it.
  }
}

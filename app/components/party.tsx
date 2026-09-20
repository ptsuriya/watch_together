"use client";

import { Bomb, Dices, ListOrdered, Star, ThumbsUp, Trophy } from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  PARTY_GAMES, QUEUE_LIMITS, QUEUE_ORDERS, scoreAverage, SCORE_MAX,
  type PartyGame, type QueueItem, type QueueOrder, type RoomIntent, type RoomState, type Spotlight,
} from "../../lib/room-state";
import type { RoomModel } from "./room-model";
import { Art, Dialog } from "./ui";

const QUEUE_ORDER_LABELS: Record<QueueOrder, { name: string; hint: string }> = {
  line: { name: "ตามคิว", hint: "เพลงบนสุดได้เล่นก่อน" },
  random: { name: "สุ่มจากคิว", hint: "ห้องสุ่มเพลงต่อไปเอง ไม่มีใครรู้ว่าใครก่อน" },
  vote: { name: "โหวตคิวต่อไป", hint: "เพลงที่ได้โหวตมากสุดได้ไปต่อ" },
};

const GAME_LABELS: Record<PartyGame, { name: string; hint: string }> = {
  off: { name: "ปิด", hint: "ร้องกันไปตามคิวปกติ" },
  bomb: { name: "ระเบิดไมค์", hint: "สุ่มคนในห้องมารับไมค์ ให้เวลาหาเพลง 1 นาที เพลงที่หาได้แทรกเป็นเพลงถัดไป" },
  blind: { name: "ร้องเพลงมั่ว", hint: "เพลงที่เพิ่มเข้ามาจะถูกสุ่มให้คนอื่นร้อง เจ้าตัวไม่ได้เลือกเอง" },
};

function timeLeft(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** The room's party settings: who may queue how much, what plays next, and which game is on. */
export function PartyDialog({ model, onClose }: { model: RoomModel; onClose: () => void }) {
  const { state, canManage, dispatch } = model;
  const limitId = useId();
  const orderId = useId();
  const gameId = useId();

  if (!canManage) {
    return (
      <Dialog labelledBy="party-title" onClose={onClose}>
        <h2 id="party-title" className="dialog-title">เกม &amp; คิว</h2>
        <p className="dialog-text">หัวห้องเป็นคนตั้งค่าส่วนนี้ ตอนนี้ห้องใช้ {QUEUE_ORDER_LABELS[state.queueOrder].name.toLowerCase()} และเกม{GAME_LABELS[state.game].name}</p>
      </Dialog>
    );
  }

  return (
    <Dialog labelledBy="party-title" onClose={onClose}>
      <h2 id="party-title" className="dialog-title">เกม &amp; คิว</h2>
      <p className="dialog-text">ตั้งกติกาของห้องนี้ ทุกเครื่องเห็นผลทันที</p>

      <div className="party-settings">
        <div className="party-row">
          <label htmlFor={limitId}><ListOrdered size={16} aria-hidden="true" /> ลูกห้องเข้าคิวได้คนละ</label>
          <select
            id={limitId}
            className="field"
            value={state.queueLimit}
            onChange={(event) => dispatch({ kind: "queueLimit", count: Number(event.target.value) })}
          >
            {QUEUE_LIMITS.map((count) => (
              <option key={count} value={count}>{count === 0 ? "ไม่จำกัด" : `${count} เพลง`}</option>
            ))}
          </select>
          <small>หัวห้องและหัวห้องร่วมไม่ติดลิมิตนี้</small>
        </div>

        <div className="party-row">
          <label htmlFor={orderId}><Dices size={16} aria-hidden="true" /> เพลงต่อไปเลือกจาก</label>
          <select
            id={orderId}
            className="field"
            value={state.queueOrder}
            onChange={(event) => dispatch({ kind: "queueOrder", value: event.target.value as QueueOrder })}
          >
            {QUEUE_ORDERS.map((order) => (
              <option key={order} value={order}>{QUEUE_ORDER_LABELS[order].name}</option>
            ))}
          </select>
          <small>{QUEUE_ORDER_LABELS[state.queueOrder].hint}</small>
        </div>

        <div className="party-row">
          <label htmlFor={gameId}><Bomb size={16} aria-hidden="true" /> เกมในห้อง</label>
          <select
            id={gameId}
            className="field"
            value={state.game}
            onChange={(event) => dispatch({ kind: "game", value: event.target.value as PartyGame })}
          >
            {PARTY_GAMES.map((game) => (
              <option key={game} value={game}>{GAME_LABELS[game].name}</option>
            ))}
          </select>
          <small>{GAME_LABELS[state.game].hint}</small>
        </div>

        {state.game === "bomb" && (
          <button type="button" className="btn btn-honey" onClick={() => dispatch({ kind: "bomb" })}>
            <Bomb size={18} aria-hidden="true" /> ระเบิดไมค์ตอนนี้
          </button>
        )}

        <label className="party-check">
          <input
            type="checkbox"
            checked={state.scoring}
            onChange={(event) => dispatch({ kind: "scoring", enabled: event.target.checked })}
          />
          <span><Star size={16} aria-hidden="true" /> ให้คะแนนเพลงที่กำลังเล่น</span>
          <small>ทุกคนให้ดาวได้คนละครั้ง ห้องเห็นคะแนนรวมตอนเพลงจบ</small>
        </label>
      </div>
      <Art name="party" className="dialog-bear" sizes="96px" />
    </Dialog>
  );
}

/** Opens the party settings from a room's settings row. */
export function PartyButton({ state, onOpen }: { state: RoomState; onOpen: () => void }) {
  const playing = state.game !== "off" || state.queueOrder !== "line" || state.scoring || state.queueLimit > 0;
  return (
    <button type="button" className={`chip-btn${playing ? " is-on" : ""}`} onClick={onOpen}>
      <Bomb size={16} aria-hidden="true" />
      เกม &amp; คิว
      {playing && <em className="chip-dot" aria-hidden="true" />}
    </button>
  );
}

/** The mic bomb landed: the person it picked sees a countdown, everyone else sees who is up. */
export function SpotlightBanner({ spotlight, mine, place }: { spotlight: Spotlight; mine: boolean; place: "stage" | "phone" }) {
  return (
    <div className={`spotlight spotlight-${place}${mine ? " is-mine" : ""}`} aria-live="polite">
      <Bomb size={place === "stage" ? 28 : 20} aria-hidden="true" />
      <div className="spotlight-copy">
        <strong>{mine ? "ถึงตาคุณแล้ว! หาเพลงเลย" : `ระเบิดไมค์ลงที่ ${spotlight.name}`}</strong>
        <small>{mine ? "เพลงที่คุณเพิ่มจะแทรกเป็นเพลงถัดไปทันที" : "รอลุ้นว่าจะได้เพลงอะไร"}</small>
      </div>
      <Countdown key={spotlight.seconds} seconds={spotlight.seconds} />
    </div>
  );
}

/** Counts down from the seconds the host sent, and re-syncs whenever a fresh number arrives. */
function Countdown({ seconds }: { seconds: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const intervalId = window.setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(intervalId);
  }, []);
  return <span className="spotlight-clock">{timeLeft(left)}</span>;
}

/** Phones and watch screens: rate the song that is playing. */
export function ScorePad({ state, selfId, dispatch }: {
  state: RoomState;
  selfId: string | null;
  dispatch: (intent: RoomIntent) => void;
}) {
  if (!state.scoring || !state.nowPlaying) return null;
  const mine = selfId ? state.scores[selfId] : undefined;
  return (
    <section className="card score-pad" aria-label="ให้คะแนนเพลงนี้">
      <p className="score-head"><Star size={16} aria-hidden="true" /> ให้คะแนน “{state.nowPlaying.title}”</p>
      <div className="score-stars">
        {Array.from({ length: SCORE_MAX }, (_, index) => index + 1).map((value) => (
          <button
            key={value}
            type="button"
            className={`score-star${mine !== undefined && value <= mine ? " is-on" : ""}`}
            aria-label={`${value} ดาว`}
            aria-pressed={mine === value}
            onClick={() => dispatch({ kind: "score", value })}
          >
            <Star size={22} fill={mine !== undefined && value <= mine ? "currentColor" : "none"} aria-hidden="true" />
          </button>
        ))}
      </div>
      <small>{mine ? `คุณให้ ${mine} ดาว เปลี่ยนได้จนกว่าเพลงจะจบ` : "แตะดาวเพื่อให้คะแนน"}</small>
    </section>
  );
}

/** The shared screen: the score building up, then the result of the song that just ended. */
export function ScoreBoard({ state }: { state: RoomState }) {
  const running = state.scoring ? scoreAverage(state) : null;
  if (state.lastScore) {
    const { title, singer, average, count } = state.lastScore;
    return (
      <div className="score-result" aria-live="polite">
        <Trophy size={26} aria-hidden="true" />
        <strong>{average}</strong>
        <span>{title}</span>
        <small>{singer} · {count} คนให้คะแนน</small>
      </div>
    );
  }
  if (!running) return null;
  return (
    <p className="score-live" aria-live="polite">
      <Star size={16} fill="currentColor" aria-hidden="true" /> {running.average} <small>({running.count} คน)</small>
    </p>
  );
}

/** Vote mode: one tap says "this one next". */
export function VoteButton({ item, selfId, dispatch }: {
  item: QueueItem;
  selfId: string | null;
  dispatch: (intent: RoomIntent) => void;
}) {
  const votes = item.votes?.length ?? 0;
  const mine = Boolean(selfId && item.votes?.includes(selfId));
  return (
    <button
      type="button"
      className={`vote-btn${mine ? " is-on" : ""}`}
      aria-pressed={mine}
      aria-label={`โหวต ${item.title}`}
      title="โหวตให้เพลงนี้ได้เล่นต่อไป"
      onClick={() => dispatch({ kind: "vote", itemId: item.id })}
    >
      <ThumbsUp size={15} aria-hidden="true" />
      {votes > 0 && <span>{votes}</span>}
    </button>
  );
}

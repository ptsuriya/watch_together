"use client";

import {
  Bomb, Crown, Dices, ListOrdered, Medal, MicOff, SlidersHorizontal, Star, Swords, ThumbsUp, Timer, Trash2, Trophy,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import {
  BOMB_SECOND_OPTIONS, isKaraoke, VOCAL_CUT_OPTIONS, PARTY_GAMES, QUEUE_LIMITS, QUEUE_ORDERS, scoreAverage, SCORE_MAX, standingsBoard,
  waitingOn,
  type PartyGame, type QueueItem, type QueueOrder, type RoomIntent, type RoomState, type Spotlight,
} from "../../lib/room-state";
import type { RoomModel } from "./room-model";
import { ChatToggle, CrossfadeSelect, KeyControlSelect, NotesToggle } from "./room-panels";
import { Art, Dialog } from "./ui";

const QUEUE_ORDER_LABELS: Record<QueueOrder, { name: string; hint: string }> = {
  line: { name: "ตามคิว", hint: "เพลงบนสุดได้เล่นก่อน" },
  random: { name: "สุ่มจากคิว", hint: "ห้องสุ่มเพลงต่อไปเอง ไม่มีใครรู้ว่าใครก่อน" },
  vote: { name: "โหวตคิวต่อไป", hint: "เพลงที่ได้โหวตมากสุดได้ไปต่อ" },
};

const GAME_LABELS: Record<PartyGame, { name: string; hint: string }> = {
  off: { name: "ปิด", hint: "ร้องกันไปตามคิวปกติ" },
  bomb: { name: "ระเบิดไมค์", hint: "สุ่มคนในห้องมารับไมค์ ตั้งเวลาให้หาเพลงได้ เพลงที่หาได้แทรกเป็นเพลงถัดไป หมดเวลาแล้วไม่ได้เพลงจะโดนหักคะแนน" },
  blind: { name: "ร้องเพลงมั่ว", hint: "เพลงที่เพิ่มเข้ามาจะถูกสุ่มให้คนอื่นร้อง เจ้าตัวไม่ได้เลือกเอง" },
};

const VOCAL_CUT_LABELS: Record<number, string> = {
  0: "ปิด — เสียงเดิม",
  0.5: "ลดครึ่ง — ยังได้ยินต้นฉบับบางๆ",
  1: "ตัดเต็ม — เงียบสุดเท่าที่ทำได้",
};

function timeLeft(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Everything the host sets for the room: the queue's rules, the game, and what the screens show. */
export function PartyDialog({ model, onClose }: { model: RoomModel; onClose: () => void }) {
  const { state, canManage, dispatch } = model;
  const limitId = useId();
  const orderId = useId();
  const gameId = useId();
  const bombId = useId();
  const vocalId = useId();

  if (!canManage) {
    return (
      <Dialog labelledBy="party-title" onClose={onClose}>
        <h2 id="party-title" className="dialog-title">ตั้งค่าห้อง</h2>
        <p className="dialog-text">หัวห้องเป็นคนตั้งค่าส่วนนี้ ตอนนี้ห้องใช้{QUEUE_ORDER_LABELS[state.queueOrder].name} และเกม{GAME_LABELS[state.game].name}</p>
      </Dialog>
    );
  }

  return (
    <Dialog labelledBy="party-title" onClose={onClose}>
      <h2 id="party-title" className="dialog-title">ตั้งค่าห้อง</h2>
      <p className="dialog-text">ทุกเครื่องในห้องเห็นผลทันที</p>

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
          <div className="party-row">
            <label htmlFor={bombId}><Timer size={16} aria-hidden="true" /> ให้เวลาหาเพลง</label>
            <select
              id={bombId}
              className="field"
              value={state.bombSeconds}
              onChange={(event) => dispatch({ kind: "bombSeconds", seconds: Number(event.target.value) })}
            >
              {BOMB_SECOND_OPTIONS.map((seconds) => (
                <option key={seconds} value={seconds}>{seconds >= 60 ? `${seconds / 60} นาที${seconds % 60 ? ` ${seconds % 60} วิ` : ""}` : `${seconds} วินาที`}</option>
              ))}
            </select>
            <button type="button" className="btn btn-honey" onClick={() => dispatch({ kind: "bomb" })}>
              <Bomb size={18} aria-hidden="true" /> ระเบิดไมค์ตอนนี้
            </button>
          </div>
        )}

        <label className="party-check">
          <input
            type="checkbox"
            checked={state.scoring}
            onChange={(event) => dispatch({ kind: "scoring", enabled: event.target.checked })}
          />
          <span><Star size={16} aria-hidden="true" /> ให้คะแนนเพลงที่กำลังเล่น</span>
          <small>ทุกคนให้ดาวได้คนละครั้ง คะแนนของแต่ละเพลงสะสมเป็นตารางทั้งคืน และปล่อยให้ระเบิดไมค์หมดเวลาจะโดนหัก 1 คะแนน</small>
        </label>

        <div className="party-row">
          <span className="party-row-title"><Swords size={16} aria-hidden="true" /> ทัวร์นาเมนต์</span>
          {state.tournament ? (
            <>
              <TournamentPanel state={state} />
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => dispatch({ kind: "tournament", action: "stop" })}>
                จบทัวร์นาเมนต์
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-honey" onClick={() => dispatch({ kind: "tournament", action: "start" })}>
                <Swords size={18} aria-hidden="true" /> เริ่มทัวร์นาเมนต์
              </button>
              <small>ทุกคนในห้องร้องรอบละ 1 เพลง จบรอบคนคะแนนน้อยสุดตกรอบ จนเหลือคนเดียว (เปิดให้คะแนนอัตโนมัติ)</small>
            </>
          )}
        </div>

        {state.standings.length > 0 && (
          <div className="party-row">
            <span className="party-row-title"><Trophy size={16} aria-hidden="true" /> ตารางคะแนนคืนนี้</span>
            <ScoreTable state={state} />
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => dispatch({ kind: "standingsReset" })}>
              <Trash2 size={16} aria-hidden="true" /> ล้างตารางคะแนน
            </button>
          </div>
        )}

        <div className="party-row">
          <span className="party-row-title">จอและเสียง</span>
          <div className="party-chips">
            <CrossfadeSelect value={state.crossfade} dispatch={dispatch} />
            <ChatToggle enabled={state.chat} dispatch={dispatch} />
            {/* Only the watch layout has a notes panel to hide. */}
            {state.mode === "watch" && <NotesToggle enabled={state.notesOn} dispatch={dispatch} />}
          </div>
          {isKaraoke(state.mode) && <KeyControlSelect value={state.keyControl} dispatch={dispatch} />}
          {isKaraoke(state.mode) && (
            <>
              <label htmlFor={vocalId} className="party-sub"><MicOff size={16} aria-hidden="true" /> ลดเสียงร้องต้นฉบับ (ทดลอง)</label>
              <select
                id={vocalId}
                className="field"
                value={state.vocalCut}
                onChange={(event) => dispatch({ kind: "vocalCut", amount: Number(event.target.value) })}
              >
                {VOCAL_CUT_OPTIONS.map((amount) => (
                  <option key={amount} value={amount}>{VOCAL_CUT_LABELS[amount]}</option>
                ))}
              </select>
              <small>
                ใช้วิธีหักล้างเสียงที่อยู่กลางมิกซ์ ได้ผลไม่เท่ากันทุกเพลง — เบสกับกลองมักบางลงด้วย เสียงกลายเป็นโมโน
                และเพลงที่ร้องไม่ได้อยู่กลางจะแทบไม่เปลี่ยน ต้องติดตั้งส่วนเสริมเวอร์ชัน 1.2 ขึ้นไป
              </small>
            </>
          )}
        </div>
      </div>
      <Art name="party" className="dialog-bear" sizes="96px" />
    </Dialog>
  );
}

/** The one way into the room's settings, so nothing else has to sit beside the queue. */
export function PartyButton({ state, onOpen }: { state: RoomState; onOpen: () => void }) {
  const playing = state.game !== "off" || state.queueOrder !== "line" || state.scoring || state.queueLimit > 0;
  return (
    <button type="button" className={`chip-btn${playing ? " is-on" : ""}`} onClick={onOpen}>
      {playing ? <Bomb size={16} aria-hidden="true" /> : <SlidersHorizontal size={16} aria-hidden="true" />}
      ตั้งค่าห้อง
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
      <ScoreTable state={state} limit={5} />
    </section>
  );
}

/** The night so far: every singer's points, minus what the mic bomb cost them. */
export function ScoreTable({ state, limit }: { state: RoomState; limit?: number }) {
  const board = standingsBoard(state);
  if (board.length === 0) return null;
  const shown = limit ? board.slice(0, limit) : board;
  return (
    <ol className="score-table">
      {shown.map((row, index) => (
        <li key={row.name} className={index === 0 ? "is-lead" : undefined}>
          <span className="score-rank" aria-hidden="true">{index === 0 ? <Medal size={15} /> : index + 1}</span>
          <span className="score-name">{row.name}</span>
          <span className="score-meta">
            {row.songs} เพลง{row.misses > 0 && <em> · พลาด {row.misses}</em>}
          </span>
          <strong>{row.points}</strong>
        </li>
      ))}
    </ol>
  );
}

/** The shared screen: the score building up, then the result of the song that just ended. */
export function ScoreBoard({ state }: { state: RoomState }) {
  const running = state.scoring ? scoreAverage(state) : null;
  if (state.lastScore) {
    const { title, singer, average, count } = state.lastScore;
    const standing = standingsBoard(state).find((row) => row.name === singer);
    return (
      <div className="score-result" aria-live="polite">
        <Trophy size={26} aria-hidden="true" />
        <strong>{average}</strong>
        <span>{title}</span>
        <small>{singer} · {count} คนให้คะแนน</small>
        {standing && <small className="score-running">รวมทั้งคืน {standing.points} คะแนน จาก {standing.songs} เพลง</small>}
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

/** The knock-out as the room sees it: the round, who still owes a song, and who has gone home. */
export function TournamentPanel({ state, selfName, compact = false }: {
  state: RoomState;
  selfName?: string;
  compact?: boolean;
}) {
  const game = state.tournament;
  if (!game) return null;
  if (game.champion) {
    return (
      <div className="tournament is-champion" aria-live="polite">
        <Crown size={compact ? 20 : 26} aria-hidden="true" />
        <div>
          <strong>{game.champion}</strong>
          <small>ชนะทัวร์นาเมนต์คืนนี้</small>
        </div>
      </div>
    );
  }
  const waiting = waitingOn(game);
  const mine = selfName && waiting.includes(selfName);
  return (
    <div className={`tournament${mine ? " is-mine" : ""}`} aria-live="polite">
      <p className="tournament-head">
        <Swords size={16} aria-hidden="true" /> ทัวร์นาเมนต์ รอบ {game.round}
        <em>เหลือ {game.players.length} คน</em>
      </p>
      <p className="tournament-line">
        {mine ? "ถึงตาคุณแล้ว ขอเพลงของคุณได้เลย" : waiting.length > 0 ? `รออยู่: ${waiting.join(", ")}` : "รอบนี้ร้องครบแล้ว"}
      </p>
      {game.out.length > 0 && <p className="tournament-out">ตกรอบ: {game.out.join(", ")}</p>}
    </div>
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

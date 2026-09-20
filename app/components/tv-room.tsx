"use client";

import type { ReactNode } from "react";
import { formatKey } from "../../lib/room-state";
import type { HelperStatus } from "../../lib/karaoke-key";
import { KeyHelperProbe, KeyHelperStatusLine } from "./key-helper";
import { AddVideoForm, PlaybackButtons, QueueList } from "./queue";
import { EmojiPad, EmojiRain, type EmojiBurst } from "./reactions";
import { CrossfadeSelect, KeyControl, RoomQr } from "./room-panels";
import type { RoomModel, Toast } from "./room-model";
import { Art, ToastStack } from "./ui";

const UP_NEXT_LIMIT = 4;

/**
 * Remote and karaoke, host side: this screen is the shared TV (or the shared screen in a call). The video gets the
 * space, the QR stays in view, and the queue shows only what is coming up soon.
 */
export function TvRoom({
  model,
  player,
  toasts,
  keyFlash,
  bursts,
  keyHelperStatus,
  onReact,
  onOpenKaraokeSetup,
}: {
  model: RoomModel;
  player: ReactNode;
  toasts: Toast[];
  keyFlash: number;
  bursts: EmojiBurst[];
  keyHelperStatus: HelperStatus;
  onReact: (emoji: string) => void;
  onOpenKaraokeSetup: () => void;
}) {
  const { state, dispatch, selfName, inviteUrl, roomCode } = model;
  const karaoke = state.mode === "karaoke";
  const scanText = karaoke ? "สแกนเพื่อขอเพลงและปรับคีย์" : "สแกนเพื่อเพิ่มเพลง";

  return (
    <div className={`tv-layout${karaoke ? " is-karaoke" : ""}`}>
      <section className="tv-stage" aria-label="จอกลาง">
        {state.nowPlaying ? (
          <div className="tv-screen">{player}</div>
        ) : (
          <div className="tv-empty">
            <Art name="phone" className="tv-empty-bear float-slow" sizes="200px" priority />
            <RoomQr url={inviteUrl} size={240} />
            <div>
              <p className="tv-empty-kicker">คิวว่างอยู่</p>
              <h2>{scanText}</h2>
              <p>ใช้กล้องมือถือสแกน QR แล้ววางลิงก์ YouTube เพลงจะขึ้นจอนี้ทันที</p>
              <p className="tv-empty-code">รหัสห้อง <strong>{roomCode}</strong></p>
            </div>
          </div>
        )}
        {state.nowPlaying && state.queue[0] && (
          <p className="tv-next">
            <small>ต่อไป</small>
            <strong>{state.queue[0].title}</strong>
            <span>{karaoke ? "ร้องโดย" : "โดย"} {state.queue[0].addedBy}</span>
          </p>
        )}
        <ToastStack toasts={toasts} placement="stage" />
        {karaoke && state.nowPlaying && (
          <p className={`key-badge${state.key !== 0 ? " is-shifted" : ""}`} aria-live="polite">
            <small>คีย์</small>
            <strong>{formatKey(state.key)}</strong>
          </p>
        )}
        {karaoke && keyFlash > 0 && <p key={keyFlash} className="key-pop" aria-hidden="true">คีย์ {formatKey(state.key)}</p>}
        <EmojiRain bursts={bursts} />
      </section>

      <aside className="tv-side" aria-label="คิวและการควบคุม">
        {state.nowPlaying && (
          // While the queue is empty the stage itself shows a large QR.
          <section className="card qr-card">
            <Art name="star" className="qr-sticker" sizes="56px" />
            <RoomQr url={inviteUrl} size={176} />
            <div className="qr-copy">
              <strong>{scanText}</strong>
              <span>รหัส {roomCode}</span>
            </div>
          </section>
        )}

        <section className="card side-now">
          <small>{state.nowPlaying ? (state.isPlaying ? "กำลังเล่น" : "หยุดชั่วคราว") : "ยังไม่มีเพลง"}</small>
          <strong>{state.nowPlaying?.title ?? "รอเพลงแรกจากรีโมท"}</strong>
          {state.nowPlaying && <span>{karaoke ? "ร้องโดย" : "เพิ่มโดย"} {state.nowPlaying.addedBy}</span>}
          <PlaybackButtons state={state} dispatch={dispatch} />
        </section>

        <section className="card side-queue" aria-labelledby="tv-queue-title">
          <div className="card-head">
            <h2 id="tv-queue-title">คิวต่อไป <span className="count">{state.queue.length}</span></h2>
          </div>
          <CrossfadeSelect value={state.crossfade} dispatch={dispatch} />
          <QueueList items={state.queue} selfName={selfName} isHost dispatch={dispatch} limit={UP_NEXT_LIMIT} emptyText="ยังไม่มีเพลงต่อคิว" />
          <AddVideoForm onAdd={model.addVideo} compact label="เพิ่มลิงก์ YouTube จากเครื่องนี้" />
        </section>

        {karaoke && (
          <section className="card side-key" aria-label="คีย์และอีโมจิ">
            <KeyControl value={state.key} dispatch={dispatch} />
            <KeyHelperStatusLine status={keyHelperStatus} onOpenSetup={onOpenKaraokeSetup} />
            <EmojiPad onSend={onReact} compact />
            <KeyHelperProbe active={keyHelperStatus === "checking"} />
          </section>
        )}
      </aside>
    </div>
  );
}

"use client";

import { Minimize2, QrCode } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { formatKey, peekNext, singerOf } from "../../lib/room-state";
import type { HelperStatus } from "../../lib/karaoke-key";
import { ChatFlights, type ChatMessage } from "./chat";
import { KeyHelperProbe, KeyHelperStatusLine } from "./key-helper";
import { PartyButton, ScoreBoard, ScoreTable, SpotlightBanner, TournamentFlashCard, TournamentPanel } from "./party";
import { AddVideoForm, PlaybackButtons, QueueList } from "./queue";
import { EmojiPad, EmojiRain, type EmojiBurst } from "./reactions";
import { EqControl, KeyControl, RoomQr, VocalCutSelect } from "./room-panels";
import type { RoomModel, Toast } from "./room-model";
import { Art, ToastStack } from "./ui";
import { VoiceRoomCard } from "./voice-room";

const UP_NEXT_LIMIT = 4;
const QR_KEY = "sidewave-tv-qr";

/** Once everyone has scanned, the QR is just furniture — this screen remembers how the room left it. */
function useQrOpen() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      try {
        if (window.localStorage.getItem(QR_KEY) === "small") setOpen(false);
      } catch {
        // Showing the QR is the safe default.
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, []);
  const change = (next: boolean) => {
    setOpen(next);
    try {
      window.localStorage.setItem(QR_KEY, next ? "big" : "small");
    } catch {
      // Remembering it is a convenience only.
    }
  };
  return { open, change };
}

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
  messages,
  keyHelperStatus,
  onReact,
  onChat,
  onOpenKaraokeSetup,
  onOpenParty,
}: {
  model: RoomModel;
  player: ReactNode;
  toasts: Toast[];
  keyFlash: number;
  bursts: EmojiBurst[];
  messages: ChatMessage[];
  keyHelperStatus: HelperStatus;
  onReact: (emoji: string) => void;
  onChat: (text: string) => void;
  onOpenKaraokeSetup: () => void;
  onOpenParty: () => void;
}) {
  const { state, canManage, dispatch, selfId, selfName, inviteUrl, roomCode } = model;
  const upNext = peekNext(state);
  const qr = useQrOpen();
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
        {state.nowPlaying && state.queue.length > 0 && (
          <p className="tv-next">
            <small>ต่อไป</small>
            <strong>{upNext ? upNext.title : "สุ่มจากคิว"}</strong>
            <span>{upNext ? `${karaoke ? "ร้องโดย" : "โดย"} ${singerOf(upNext)}` : `ลุ้นกัน ${state.queue.length} เพลงในคิว`}</span>
          </p>
        )}
        {state.spotlight && <SpotlightBanner spotlight={state.spotlight} mine={false} place="stage" />}
        <ScoreBoard state={state} />
        <TournamentFlashCard state={state} />
        <ToastStack toasts={toasts} placement="stage" />
        {karaoke && state.nowPlaying && (
          <p className={`key-badge${state.key !== 0 ? " is-shifted" : ""}`} aria-live="polite">
            <small>คีย์</small>
            <strong>{formatKey(state.key)}</strong>
          </p>
        )}
        {karaoke && keyFlash > 0 && <p key={keyFlash} className="key-pop" aria-hidden="true">คีย์ {formatKey(state.key)}</p>}
        <EmojiRain bursts={bursts} />
        {state.chat && <ChatFlights messages={messages} />}
      </section>

      <aside className="tv-side" aria-label="คิวและการควบคุม">
        {state.nowPlaying && (
          // While the queue is empty the stage itself shows a large QR.
          qr.open ? (
            <section className="card qr-card">
              <Art name="star" className="qr-sticker" sizes="56px" />
              <button type="button" className="icon-btn qr-fold" onClick={() => qr.change(false)} aria-label="ย่อ QR" title="ย่อ QR">
                <Minimize2 size={16} aria-hidden="true" />
              </button>
              <RoomQr url={inviteUrl} size={176} />
              <div className="qr-copy">
                <strong>{scanText}</strong>
                <span>รหัส {roomCode}</span>
              </div>
            </section>
          ) : (
            <button type="button" className="card qr-card is-small" onClick={() => qr.change(true)}>
              <QrCode size={20} aria-hidden="true" />
              <span>เข้าห้องด้วยรหัส <strong>{roomCode}</strong></span>
              <em>กดเพื่อกาง QR</em>
            </button>
          )
        )}

        <section className="card side-now">
          <small>{state.nowPlaying ? (state.isPlaying ? "กำลังเล่น" : "หยุดชั่วคราว") : "ยังไม่มีเพลง"}</small>
          <strong>{state.nowPlaying?.title ?? "รอเพลงแรกจากรีโมท"}</strong>
          {state.nowPlaying && <span>{karaoke ? "ร้องโดย" : "เพิ่มโดย"} {singerOf(state.nowPlaying)}</span>}
          <PlaybackButtons state={state} dispatch={dispatch} />
        </section>

        {state.tournament && (
          <section className="card side-board" aria-label="ทัวร์นาเมนต์">
            <TournamentPanel state={state} />
          </section>
        )}

        {state.scoring && state.standings.length > 0 && (
          <section className="card side-board" aria-labelledby="tv-board-title">
            <h2 id="tv-board-title">ตารางคะแนน</h2>
            <ScoreTable state={state} limit={5} />
          </section>
        )}

        <section className="card side-queue" aria-labelledby="tv-queue-title">
          <div className="card-head">
            <h2 id="tv-queue-title">คิวต่อไป <span className="count">{state.queue.length}</span></h2>
            <PartyButton state={state} onOpen={onOpenParty} />
          </div>
          <QueueList
            items={state.queue}
            selfName={selfName}
            selfId={selfId}
            isHost={canManage}
            voting={state.queueOrder === "vote"}
            dispatch={dispatch}
            limit={UP_NEXT_LIMIT}
            emptyText="ยังไม่มีเพลงต่อคิว"
          />
          <AddVideoForm onAdd={model.addVideo} compact label="เพิ่มลิงก์ YouTube จากเครื่องนี้" />
        </section>

        {karaoke && (
          <section className="card side-key" aria-label="คีย์">
            <KeyControl value={state.key} dispatch={dispatch} />
            <VocalCutSelect value={state.vocalCut} canManage={canManage} dispatch={dispatch} />
            <EqControl value={state.eq} canManage={canManage} dispatch={dispatch} />
            <KeyHelperStatusLine status={keyHelperStatus} onOpenSetup={onOpenKaraokeSetup} />
            <KeyHelperProbe active={keyHelperStatus === "checking"} />
          </section>
        )}

        {state.voiceRoom && (
          <section className="card side-voice" aria-label="ห้องเสียง">
            <VoiceRoomCard address={state.voiceRoom} />
          </section>
        )}

        <section className="card side-emoji" aria-label="อีโมจิ">
          <EmojiPad onSend={onReact} compact />
        </section>
      </aside>
    </div>
  );
}

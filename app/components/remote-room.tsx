"use client";

import { Music2, PencilLine } from "lucide-react";
import type { RealtimeStatus } from "../../lib/room-realtime";
import { mayChangeKey, singerOf } from "../../lib/room-state";
import { ChatBar, ChatLog, type ChatMessage } from "./chat";
import { PartyButton, ScorePad, SpotlightBanner, TournamentFlashCard, TournamentPanel } from "./party";
import { AddVideoForm, PlaybackButtons, QueueList, YouTubeSearch } from "./queue";
import { EmojiPad } from "./reactions";
import { MODE_LABELS, type RoomModel } from "./room-model";
import { EqControl, KeyControl, VocalCutSelect } from "./room-panels";
import { Art, VideoThumb } from "./ui";

/** Remote and karaoke, guest side: a phone remote for the host's screen. */
export function RemoteRoom({ model, messages, onRename, onReact, onChat, onOpenParty }: {
  model: RoomModel;
  messages: ChatMessage[];
  onRename: () => void;
  onReact: (emoji: string) => void;
  onChat: (text: string) => void;
  onOpenParty: () => void;
}) {
  const { state, canManage, dispatch, selfId, selfName } = model;
  const karaoke = state.mode === "karaoke";
  const canChangeKey = mayChangeKey(state, selfName);
  const mine = state.queue.findIndex((item) => item.addedBy === selfName);

  return (
    <div className="remote-shell">
      <section className="remote-hello">
        <Art name={karaoke ? "party" : "phone"} className="remote-hello-bear" sizes="96px" priority />
        <div>
          <p>สวัสดี {selfName} <span className="pill pill-honey">โหมด{MODE_LABELS[state.mode].name}</span></p>
          <strong>{karaoke ? "มือถือนี้คือไมค์ของคุณ ขอเพลงแล้วปรับคีย์ได้เลย" : "มือถือนี้คือรีโมทของจอกลาง"}</strong>
        </div>
      </section>

      {state.spotlight && <SpotlightBanner spotlight={state.spotlight} mine={state.spotlight.memberId === selfId} place="phone" />}

      <section className="card remote-now" aria-label="กำลังเล่นบนจอกลาง">
        <div className="remote-art">
          {state.nowPlaying ? <VideoThumb videoId={state.nowPlaying.videoId} className="remote-thumb" /> : <span className="remote-thumb is-empty"><Music2 size={34} aria-hidden="true" /></span>}
        </div>
        <div className="remote-now-copy">
          <small>{state.nowPlaying ? (state.isPlaying ? "กำลังเล่นบนจอกลาง" : "หยุดชั่วคราว") : "จอกลางว่างอยู่"}</small>
          <strong>{state.nowPlaying?.title ?? "เพิ่มเพลงแรกได้เลย"}</strong>
          {state.nowPlaying && <span>{karaoke ? "ร้องโดย" : "เพิ่มโดย"} {singerOf(state.nowPlaying)}</span>}
        </div>
        <PlaybackButtons state={state} dispatch={dispatch} size="lg" />
      </section>

      <TournamentFlashCard state={state} />
      {state.tournament && (
        <section className="card remote-tournament" aria-label="ทัวร์นาเมนต์">
          <TournamentPanel state={state} selfName={selfName} compact />
        </section>
      )}
      <ScorePad state={state} selfId={selfId} dispatch={dispatch} />

      {karaoke && (
        <section className="card remote-key" aria-labelledby="remote-key-title">
          <h2 id="remote-key-title">ปรับคีย์เพลงที่กำลังเล่น</h2>
          {canChangeKey || canManage ? <KeyControl value={state.key} dispatch={dispatch} large /> : (
            <p className="key-locked">
              {state.keyControl === "owner"
                ? "โฮสต์ให้เฉพาะคนที่ขอเพลงนี้ปรับคีย์ได้"
                : "โฮสต์ปรับคีย์เอง"}
            </p>
          )}
          <VocalCutSelect value={state.vocalCut} canManage={canManage} dispatch={dispatch} />
          <EqControl value={state.eq} canManage={canManage} dispatch={dispatch} />
          <p className="hint">
            {state.keyHelper
              ? "ครึ่งเสียงต่อครั้ง เพลงใหม่เริ่มที่คีย์ต้นฉบับ"
              : "จอกลางยังไม่ได้ติดตั้งส่วนเสริมเปลี่ยนคีย์ ตัวเลขจะขึ้นจอ แต่เสียงยังไม่เปลี่ยน"}
          </p>
        </section>
      )}

      {canManage && (
        <section className="card remote-manage" aria-labelledby="remote-manage-title">
          <h2 id="remote-manage-title">คุณเป็นหัวห้องร่วม</h2>
          <p className="hint">จัดคิวและตั้งค่าห้องได้เหมือนโฮสต์</p>
          <PartyButton state={state} onOpen={onOpenParty} />
        </section>
      )}

      <section className="card remote-emoji" aria-labelledby="remote-emoji-title">
        <h2 id="remote-emoji-title">ส่งอีโมจิขึ้นจอ</h2>
        <EmojiPad onSend={onReact} />
      </section>

      <section className="card remote-add" aria-labelledby="remote-add-title">
        <h2 id="remote-add-title">{karaoke ? "ขอเพลง" : "เพิ่มเพลงเข้าคิว"}</h2>
        {state.queueLimit > 0 && !canManage && (
          <p className="hint">ห้องนี้ให้คนละ {state.queueLimit} เพลงในคิว</p>
        )}
        {state.game === "blind" && <p className="hint">เกมร้องเพลงมั่ว: เพลงที่คุณเพิ่มจะถูกสุ่มให้คนอื่นร้อง</p>}
        <AddVideoForm onAdd={model.addVideo} submitLabel={karaoke ? "ขอเพลง" : "เข้าคิว"} />
        <YouTubeSearch karaoke={karaoke} />
      </section>

      {state.chat && (
        <section className="card remote-chat" aria-labelledby="remote-chat-title">
          <h2 id="remote-chat-title">ส่งข้อความขึ้นจอ</h2>
          <ChatBar onSend={onChat} />
          <ChatLog messages={messages} selfName={selfName} />
        </section>
      )}

      <section className="card remote-queue" aria-labelledby="remote-queue-title">
        <div className="card-head">
          <h2 id="remote-queue-title">คิวต่อไป <span className="count">{state.queue.length}</span></h2>
          {mine >= 0 && <span className="pill pill-honey">ของคุณคิวที่ {mine + 1}</span>}
        </div>
        <QueueList
          items={state.queue}
          selfName={selfName}
          selfId={selfId}
          isHost={canManage}
          voting={state.queueOrder === "vote"}
          dispatch={dispatch}
          emptyText="ยังไม่มีคิว เพลงของคุณจะได้เล่นต่อทันที"
        />
      </section>

      <p className="remote-self">
        คุณคือ <strong>{selfName}</strong>
        <button type="button" className="text-btn" onClick={onRename}><PencilLine size={15} aria-hidden="true" /> เปลี่ยนชื่อ</button>
      </p>
    </div>
  );
}

/** A guest shows this until the host sends the room, since only the host knows the mode, queue and video. */
export function WaitingRoom({ status, hostOnline, roomCode }: { status: RealtimeStatus; hostOnline: boolean; roomCode: string }) {
  const waitingForHost = status === "connected" && !hostOnline;
  return (
    <div className="waiting">
      <Art name="waving" className="waiting-art float" sizes="140px" priority />
      <h1>{waitingForHost ? "รอโฮสต์เปิดห้องอยู่" : "กำลังเข้าห้อง…"}</h1>
      <p>
        {waitingForHost
          ? `ห้อง ${roomCode} จะใช้งานได้เมื่อจอของโฮสต์เปิดหน้าไว้ ลองบอกโฮสต์ให้เปิดหน้าห้องอีกครั้ง`
          : status === "error"
            ? "การเชื่อมต่อสะดุด กำลังลองใหม่อัตโนมัติ"
            : `กำลังขอข้อมูลห้อง ${roomCode} จากโฮสต์`}
      </p>
      {!waitingForHost && <span className="spinner spinner-lg" aria-hidden="true" />}
    </div>
  );
}

"use client";

import { UserPlus } from "lucide-react";
import type { ReactNode } from "react";
import type { HelperStatus } from "../../lib/karaoke-key";
import { mayChangeKey, singerOf } from "../../lib/room-state";
import { KeyHelperProbe, KeyHelperStatusLine } from "./key-helper";
import { ChatBar, type ChatMessage } from "./chat";
import { PartyButton, ScorePad, SpotlightBanner } from "./party";
import { SyncOffsetControl } from "./sync-offset";
import { EmojiPad } from "./reactions";
import { AddVideoForm, PlaybackButtons, QueueList } from "./queue";
import { ChatToggle, CrossfadeSelect, KeyControl, KeyControlSelect, MemberList, NotesPanel, NotesToggle } from "./room-panels";
import type { RoomModel } from "./room-model";
import { Art } from "./ui";

/**
 * Watch together, and its karaoke twin: everyone has a player. Video | notes on top, members | up next below.
 * In a sing-along the same screen also carries the key, because every device shifts its own sound.
 */
export function WatchRoom({
  model,
  player,
  messages,
  onExpandNotes,
  onInvite,
  onChat,
  onReact,
  onOpenParty,
  syncOffset,
  onSyncOffset,
  keyHelperStatus,
  onOpenKaraokeSetup,
}: {
  model: RoomModel;
  player: ReactNode;
  messages: ChatMessage[];
  onExpandNotes: () => void;
  onInvite: () => void;
  onChat: (text: string) => void;
  onReact: (emoji: string) => void;
  onOpenParty: () => void;
  /** Guests only: how far ahead of the host this device plays. */
  syncOffset: number;
  onSyncOffset: (value: number) => void;
  keyHelperStatus: HelperStatus;
  onOpenKaraokeSetup: () => void;
}) {
  const { state, isHost, canManage, dispatch, members, selfId, selfName } = model;
  const memberCount = members.length || 1;
  const karaoke = state.mode === "singalong";
  const canChangeKey = canManage || mayChangeKey(state, selfName);

  return (
    <div className={`watch-grid${state.notesOn ? "" : " no-notes"}`}>
      <section className="card player-card" aria-label="วิดีโอ">
        <div className="player-slot">
          {state.nowPlaying ? player : (
            <div className="player-empty">
              <Art name="board" className="player-empty-art" sizes="180px" priority />
              <strong>ยังไม่มีวิดีโอ</strong>
              <span>วางลิงก์ YouTube ใน “คิวต่อไป” แล้วทุกคนจะเริ่มดูพร้อมกัน</span>
            </div>
          )}
        </div>
        <div className="now-bar">
          <div className="now-copy">
            <small>{state.nowPlaying ? (state.isPlaying ? "กำลังเล่น" : "หยุดชั่วคราว") : "พร้อมเล่น"}</small>
            <strong>{state.nowPlaying?.title ?? "รอวิดีโอแรกของห้อง"}</strong>
            {state.nowPlaying && <span>{karaoke ? "ร้องโดย" : "เพิ่มโดย"} {singerOf(state.nowPlaying)}</span>}
          </div>
          <PlaybackButtons state={state} dispatch={dispatch} />
        </div>
        {state.spotlight && (
          <SpotlightBanner spotlight={state.spotlight} mine={state.spotlight.memberId === selfId} place="phone" />
        )}
        {karaoke && (
          <div className="watch-key">
            {canChangeKey ? <KeyControl value={state.key} dispatch={dispatch} /> : (
              <p className="key-locked">
                {state.keyControl === "owner" ? "โฮสต์ให้เฉพาะคนที่ขอเพลงนี้ปรับคีย์ได้" : "โฮสต์ปรับคีย์เอง"}
              </p>
            )}
            {canManage && <KeyControlSelect value={state.keyControl} dispatch={dispatch} />}
            <KeyHelperStatusLine status={keyHelperStatus} onOpenSetup={onOpenKaraokeSetup} />
            <KeyHelperProbe active={keyHelperStatus === "checking"} />
          </div>
        )}
        {!isHost && state.nowPlaying && <SyncOffsetControl offset={syncOffset} onChange={onSyncOffset} />}
        <div className="watch-social">
          {state.chat && <ChatBar onSend={onChat} compact />}
          <EmojiPad onSend={onReact} compact />
        </div>
      </section>

      {state.notesOn && (
        <NotesPanel notes={state.notes} isHost={isHost} canManage={canManage} shared={state.notesShared} dispatch={dispatch} onExpand={onExpandNotes} />
      )}

      <section className="card members-card" aria-labelledby="members-title">
        <Art name="hello" className="card-bear" sizes="96px" />
        <div className="card-head">
          <h2 id="members-title">สมาชิก <span className="count">{memberCount}</span></h2>
          <button type="button" className="btn btn-secondary btn-sm" onClick={onInvite}>
            <UserPlus size={16} aria-hidden="true" /> ชวนเพื่อน
          </button>
        </div>
        <MemberList
          members={members}
          selfId={selfId}
          selfName={selfName}
          selfIsHost={isHost}
          cohosts={state.cohosts}
          onToggleCohost={isHost ? (memberId, enabled) => dispatch({ kind: "cohost", memberId, enabled }) : undefined}
        />
      </section>

      <section className="card queue-card" aria-labelledby="queue-title">
        <div className="card-head">
          <h2 id="queue-title">คิวต่อไป <span className="count">{state.queue.length}</span></h2>
          {canManage && (
            <div className="room-settings">
              <CrossfadeSelect value={state.crossfade} dispatch={dispatch} />
              <NotesToggle enabled={state.notesOn} dispatch={dispatch} />
              <ChatToggle enabled={state.chat} dispatch={dispatch} />
              <PartyButton state={state} onOpen={onOpenParty} />
            </div>
          )}
        </div>
        <ScorePad state={state} selfId={selfId} dispatch={dispatch} />
        <AddVideoForm onAdd={model.addVideo} />
        <QueueList
          items={state.queue}
          selfName={selfName}
          selfId={selfId}
          isHost={canManage}
          voting={state.queueOrder === "vote"}
          dispatch={dispatch}
          emptyText="ยังไม่มีคิว ทุกคนเพิ่มวิดีโอได้เลย"
        />
      </section>
    </div>
  );
}

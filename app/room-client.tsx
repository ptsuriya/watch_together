"use client";

import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyHelperStatus } from "../lib/karaoke-key";
import { type RoomMember, type RoomSelf, useRoomRealtime } from "../lib/room-realtime";
import {
  createRoomState, hasContent, isReaction, reduceRoom, sanitizeGuestIntent, sanitizeState,
  type QueueItem, type RoomEvent, type RoomIntent, type RoomMode, type RoomState,
} from "../lib/room-state";
import { isSupabaseConfigured } from "../lib/supabase";
import { lookupVideo, parseYouTubeId } from "../lib/youtube";
import { HomeScreen } from "./components/home-screen";
import { BURST_LIFETIME_MS, type EmojiBurst, makeBurst } from "./components/reactions";
import { RemoteRoom, WaitingRoom } from "./components/remote-room";
import type { AddVideoResult, RoomModel, Toast } from "./components/room-model";
import { InviteDialog, NameDialog, NotesDialog, RoomHeader } from "./components/room-panels";
import { TvRoom } from "./components/tv-room";
import { Art, ToastStack } from "./components/ui";
import { WatchRoom } from "./components/watch-room";
import { type PlaybackFollow, type PlaybackResume, YouTubePlayer } from "./components/youtube-player";

const NAME_KEY = "sidewave-listener-name";
const BROADCAST_DELAY_MS = 40;
// Typing in the notes sends at most a few updates per second.
const NOTES_BROADCAST_DELAY_MS = 350;
// Guests in watch mode correct their position from these snapshots; other screens only need an occasional refresh.
const HEARTBEAT_WATCHING_MS = 4000;
const HEARTBEAT_IDLE_MS = 15_000;
const TOAST_MS = 4000;
const MAX_BURSTS = 8;
const SKIP_AFTER_ERROR_MS = 2500;

type DialogKind = "invite" | "name" | "notes";

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint32Array(8));
  return `WAVE-${Array.from(values, (value) => alphabet[value % alphabet.length]).join("")}`;
}

function readSavedName() {
  try {
    return window.localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

export default function RoomClient({
  sharedRoom,
  requestedHost: initialRequestedHost = false,
  initialMode,
  supabaseUrl,
  supabaseKey,
}: {
  sharedRoom?: string;
  requestedHost?: boolean;
  initialMode?: RoomMode;
  supabaseUrl?: string;
  supabaseKey?: string;
}) {
  const [screen, setScreen] = useState<"home" | "room">(sharedRoom ? "room" : "home");
  const [roomCode, setRoomCode] = useState(sharedRoom?.toUpperCase() ?? "");
  const [requestedHost, setRequestedHost] = useState(initialRequestedHost);
  const [state, setState] = useState<RoomState>(() => createRoomState(initialMode ?? "watch"));
  /** A guest has the host's state. Until then it cannot know the mode, queue or video. */
  const [synced, setSynced] = useState(false);
  const [follow, setFollow] = useState<PlaybackFollow>();
  const [resume, setResume] = useState<PlaybackResume>();
  const [listenerName, setListenerName] = useState("");
  const [dialog, setDialog] = useState<DialogKind | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [keyFlash, setKeyFlash] = useState(0);
  const [bursts, setBursts] = useState<EmojiBurst[]>([]);
  const [appOrigin, setAppOrigin] = useState("");
  const shellRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const isHostRef = useRef(false);
  const selfNameRef = useRef("");
  const broadcastRef = useRef<(event: RoomEvent) => void>(() => undefined);
  const timeRef = useRef<(() => number | null) | null>(null);
  const sessionRef = useRef("");
  const pendingAddsRef = useRef(new Set<string>());
  const broadcastTimerRef = useRef<number | undefined>(undefined);
  const broadcastDueRef = useRef(0);
  const toastIdRef = useRef(0);
  const connectedRef = useRef(false);
  const burstIdRef = useRef(0);
  const keyHelperRef = useRef(false);
  const supabaseConfig = useMemo(() => ({ url: supabaseUrl, key: supabaseKey }), [supabaseKey, supabaseUrl]);
  const realtimeConfigured = isSupabaseConfigured(supabaseConfig);

  const replaceState = useCallback((next: RoomState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const pushToast = useCallback((text: string) => {
    toastIdRef.current += 1;
    const id = toastIdRef.current;
    setToasts((current) => [...current.slice(-2), { id, text }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), TOAST_MS);
  }, []);

  const broadcastStateNow = useCallback(() => {
    window.clearTimeout(broadcastTimerRef.current);
    broadcastTimerRef.current = undefined;
    if (!isHostRef.current) return;
    sessionRef.current ||= crypto.randomUUID().slice(0, 8);
    const current = stateRef.current;
    const position = current.nowPlaying ? timeRef.current?.() ?? current.position : 0;
    broadcastRef.current({
      kind: "state",
      state: { ...current, session: sessionRef.current, position, keyHelper: keyHelperRef.current },
    });
  }, []);

  const scheduleBroadcast = useCallback((delay: number) => {
    const due = Date.now() + delay;
    if (broadcastTimerRef.current !== undefined && broadcastDueRef.current <= due) return;
    window.clearTimeout(broadcastTimerRef.current);
    broadcastDueRef.current = due;
    broadcastTimerRef.current = window.setTimeout(broadcastStateNow, delay);
  }, [broadcastStateNow]);

  const pushBurst = useCallback((emoji: string, from: string) => {
    burstIdRef.current += 1;
    const burst = makeBurst(burstIdRef.current, emoji, from);
    setBursts((current) => [...current.slice(-(MAX_BURSTS - 1)), burst]);
    window.setTimeout(() => setBursts((current) => current.filter((item) => item.id !== burst.id)), BURST_LIFETIME_MS);
  }, []);

  /** Applies a change as the room's source of truth. Only the host (or a room without realtime) does this. */
  const commit = useCallback((intent: RoomIntent) => {
    const previous = stateRef.current;
    const next = reduceRoom(previous, intent);
    if (next === previous) return next;
    replaceState(next);
    scheduleBroadcast(intent.kind === "notes" ? NOTES_BROADCAST_DELAY_MS : BROADCAST_DELAY_MS);
    if (intent.kind === "key") setKeyFlash((count) => count + 1);
    if (intent.kind === "add") pushToast(`${intent.item.addedBy} เพิ่ม “${intent.item.title}”`);
    return next;
  }, [pushToast, replaceState, scheduleBroadcast]);

  const dispatch = useCallback((intent: RoomIntent) => {
    if (isHostRef.current || !realtimeConfigured) {
      commit(intent);
      return;
    }
    // Broadcasts sent while the channel is down are dropped, so say so instead of letting the tap vanish.
    if (!connectedRef.current) {
      pushToast("ยังเชื่อมต่อห้องไม่ได้ รอสักครู่แล้วลองอีกครั้ง");
      return;
    }
    const guestIntent = sanitizeGuestIntent(intent);
    if (guestIntent) broadcastRef.current({ kind: "intent", intent: guestIntent });
  }, [commit, pushToast, realtimeConfigured]);

  const sendReaction = useCallback((emoji: string) => {
    if (!isReaction(emoji)) return;
    const from = selfNameRef.current;
    pushBurst(emoji, from);
    if (realtimeConfigured) broadcastRef.current({ kind: "react", emoji, from });
  }, [pushBurst, realtimeConfigured]);

  const addVideo = useCallback(async (input: string): Promise<AddVideoResult> => {
    const videoId = parseYouTubeId(input);
    if (!videoId) return { ok: false, message: "ไม่พบลิงก์ YouTube ในข้อความนี้" };
    const lookup = await lookupVideo(videoId);
    if (!lookup.playable) {
      return {
        ok: false,
        message: lookup.reason === "embed"
          ? "เจ้าของวิดีโอนี้ไม่อนุญาตให้เล่นนอก YouTube ลองเลือกคลิปอื่น"
          : "ไม่พบวิดีโอนี้ อาจถูกลบหรือเป็นวิดีโอส่วนตัว",
      };
    }
    const item: QueueItem = {
      id: crypto.randomUUID(),
      videoId,
      title: lookup.title || "วิดีโอ YouTube",
      channel: lookup.channel ?? "",
      addedBy: selfNameRef.current,
    };
    if (isHostRef.current || !realtimeConfigured) {
      const next = commit({ kind: "add", item });
      if (next.nowPlaying?.id === item.id) return { ok: true, message: "เริ่มเล่นแล้ว" };
      const index = next.queue.findIndex((queued) => queued.id === item.id);
      return index >= 0 ? { ok: true, message: `เข้าคิวแล้ว ลำดับที่ ${index + 1}` } : { ok: false, message: "คิวเต็มแล้ว" };
    }
    if (!connectedRef.current) return { ok: false, message: "ยังเชื่อมต่อห้องไม่ได้ รอสักครู่แล้วลองอีกครั้ง" };
    pendingAddsRef.current.add(item.id);
    broadcastRef.current({ kind: "intent", intent: { kind: "add", item } });
    return { ok: true, message: "ส่งแล้ว รอเข้าคิว…" };
  }, [commit, realtimeConfigured]);

  const confirmPendingAdds = useCallback((next: RoomState) => {
    for (const id of pendingAddsRef.current) {
      const index = next.queue.findIndex((queued) => queued.id === id);
      if (next.nowPlaying?.id === id) pushToast("เพลงของคุณกำลังเล่นแล้ว");
      else if (index >= 0) pushToast(`เพลงของคุณเข้าคิวแล้ว ลำดับที่ ${index + 1}`);
      else continue;
      pendingAddsRef.current.delete(id);
    }
  }, [pushToast]);

  const handleRoomEvent = useCallback((event: RoomEvent) => {
    switch (event.kind) {
      case "intent": {
        if (!isHostRef.current) return;
        const intent = sanitizeGuestIntent(event.intent);
        if (!intent) return;
        // Guests write the notes only while the host has shared them.
        if (intent.kind === "notes" && !stateRef.current.notesShared) return;
        commit(intent);
        return;
      }
      case "react": {
        if (isReaction(event.emoji)) pushBurst(event.emoji, typeof event.from === "string" ? event.from.slice(0, 32) : "ใครบางคน");
        return;
      }
      case "state": {
        if (isHostRef.current) return;
        const next = sanitizeState(event.state);
        if (!next) return;
        const current = stateRef.current;
        if (next.session !== current.session && !hasContent(next) && hasContent(current)) {
          // The host reloaded and lost the room. Hand it back instead of wiping it here.
          broadcastRef.current({ kind: "state:recover", state: current });
          return;
        }
        replaceState(next);
        setSynced(true);
        setFollow({ position: next.position, at: Date.now() });
        confirmPendingAdds(next);
        return;
      }
      case "state:request": {
        if (isHostRef.current) broadcastStateNow();
        else if (event.fromHost && hasContent(stateRef.current)) {
          broadcastRef.current({ kind: "state:recover", state: stateRef.current });
        }
        return;
      }
      case "state:recover": {
        if (!isHostRef.current || hasContent(stateRef.current)) return;
        const recovered = sanitizeState(event.state);
        if (!recovered || !hasContent(recovered)) return;
        // The host keeps the mode from its own link. The reloaded video starts in its original key, like Transpose.
        replaceState({ ...recovered, mode: stateRef.current.mode, key: 0 });
        if (recovered.nowPlaying) setResume({ itemId: recovered.nowPlaying.id, position: recovered.position, at: Date.now() });
        broadcastStateNow();
        return;
      }
    }
  }, [broadcastStateNow, commit, confirmPendingAdds, pushBurst, replaceState]);

  const handleResync = useCallback(({ isHost: selfIsHost }: RoomSelf) => {
    if (!selfIsHost) broadcastRef.current({ kind: "state:request" });
    else if (!hasContent(stateRef.current)) broadcastRef.current({ kind: "state:request", fromHost: true });
    else broadcastStateNow();
  }, [broadcastStateNow]);

  const handleMemberJoin = useCallback((member: RoomMember, { isHost: selfIsHost }: RoomSelf) => {
    if (selfIsHost && !member.isHost) broadcastStateNow();
    else if (!selfIsHost && member.isHost) broadcastRef.current({ kind: "state:request" });
  }, [broadcastStateNow]);

  const { status, members, isHost, selfId, broadcast } = useRoomRealtime({
    enabled: screen === "room",
    roomCode,
    requestedHost,
    listenerName: listenerName || (requestedHost ? "โฮสต์" : ""),
    onEvent: handleRoomEvent,
    onResync: handleResync,
    onMemberJoin: handleMemberJoin,
    supabase: supabaseConfig,
  });

  const keyHelperStatus = useKeyHelperStatus(isHost && state.mode === "karaoke");
  const selfName = listenerName || (isHost ? "โฮสต์" : selfId ? `ผู้ฟัง ${selfId.slice(0, 4).toUpperCase()}` : "ผู้ฟัง");
  const hostOnline = members.some((member) => member.isHost);

  useEffect(() => {
    const ready = keyHelperStatus === "ready";
    if (keyHelperRef.current === ready) return;
    keyHelperRef.current = ready;
    scheduleBroadcast(BROADCAST_DELAY_MS);
  }, [keyHelperStatus, scheduleBroadcast]);

  useEffect(() => {
    isHostRef.current = isHost;
    connectedRef.current = status === "connected";
    broadcastRef.current = broadcast;
    selfNameRef.current = selfName;
  }, [broadcast, isHost, selfName, status]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const saved = readSavedName();
      if (saved) setListenerName(saved);
      // Ask a guest who arrived from a QR for a name once, so their songs are not credited to "ผู้ฟัง".
      else if (sharedRoom && !initialRequestedHost) setDialog("name");
      setAppOrigin(window.location.origin);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [initialRequestedHost, sharedRoom]);

  useEffect(() => {
    if (!isHost || status !== "connected") return;
    const interval = state.mode === "watch" && state.isPlaying ? HEARTBEAT_WATCHING_MS : HEARTBEAT_IDLE_MS;
    const intervalId = window.setInterval(broadcastStateNow, interval);
    return () => window.clearInterval(intervalId);
  }, [broadcastStateNow, isHost, state.isPlaying, state.mode, status]);

  useEffect(() => () => window.clearTimeout(broadcastTimerRef.current), []);

  const handlePlayerPlaying = useCallback((playing: boolean) => {
    commit({ kind: "playback", playing });
    // Seeking with YouTube's own controls also lands here; send the new position even when nothing else changed.
    scheduleBroadcast(BROADCAST_DELAY_MS);
  }, [commit, scheduleBroadcast]);

  const handlePlayerEnded = useCallback(() => {
    commit({ kind: "next" });
  }, [commit]);

  // Crossfade: the next song starts while this one is still playing out.
  const handleNearEnd = useCallback(() => {
    commit({ kind: "next" });
  }, [commit]);

  const handlePlayerError = useCallback(() => {
    const failedId = stateRef.current.nowPlaying?.id;
    pushToast("วิดีโอนี้เล่นในห้องไม่ได้ กำลังข้ามไปเพลงถัดไป");
    window.setTimeout(() => {
      if (failedId && stateRef.current.nowPlaying?.id === failedId) commit({ kind: "next" });
    }, SKIP_AFTER_ERROR_MS);
  }, [commit, pushToast]);

  function resetRoom(mode: RoomMode) {
    sessionRef.current = crypto.randomUUID().slice(0, 8);
    pendingAddsRef.current.clear();
    replaceState(createRoomState(mode));
    setSynced(false);
    setFollow(undefined);
    setResume(undefined);
    setToasts([]);
    setBursts([]);
  }

  function createRoom(mode: RoomMode) {
    const code = makeRoomCode();
    // The mode stays in the host link so a reload restores it.
    window.history.replaceState({}, "", `/?room=${code}&host=1&mode=${mode}`);
    resetRoom(mode);
    setRoomCode(code);
    setRequestedHost(true);
    // The TV screen shows its QR all the time; watch rooms start by inviting people.
    setDialog(mode === "watch" ? "invite" : null);
    setScreen("room");
  }

  function joinRoom(code: string) {
    window.history.replaceState({}, "", `/?room=${code}`);
    resetRoom("watch");
    setRoomCode(code);
    setRequestedHost(false);
    setDialog(listenerName ? null : "name");
    setScreen("room");
  }

  function returnHome() {
    if (isHost && hasContent(stateRef.current) && !window.confirm("ออกจากห้อง? คิวและวิดีโอจะหายสำหรับทุกคนในห้อง")) return;
    window.history.replaceState({}, "", "/");
    setRequestedHost(false);
    setDialog(null);
    setScreen("home");
  }

  function changeMode(mode: RoomMode) {
    if (realtimeConfigured && !isHost) return;
    const current = stateRef.current;
    if (current.nowPlaying && (mode === "watch") !== (current.mode === "watch")) {
      // The other layout builds a new player; carry on from the same moment.
      setResume({ itemId: current.nowPlaying.id, position: timeRef.current?.() ?? 0, at: Date.now() });
    }
    commit({ kind: "mode", mode });
    window.history.replaceState({}, "", `/?room=${roomCode}&host=1&mode=${mode}`);
  }

  function saveName(name: string) {
    setListenerName(name);
    try {
      window.localStorage.setItem(NAME_KEY, name);
    } catch {
      // The name still applies for this visit.
    }
    setDialog(null);
  }

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch {
      pushToast("เบราว์เซอร์นี้ไม่รองรับโหมดเต็มจอ");
    }
  }

  if (screen === "home") return <HomeScreen onCreate={createRoom} onJoin={joinRoom} />;

  if (status === "room-not-found") {
    return (
      <main className="room-closed bg-dots">
        <section className="card closed-card">
          <Art name="sleeping" className="closed-art" sizes="180px" priority />
          <h1>ห้องนี้ปิดแล้ว</h1>
          <p>ลิงก์หรือ QR นี้ไม่ใช่ห้องที่เปิดอยู่ ลองขอลิงก์ใหม่จากโฮสต์อีกครั้งนะ</p>
          <button type="button" className="btn btn-primary" onClick={returnHome}>
            <ArrowLeft size={18} aria-hidden="true" /> กลับหน้าแรก
          </button>
        </section>
      </main>
    );
  }

  const inviteUrl = `${appOrigin}/?room=${roomCode}&mode=${state.mode}`;
  const model: RoomModel = {
    state, isHost, selfId, selfName, members, status, hostOnline, roomCode, inviteUrl, dispatch, addVideo,
  };
  const tvScreen = isHost && state.mode !== "watch";
  const waiting = !isHost && realtimeConfigured && !synced;
  const hostAway = !isHost && realtimeConfigured && synced && status === "connected" && members.length > 0 && !hostOnline;

  const player = state.nowPlaying && (isHost || state.mode === "watch") ? (
    <YouTubePlayer
      item={state.nowPlaying}
      playing={state.isPlaying}
      controls={isHost}
      fullscreenButton={state.mode === "watch"}
      crossfade={state.crossfade}
      hasNext={state.queue.length > 0}
      semitones={isHost && state.mode === "karaoke" ? state.key : undefined}
      onNearEnd={isHost ? handleNearEnd : undefined}
      follow={isHost ? undefined : follow}
      resume={isHost ? resume : undefined}
      timeRef={isHost ? timeRef : undefined}
      onPlayingChange={isHost ? handlePlayerPlaying : undefined}
      onEnded={isHost ? handlePlayerEnded : undefined}
      onError={isHost ? handlePlayerError : undefined}
    />
  ) : null;

  let view;
  if (waiting) view = <WaitingRoom status={status} hostOnline={hostOnline} roomCode={roomCode} />;
  else if (state.mode === "watch") {
    view = <WatchRoom model={model} player={player} onExpandNotes={() => setDialog("notes")} onInvite={() => setDialog("invite")} />;
  } else if (isHost) {
    view = (
      <TvRoom
        model={model}
        player={player}
        toasts={toasts}
        keyFlash={keyFlash}
        bursts={bursts}
        keyHelperStatus={keyHelperStatus}
        onReact={sendReaction}
      />
    );
  } else view = <RemoteRoom model={model} onRename={() => setDialog("name")} onReact={sendReaction} />;

  return (
    <div ref={shellRef} className={`room-shell mode-${state.mode}${tvScreen ? " is-tv" : ""}`}>
      <RoomHeader
        model={model}
        onHome={returnHome}
        onInvite={() => setDialog("invite")}
        onRename={() => setDialog("name")}
        onModeChange={changeMode}
        onFullscreen={tvScreen ? toggleFullscreen : undefined}
      />
      {hostAway && <p className="banner banner-top" role="status">โฮสต์ออกจากห้องไปแล้ว รอโฮสต์กลับมา คิวยังอยู่ครบ</p>}
      <main className="room-main">{view}</main>
      {!tvScreen && <ToastStack toasts={toasts} placement={isHost ? "corner" : "bottom"} />}
      {dialog === "invite" && <InviteDialog model={model} onClose={() => setDialog(null)} />}
      {dialog === "name" && <NameDialog name={listenerName} onSave={saveName} onClose={() => setDialog(null)} />}
      {dialog === "notes" && (
        <NotesDialog notes={state.notes} isHost={isHost} shared={state.notesShared} dispatch={dispatch} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

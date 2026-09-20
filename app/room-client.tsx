"use client";

import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useKeyHelperStatus } from "../lib/karaoke-key";
import { type RoomMember, type RoomSelf, useRoomRealtime } from "../lib/room-realtime";
import {
  BOMB_SECONDS, createRoomState, hasContent, hasOwnScreens, isKaraoke, isManager, MANAGER_INTENTS, mayChangeKey, queuedBy, reduceRoom, sanitizeChat,
  sanitizeGuestIntent, sanitizeReaction, sanitizeState, SCORE_SHOW_MS,
  type QueueItem, type RoomEvent, type RoomIntent, type RoomMode, type RoomState,
} from "../lib/room-state";
import { isSupabaseConfigured } from "../lib/supabase";
import { lookupVideo, parseYouTubeId } from "../lib/youtube";
import { HomeScreen } from "./components/home-screen";
import { ChatFlights, CHAT_FLIGHT_MS, CHAT_LANES, CHAT_LOG_SIZE, type ChatMessage, pickFlightTop } from "./components/chat";
import { KaraokeSetupDialog } from "./components/key-helper";
import { PartyDialog } from "./components/party";
import { useSyncOffset } from "./components/sync-offset";
import { BURST_LIFETIME_MS, type EmojiBurst, EmojiRain, makeBurst } from "./components/reactions";
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
const CHAT_COOLDOWN_MS = 1500;
const SKIP_AFTER_ERROR_MS = 2500;

type DialogKind = "invite" | "name" | "notes" | "karaoke" | "party";

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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [appOrigin, setAppOrigin] = useState("");
  const shellRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef(state);
  const isHostRef = useRef(false);
  const selfNameRef = useRef("");
  const selfIdRef = useRef<string | null>(null);
  const broadcastRef = useRef<(event: RoomEvent) => void>(() => undefined);
  const timeRef = useRef<(() => number | null) | null>(null);
  const sessionRef = useRef("");
  const pendingAddsRef = useRef(new Set<string>());
  const broadcastTimerRef = useRef<number | undefined>(undefined);
  const broadcastDueRef = useRef(0);
  const toastIdRef = useRef(0);
  const connectedRef = useRef(false);
  const burstIdRef = useRef(0);
  const messageIdRef = useRef(0);
  const chatSentAtRef = useRef(0);
  const keyHelperRef = useRef(false);
  const karaokeSetupShownRef = useRef(false);
  const membersRef = useRef<RoomMember[]>([]);
  /** Host clock: when the mic bomb runs out. The state carries only the seconds left, so every screen agrees. */
  const spotlightUntilRef = useRef(0);
  const lastBombRef = useRef<string | null>(null);
  /** Set once the picker below exists; dispatch is defined before it. */
  const startBombRef = useRef<() => void>(() => undefined);
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
    const spotlight = current.spotlight
      ? { ...current.spotlight, seconds: Math.max(0, Math.ceil((spotlightUntilRef.current - Date.now()) / 1000)) }
      : null;
    broadcastRef.current({
      kind: "state",
      state: { ...current, session: sessionRef.current, position, keyHelper: keyHelperRef.current, spotlight },
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
    // Watch mode: emoji rise across the page but stop below the player instead of flying over it.
    const player = hasOwnScreens(stateRef.current.mode) ? document.querySelector(".player-card")?.getBoundingClientRect() : null;
    // Bursts are about a third of the window tall, and never taller than the room left under the player.
    const room = player ? Math.max(140, Math.round(window.innerHeight - player.bottom - 16)) : window.innerHeight;
    const rise = -Math.min(Math.round(window.innerHeight * 0.3), room);
    const burst = makeBurst(burstIdRef.current, emoji, from, rise);
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
      // The room, not the sender, decides who the mic lands on and whose vote this is.
      if (intent.kind === "bomb") startBombRef.current();
      else if (intent.kind === "vote" || intent.kind === "score") commit({ ...intent, memberId: selfIdRef.current ?? "host" });
      else commit(intent);
      return;
    }
    // Broadcasts sent while the channel is down are dropped, so say so instead of letting the tap vanish.
    if (!connectedRef.current) {
      pushToast("ยังเชื่อมต่อห้องไม่ได้ รอสักครู่แล้วลองอีกครั้ง");
      return;
    }
    const guestIntent = sanitizeGuestIntent(intent);
    if (guestIntent) {
      broadcastRef.current({ kind: "intent", intent: guestIntent, from: selfNameRef.current, fromId: selfIdRef.current ?? undefined });
    }
  }, [commit, pushToast, realtimeConfigured]);

  const pushMessage = useCallback((text: string, from: string) => {
    messageIdRef.current += 1;
    // Watch mode flies messages across the whole page, so each one picks a height that misses the player.
    const acrossPage = hasOwnScreens(stateRef.current.mode);
    const top = acrossPage ? pickFlightTop(document.querySelector(".player-card")?.getBoundingClientRect() ?? null) : undefined;
    const message: ChatMessage = { id: messageIdRef.current, text, from, at: Date.now(), lane: messageIdRef.current % CHAT_LANES, top };
    setMessages((current) => [...current.slice(-(CHAT_LOG_SIZE - 1)), message]);
    // Kept a little longer than the flight so the phone's list does not empty while a message is still on screen.
    window.setTimeout(() => setMessages((current) => current.filter((item) => item.id !== message.id)), CHAT_FLIGHT_MS * 2);
  }, []);

  const sendChat = useCallback((input: string) => {
    const text = sanitizeChat(input);
    if (!text || !stateRef.current.chat) return;
    if (Date.now() - chatSentAtRef.current < CHAT_COOLDOWN_MS) {
      pushToast("ส่งถี่ไปนิด รอสักครู่แล้วส่งใหม่");
      return;
    }
    chatSentAtRef.current = Date.now();
    const from = selfNameRef.current;
    pushMessage(text, from);
    if (realtimeConfigured) broadcastRef.current({ kind: "chat", text, from });
  }, [pushMessage, pushToast, realtimeConfigured]);

  const sendReaction = useCallback((input: string) => {
    const emoji = sanitizeReaction(input);
    if (!emoji) return;
    const from = selfNameRef.current;
    pushBurst(emoji, from);
    if (realtimeConfigured) broadcastRef.current({ kind: "react", emoji, from });
  }, [pushBurst, realtimeConfigured]);

  /** Blind karaoke: someone else in the room gets the song, so they sing what they did not choose. */
  const pickSinger = useCallback((exceptId: string | null | undefined) => {
    const others = membersRef.current.filter((member) => member.id !== exceptId);
    return others.length > 0 ? others[Math.floor(Math.random() * others.length)].name : undefined;
  }, []);

  /** Stamps a song with who queued it, and in blind karaoke with who has to sing it. */
  const dressItem = useCallback((item: QueueItem, fromId: string | undefined): QueueItem => {
    const singer = stateRef.current.game === "blind" ? pickSinger(fromId) : undefined;
    return { ...item, ...(fromId ? { addedById: fromId } : {}), ...(singer ? { singer } : {}) };
  }, [pickSinger]);

  /** Hands the mic to someone at random, with a countdown to find one song. */
  const startBomb = useCallback(() => {
    const room = membersRef.current;
    const pool = room.filter((member) => member.id !== lastBombRef.current);
    const picked = (pool.length > 0 ? pool : room)[Math.floor(Math.random() * (pool.length > 0 ? pool.length : room.length))];
    if (!picked) {
      pushToast("ยังไม่มีใครในห้องให้สุ่ม ชวนเพื่อนสแกน QR เข้ามาก่อน");
      return;
    }
    lastBombRef.current = picked.id;
    spotlightUntilRef.current = Date.now() + BOMB_SECONDS * 1000;
    commit({ kind: "bomb", memberId: picked.id, name: picked.name, seconds: BOMB_SECONDS });
    pushToast(`ระเบิดไมค์ลงที่ ${picked.name}`);
  }, [commit, pushToast]);

  useEffect(() => {
    startBombRef.current = startBomb;
  }, [startBomb]);

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
      const next = commit({ kind: "add", item: dressItem(item, selfIdRef.current ?? undefined) });
      if (next.nowPlaying?.id === item.id) return { ok: true, message: "เริ่มเล่นแล้ว" };
      const index = next.queue.findIndex((queued) => queued.id === item.id);
      return index >= 0 ? { ok: true, message: `เข้าคิวแล้ว ลำดับที่ ${index + 1}` } : { ok: false, message: "คิวเต็มแล้ว" };
    }
    if (!connectedRef.current) return { ok: false, message: "ยังเชื่อมต่อห้องไม่ได้ รอสักครู่แล้วลองอีกครั้ง" };
    pendingAddsRef.current.add(item.id);
    // The envelope is how the host knows whose song this is: per-person limits and the mic bomb both read it.
    broadcastRef.current({
      kind: "intent",
      intent: { kind: "add", item },
      from: selfNameRef.current,
      fromId: selfIdRef.current ?? undefined,
    });
    return { ok: true, message: "ส่งแล้ว รอเข้าคิว…" };
  }, [commit, dressItem, realtimeConfigured]);

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
        const state = stateRef.current;
        const fromId = typeof event.fromId === "string" ? event.fromId : undefined;
        const fromName = sanitizeChat(event.from).slice(0, 32);
        const manager = isManager(state, fromId);
        // Running the queue and the room's settings is for the host and the co-hosts they picked.
        if (MANAGER_INTENTS.some((kind) => kind === intent.kind) && !manager) return;
        // Guests write the notes only while the host has shared them.
        if (intent.kind === "notes" && !state.notesShared && !manager) return;
        // The host decides who may change the key: only the host, only whoever queued the song, or anyone.
        if (intent.kind === "key" && !manager && !mayChangeKey(state, fromName)) return;
        if (intent.kind === "bomb") {
          startBomb();
          return;
        }
        // Voting and rating only count when the room knows who sent them.
        if (intent.kind === "vote" || intent.kind === "score") {
          if (fromId) commit({ ...intent, memberId: fromId });
          return;
        }
        if (intent.kind === "add") {
          const waiting = queuedBy(state, fromId);
          if (!manager && state.queueLimit > 0 && waiting >= state.queueLimit && fromId) {
            broadcastRef.current({
              kind: "notice",
              to: fromId,
              text: `ห้องนี้ให้คนละ ${state.queueLimit} เพลงในคิว รอเพลงของคุณเล่นก่อนนะ`,
            });
            return;
          }
          commit({ kind: "add", item: dressItem(intent.item, fromId) });
          return;
        }
        commit(intent);
        return;
      }
      case "react": {
        const emoji = sanitizeReaction(event.emoji);
        if (emoji) pushBurst(emoji, sanitizeChat(event.from).slice(0, 32) || "ใครบางคน");
        return;
      }
      case "notice": {
        // A word from the host to one member: their own screen is the only one that shows it.
        if (event.to === selfIdRef.current) pushToast(sanitizeChat(event.text) || "ห้องไม่รับคำขอนี้");
        return;
      }
      case "chat": {
        const text = sanitizeChat(event.text);
        if (text && stateRef.current.chat) pushMessage(text, sanitizeChat(event.from).slice(0, 32) || "ใครบางคน");
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
  }, [broadcastStateNow, commit, confirmPendingAdds, dressItem, pushBurst, pushMessage, pushToast, replaceState, startBomb]);

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

  // Everyone's own screen shifts its own key in a sing-along, so every device checks for the extension.
  const keyHelperStatus = useKeyHelperStatus(state.mode === "singalong" || (isHost && state.mode === "karaoke"));
  const { offset: syncOffset, change: changeSyncOffset } = useSyncOffset();
  const selfName = listenerName || (isHost ? "โฮสต์" : selfId ? `ผู้ฟัง ${selfId.slice(0, 4).toUpperCase()}` : "ผู้ฟัง");
  const hostOnline = members.some((member) => member.isHost);

  // A karaoke host meets the setup the moment the room opens, instead of wondering why the key does nothing.
  // In a sing-along every screen shifts its own sound, so anyone on a computer that could install it hears about it too.
  useEffect(() => {
    const wanted = state.mode === "singalong"
      ? keyHelperStatus === "missing"
      : isHost && state.mode === "karaoke" && keyHelperStatus !== "ready";
    if (!wanted || karaokeSetupShownRef.current) return;
    // Marked inside the timeout: a run that React cancels (StrictMode) must not count as shown.
    const timeoutId = window.setTimeout(() => {
      karaokeSetupShownRef.current = true;
      setDialog("karaoke");
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [isHost, keyHelperStatus, state.mode]);

  useEffect(() => {
    if (dialog !== "karaoke" || keyHelperStatus !== "ready") return;
    const timeoutId = window.setTimeout(() => setDialog(null), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [dialog, keyHelperStatus]);

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
    selfIdRef.current = selfId;
    membersRef.current = members;
  }, [broadcast, isHost, members, selfId, selfName, status]);

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
    const interval = hasOwnScreens(state.mode) && state.isPlaying ? HEARTBEAT_WATCHING_MS : HEARTBEAT_IDLE_MS;
    const intervalId = window.setInterval(broadcastStateNow, interval);
    return () => window.clearInterval(intervalId);
  }, [broadcastStateNow, isHost, state.isPlaying, state.mode, status]);

  // The mic bomb ends when nobody answers it.
  useEffect(() => {
    if (!isHost || !state.spotlight) return;
    const intervalId = window.setInterval(() => {
      if (Date.now() < spotlightUntilRef.current) {
        scheduleBroadcast(BROADCAST_DELAY_MS);
        return;
      }
      pushToast(`หมดเวลาของ ${stateRef.current.spotlight?.name ?? "คนที่ถูกสุ่ม"}`);
      commit({ kind: "spotlightOff" });
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [commit, isHost, pushToast, scheduleBroadcast, state.spotlight]);

  // Everyone looks at the score for a few seconds, then the room moves on.
  useEffect(() => {
    if (!isHost || !state.lastScore) return;
    const timeoutId = window.setTimeout(() => commit({ kind: "scoreClear" }), SCORE_SHOW_MS);
    return () => window.clearTimeout(timeoutId);
  }, [commit, isHost, state.lastScore]);

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
    setMessages([]);
  }

  function createRoom(mode: RoomMode) {
    const code = makeRoomCode();
    // The mode stays in the host link so a reload restores it.
    window.history.replaceState({}, "", `/?room=${code}&host=1&mode=${mode}`);
    resetRoom(mode);
    setRoomCode(code);
    setRequestedHost(true);
    // The TV screen shows its QR all the time; watch rooms start by inviting people.
    setDialog(hasOwnScreens(mode) ? "invite" : null);
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
    if (current.nowPlaying && hasOwnScreens(mode) !== hasOwnScreens(current.mode)) {
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
  const canManage = isHost || isManager(state, selfId) || !realtimeConfigured;
  const model: RoomModel = {
    state, isHost, canManage, selfId, selfName, members, status, hostOnline, roomCode, inviteUrl, dispatch, addVideo,
  };
  const tvScreen = isHost && !hasOwnScreens(state.mode);
  const waiting = !isHost && realtimeConfigured && !synced;
  const hostAway = !isHost && realtimeConfigured && synced && status === "connected" && members.length > 0 && !hostOnline;

  const player = state.nowPlaying && (isHost || hasOwnScreens(state.mode)) ? (
    <YouTubePlayer
      item={state.nowPlaying}
      playing={state.isPlaying}
      controls={isHost}
      fullscreenButton={hasOwnScreens(state.mode)}
      crossfade={state.crossfade}
      hasNext={state.queue.length > 0}
      semitones={isKaraoke(state.mode) && (isHost || state.mode === "singalong") ? state.key : undefined}
      onNearEnd={isHost ? handleNearEnd : undefined}
      follow={isHost ? undefined : follow}
      offset={isHost ? 0 : syncOffset}
      resume={isHost ? resume : undefined}
      timeRef={isHost ? timeRef : undefined}
      onPlayingChange={isHost ? handlePlayerPlaying : undefined}
      onEnded={isHost ? handlePlayerEnded : undefined}
      onError={isHost ? handlePlayerError : undefined}
    />
  ) : null;

  let view;
  if (waiting) view = <WaitingRoom status={status} hostOnline={hostOnline} roomCode={roomCode} />;
  else if (hasOwnScreens(state.mode)) {
    view = (
      <WatchRoom
        model={model}
        player={player}
        messages={messages}
        onExpandNotes={() => setDialog("notes")}
        onInvite={() => setDialog("invite")}
        onOpenParty={() => setDialog("party")}
        syncOffset={syncOffset}
        onSyncOffset={changeSyncOffset}
        keyHelperStatus={keyHelperStatus}
        onOpenKaraokeSetup={() => setDialog("karaoke")}
        onChat={sendChat}
        onReact={sendReaction}
      />
    );
  } else if (isHost) {
    view = (
      <TvRoom
        model={model}
        player={player}
        toasts={toasts}
        keyFlash={keyFlash}
        bursts={bursts}
        messages={messages}
        keyHelperStatus={keyHelperStatus}
        onReact={sendReaction}
        onChat={sendChat}
        onOpenKaraokeSetup={() => setDialog("karaoke")}
        onOpenParty={() => setDialog("party")}
      />
    );
  } else {
    view = (
      <RemoteRoom
        model={model}
        messages={messages}
        onRename={() => setDialog("name")}
        onReact={sendReaction}
        onChat={sendChat}
        onOpenParty={() => setDialog("party")}
      />
    );
  }

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
      {state.chat && hasOwnScreens(state.mode) && <ChatFlights messages={messages} variant="page" />}
      {hasOwnScreens(state.mode) && <EmojiRain bursts={bursts} variant="page" />}
      {hostAway && <p className="banner banner-top" role="status">โฮสต์ออกจากห้องไปแล้ว รอโฮสต์กลับมา คิวยังอยู่ครบ</p>}
      <main className="room-main">{view}</main>
      {!tvScreen && <ToastStack toasts={toasts} placement={isHost ? "corner" : "bottom"} />}
      {dialog === "invite" && <InviteDialog model={model} onClose={() => setDialog(null)} />}
      {dialog === "name" && <NameDialog name={listenerName} onSave={saveName} onClose={() => setDialog(null)} />}
      {dialog === "karaoke" && (
        <KaraokeSetupDialog
          status={keyHelperStatus}
          place={state.mode === "singalong" ? "device" : "stage"}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "party" && <PartyDialog model={model} onClose={() => setDialog(null)} />}
      {dialog === "notes" && (
        <NotesDialog notes={state.notes} canManage={canManage} shared={state.notesShared} dispatch={dispatch} onClose={() => setDialog(null)} />
      )}
    </div>
  );
}

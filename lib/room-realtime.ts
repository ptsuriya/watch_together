"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ensureSession, getSupabaseBrowserClient, isSupabaseConfigured, type SupabaseBrowserConfig,
} from "./supabase";

export type RoomMode = "watch" | "order";

export type QueueItem = {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  thumb: string;
};

export type RoomEvent =
  | { kind: "queue:add"; item: QueueItem }
  | { kind: "order:video"; item: QueueItem }
  | { kind: "mode:set"; mode: RoomMode }
  | { kind: "video:set"; videoId: string }
  | { kind: "player"; action: "play" | "pause" | "seek"; seconds?: number }
  | { kind: "state:request"; fromHost?: boolean }
  | { kind: "state:sync"; queue: QueueItem[]; mode: RoomMode; isPlaying: boolean; activeVideoId: string | null };

export type RealtimeStatus = "disabled" | "connecting" | "connected" | "error" | "room-not-found";
export type RoomMember = { id: string; name: string; isHost: boolean };
export type RoomSelf = { isHost: boolean };

type MemberPresence = { name: string; isHost: boolean };

type Options = {
  enabled: boolean;
  roomCode: string;
  requestedHost: boolean;
  listenerName: string;
  onEvent: (event: RoomEvent) => void;
  /** Runs each time the channel is (re)joined, and when the page wakes up while joined: the moment to resync room state. */
  onResync?: (self: RoomSelf) => void;
  /** Runs when another member appears, including members already in the room when this client joins. */
  onMemberJoin?: (member: RoomMember, self: RoomSelf) => void;
  supabase: SupabaseBrowserConfig;
};

// realtime-js rejoins a channel by itself after an error; rebuild the connection only if that has not worked by then.
const CHANNEL_RECOVERY_GRACE_MS = 10_000;
const MAX_RETRY_DELAY_MS = 15_000;

// Channel removals still in flight, across effect runs. A new channel for the same topic must wait for them: the client
// hands back an existing channel for a topic, and a late close drops every channel with that topic from the client.
let pendingLeave: Promise<unknown> = Promise.resolve();

function displayName(listenerName: string, userId: string) {
  return listenerName.trim() || `Listener ${userId.slice(0, 4)}`;
}

export function useRoomRealtime({
  enabled, roomCode, requestedHost, listenerName, onEvent, onResync, onMemberJoin, supabase: config,
}: Options) {
  const [status, setStatus] = useState<RealtimeStatus>(isSupabaseConfigured(config) ? "connecting" : "disabled");
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [resolvedIsHost, setResolvedIsHost] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onEventRef = useRef(onEvent);
  const onResyncRef = useRef(onResync);
  const onMemberJoinRef = useRef(onMemberJoin);
  const listenerNameRef = useRef(listenerName);
  const userIdRef = useRef<string | null>(null);
  const hostRef = useRef(false);

  useEffect(() => {
    onEventRef.current = onEvent;
    onResyncRef.current = onResync;
    onMemberJoinRef.current = onMemberJoin;
  }, [onEvent, onMemberJoin, onResync]);

  useEffect(() => {
    listenerNameRef.current = listenerName;
    const userId = userIdRef.current;
    if (channelRef.current && userId) {
      void channelRef.current.track({ name: displayName(listenerName, userId), isHost: hostRef.current });
    }
  }, [listenerName]);

  const broadcast = useCallback((event: RoomEvent) => {
    void channelRef.current?.send({ type: "broadcast", event: "room-event", payload: event });
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const client = getSupabaseBrowserClient(config);
    if (!client) {
      return;
    }
    const supabase = client;
    const topic = `room:${roomCode}`;

    let disposed = false;
    let roomMissing = false;
    let attempt = 0;
    let failures = 0;
    let channel: RealtimeChannel | null = null;
    let retryTimer: number | undefined;

    function cancelRetry() {
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
    }

    function scheduleRetry(minDelay = 0) {
      if (disposed || retryTimer !== undefined) return;
      const delay = Math.max(minDelay, Math.min(1000 * 2 ** failures, MAX_RETRY_DELAY_MS));
      failures += 1;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        void connect();
      }, delay);
    }

    function fail() {
      setStatus("error");
      scheduleRetry();
    }

    function markRoomMissing() {
      roomMissing = true;
      setStatus("room-not-found");
    }

    async function leaveChannel() {
      const current = channel;
      channel = null;
      if (channelRef.current === current) channelRef.current = null;
      if (current) pendingLeave = Promise.all([pendingLeave, supabase.removeChannel(current)]);
      await pendingLeave;
    }

    async function connect() {
      cancelRetry();
      const id = ++attempt;
      // Every await below can outlive this attempt: a newer attempt or the effect cleanup may have taken over.
      const isStale = () => disposed || id !== attempt;

      setStatus("connecting");
      await leaveChannel();
      if (isStale()) return;

      const session = await ensureSession(supabase);
      if (isStale()) return;
      if (!session) return fail();
      const userId = session.user.id;

      if (requestedHost) {
        const { error } = await supabase.from("rooms").insert({ id: roomCode, host_id: userId });
        if (isStale()) return;
        if (error && error.code !== "23505") return fail();
      }

      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("host_id")
        .eq("id", roomCode)
        .maybeSingle();
      if (isStale()) return;
      if (roomError) return fail();
      if (!room) return markRoomMissing();

      const actualIsHost = room.host_id === userId;
      const self: RoomSelf = { isHost: actualIsHost };
      userIdRef.current = userId;
      hostRef.current = actualIsHost;
      setResolvedIsHost(actualIsHost);

      // DO NOTHING on conflict: room_members has no UPDATE policy, so a merge upsert is rejected for anyone rejoining.
      const { error: membershipError } = await supabase
        .from("room_members")
        .upsert({ room_id: roomCode, user_id: userId }, { onConflict: "room_id,user_id", ignoreDuplicates: true });
      if (isStale()) return;
      if (membershipError) return membershipError.code === "23503" ? markRoomMissing() : fail();

      const current = supabase.channel(topic, {
        config: { private: true, broadcast: { self: false }, presence: { key: userId } },
      });
      channel = current;
      channelRef.current = current;
      const isCurrent = () => !disposed && channel === current;

      const syncMembers = () => {
        const state = current.presenceState<MemberPresence>();
        const nextMembers = Object.entries(state).flatMap(([memberId, entries]) => {
          const member = entries[0];
          return member ? [{ id: memberId, name: member.name, isHost: member.isHost }] : [];
        });
        if (isCurrent()) setMembers(nextMembers);
      };

      current
        .on("broadcast", { event: "room-event" }, ({ payload }) => {
          if (isCurrent()) onEventRef.current(payload as RoomEvent);
        })
        .on("presence", { event: "sync" }, syncMembers)
        .on<MemberPresence>("presence", { event: "join" }, ({ key, newPresences }) => {
          const member = newPresences[0];
          if (!isCurrent() || key === userId || !member) return;
          onMemberJoinRef.current?.({ id: key, name: member.name, isHost: member.isHost }, self);
        })
        .subscribe(async (channelStatus) => {
          if (!isCurrent()) return;
          if (channelStatus === "SUBSCRIBED") {
            failures = 0;
            cancelRetry();
            await current.track({ name: displayName(listenerNameRef.current, userId), isHost: actualIsHost });
            if (!isCurrent()) return;
            setStatus("connected");
            onResyncRef.current?.(self);
            return;
          }
          setStatus("error");
          scheduleRetry(CHANNEL_RECOVERY_GRACE_MS);
        });
    }

    function resume() {
      if (disposed || roomMissing) return;
      if (channel?.state === "joined" && supabase.realtime.isConnected()) {
        // A socket that died while the page slept still looks open; a heartbeat with the previous one unanswered closes it and reconnects.
        void supabase.realtime.sendHeartbeat();
        onResyncRef.current?.({ isHost: hostRef.current });
        return;
      }
      void connect();
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") resume();
    }

    window.addEventListener("online", resume);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    void connect();

    return () => {
      disposed = true;
      cancelRetry();
      window.removeEventListener("online", resume);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void leaveChannel();
    };
  }, [config, enabled, requestedHost, roomCode]);

  const realtimeConfigured = isSupabaseConfigured(config);
  const isHost = realtimeConfigured ? resolvedIsHost : requestedHost;
  return { status, members, isHost, broadcast, realtimeConfigured };
}

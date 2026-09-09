"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSupabaseBrowserClient, isSupabaseConfigured, type SupabaseBrowserConfig,
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
  | { kind: "state:request" }
  | { kind: "state:sync"; queue: QueueItem[]; mode: RoomMode; isPlaying: boolean; activeVideoId: string | null };

export type RealtimeStatus = "disabled" | "connecting" | "connected" | "error" | "room-not-found";
export type RoomMember = { id: string; name: string; isHost: boolean };

type Options = {
  enabled: boolean;
  roomCode: string;
  requestedHost: boolean;
  listenerName: string;
  onEvent: (event: RoomEvent) => void;
  supabase: SupabaseBrowserConfig;
};

export function useRoomRealtime({ enabled, roomCode, requestedHost, listenerName, onEvent, supabase: config }: Options) {
  const [status, setStatus] = useState<RealtimeStatus>(isSupabaseConfigured(config) ? "connecting" : "disabled");
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [resolvedIsHost, setResolvedIsHost] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

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

    let cancelled = false;
    let activeChannel: RealtimeChannel | null = null;

    async function connect() {
      setStatus("connecting");
      const { data: sessionData } = await supabase.auth.getSession();
      let session = sessionData.session;

      if (!session) {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error || !data.session) {
          if (!cancelled) setStatus("error");
          return;
        }
        session = data.session;
      }

      if (requestedHost) {
        const { error } = await supabase.from("rooms").insert({ id: roomCode, host_id: session.user.id });
        if (error && error.code !== "23505") {
          if (!cancelled) setStatus("error");
          return;
        }
      }

      const { data: room, error: roomError } = await supabase
        .from("rooms")
        .select("host_id")
        .eq("id", roomCode)
        .single();

      if (roomError || !room) {
        if (!cancelled) setStatus("room-not-found");
        return;
      }

      const actualIsHost = room.host_id === session.user.id;
      if (!cancelled) setResolvedIsHost(actualIsHost);

      const { error: membershipError } = await supabase
        .from("room_members")
        .upsert({ room_id: roomCode, user_id: session.user.id }, { onConflict: "room_id,user_id" });

      if (membershipError) {
        if (!cancelled) setStatus(membershipError.code === "23503" ? "room-not-found" : "error");
        return;
      }

      const channel = supabase.channel(`room:${roomCode}`, {
        config: { private: true, broadcast: { self: false }, presence: { key: session.user.id } },
      });
      activeChannel = channel;
      channelRef.current = channel;

      const syncMembers = () => {
        const state = channel.presenceState<{ name: string; isHost: boolean }>();
        const nextMembers = Object.entries(state).flatMap(([id, entries]) => {
          const member = entries[0];
          return member ? [{ id, name: member.name, isHost: member.isHost }] : [];
        });
        if (!cancelled) setMembers(nextMembers);
      };

      channel
        .on("broadcast", { event: "room-event" }, ({ payload }) => onEventRef.current(payload as RoomEvent))
        .on("presence", { event: "sync" }, syncMembers)
        .subscribe(async (channelStatus) => {
          if (channelStatus === "SUBSCRIBED") {
            await channel.track({ name: listenerName.trim() || `Listener ${session.user.id.slice(0, 4)}`, isHost: actualIsHost });
            if (!cancelled) setStatus("connected");
            if (!actualIsHost) {
              await channel.send({ type: "broadcast", event: "room-event", payload: { kind: "state:request" } });
            }
          }
          if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT") {
            if (!cancelled) setStatus("error");
          }
        });
    }

    void connect();
    return () => {
      cancelled = true;
      channelRef.current = null;
      if (activeChannel) void supabase.removeChannel(activeChannel);
    };
  }, [config, enabled, listenerName, requestedHost, roomCode]);

  const realtimeConfigured = isSupabaseConfigured(config);
  const isHost = realtimeConfigured ? resolvedIsHost : requestedHost;
  return { status, members, isHost, broadcast, realtimeConfigured };
}

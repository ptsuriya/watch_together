"use client";

import { Play } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { QueueItem } from "../../lib/room-state";
import { loadYouTubeApi, PlayerState, type YouTubePlayer as Player } from "../../lib/youtube";

/** Where the host's playback was, and the local time that snapshot arrived. */
export type PlaybackFollow = { position: number; at: number };
/** Resume point for one queue item, e.g. after the host's player was rebuilt for another layout. */
export type PlaybackResume = PlaybackFollow & { itemId: string };

const FOLLOW_TOLERANCE_S = 1.6;
const AUTOPLAY_CHECK_MS = 2500;

function expectedPosition(follow: PlaybackFollow, playing: boolean) {
  return follow.position + (playing ? (Date.now() - follow.at) / 1000 : 0);
}

export function YouTubePlayer({
  item,
  playing,
  controls,
  fullscreenButton = true,
  follow,
  resume,
  timeRef,
  onPlayingChange,
  onEnded,
  onError,
}: {
  item: QueueItem;
  playing: boolean;
  /** The host gets YouTube's own controls; a guest's player mirrors the host and takes no input. */
  controls: boolean;
  /** Off on the TV screen, where YouTube's own fullscreen would hide the QR and the key. */
  fullscreenButton?: boolean;
  /** Guests: keep the player within a second or two of the host. */
  follow?: PlaybackFollow;
  /** Host: where to start the item when the player loads it. */
  resume?: PlaybackResume;
  /** Receives a reader for the current playback position. */
  timeRef?: RefObject<(() => number | null) | null>;
  onPlayingChange?: (playing: boolean) => void;
  onEnded?: () => void;
  onError?: (code: number) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<Player | null>(null);
  const loadedItemRef = useRef<string | null>(null);
  const playingRef = useRef(playing);
  const followRef = useRef(follow);
  const resumeRef = useRef(resume);
  const callbacksRef = useRef({ onPlayingChange, onEnded, onError });
  const [ready, setReady] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    callbacksRef.current = { onPlayingChange, onEnded, onError };
    playingRef.current = playing;
    followRef.current = follow;
    resumeRef.current = resume;
  });

  useEffect(() => {
    let disposed = false;
    let player: Player | null = null;
    const mount = mountRef.current;

    loadYouTubeApi().then((YT) => {
      if (disposed || !mount) return;
      // YouTube replaces its target element with an iframe, so give it one that React does not own.
      const target = document.createElement("div");
      mount.append(target);
      player = new YT.Player(target, {
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        playerVars: {
          controls: controls ? 1 : 0,
          disablekb: controls ? 0 : 1,
          fs: fullscreenButton ? 1 : 0,
          rel: 0,
          playsinline: 1,
          iv_load_policy: 3,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            if (disposed) return;
            playerRef.current = player;
            setReady(true);
          },
          onStateChange: ({ data }) => {
            if (data === PlayerState.PLAYING) setBlocked(false);
            if (data === PlayerState.ENDED) callbacksRef.current.onEnded?.();
            if (data === PlayerState.PLAYING || data === PlayerState.PAUSED) {
              callbacksRef.current.onPlayingChange?.(data === PlayerState.PLAYING);
            }
          },
          onError: ({ data }) => callbacksRef.current.onError?.(data),
        },
      });
    }, () => {
      if (!disposed) setFailed(true);
    });

    return () => {
      disposed = true;
      playerRef.current = null;
      loadedItemRef.current = null;
      player?.destroy();
      mount?.replaceChildren();
    };
  }, [controls, fullscreenButton]);

  useEffect(() => {
    if (!timeRef) return;
    timeRef.current = () => {
      const time = playerRef.current?.getCurrentTime();
      return typeof time === "number" && Number.isFinite(time) ? time : null;
    };
    return () => {
      timeRef.current = null;
    };
  }, [timeRef]);

  // Load the item. A new queue entry reloads even when it is the same video as before.
  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || loadedItemRef.current === item.id) return;
    loadedItemRef.current = item.id;
    const resumeAt = resumeRef.current?.itemId === item.id ? resumeRef.current : undefined;
    const from = followRef.current ?? resumeAt;
    const startSeconds = from ? expectedPosition(from, playingRef.current) : 0;
    if (playingRef.current) player.loadVideoById({ videoId: item.videoId, startSeconds });
    else player.cueVideoById({ videoId: item.videoId, startSeconds });
  }, [item.id, item.videoId, ready]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player) return;
    const state = player.getPlayerState();
    const active = state === PlayerState.PLAYING || state === PlayerState.BUFFERING;
    if (playing && !active && state !== PlayerState.ENDED) player.playVideo();
    if (!playing && active) player.pauseVideo();
  }, [item.id, playing, ready]);

  // Browsers block autoplay with sound until the person interacts with the page; offer a button when that happens.
  useEffect(() => {
    if (!ready || !playing) return;
    const timeoutId = window.setTimeout(() => {
      const state = playerRef.current?.getPlayerState();
      if (state !== PlayerState.PLAYING && state !== PlayerState.BUFFERING && state !== PlayerState.ENDED) setBlocked(true);
    }, AUTOPLAY_CHECK_MS);
    return () => window.clearTimeout(timeoutId);
  }, [item.id, playing, ready]);

  useEffect(() => {
    const player = playerRef.current;
    if (!ready || !player || !follow || loadedItemRef.current !== item.id) return;
    const expected = expectedPosition(follow, playing);
    const current = player.getCurrentTime();
    if (Math.abs(current - expected) > FOLLOW_TOLERANCE_S) player.seekTo(expected, true);
  }, [follow, item.id, playing, ready]);

  function startPlayback() {
    const player = playerRef.current;
    if (!player) return;
    player.unMute();
    if (followRef.current) player.seekTo(expectedPosition(followRef.current, true), true);
    player.playVideo();
    setBlocked(false);
  }

  return (
    <div className="yt-frame">
      <div ref={mountRef} className="yt-mount" />
      {!controls && <div className="yt-shield" aria-hidden="true" />}
      {!ready && !failed && <div className="yt-overlay" aria-live="polite"><span className="spinner" aria-hidden="true" />กำลังโหลดวิดีโอ…</div>}
      {failed && <div className="yt-overlay">โหลดตัวเล่น YouTube ไม่ได้ ลองรีเฟรชหน้า</div>}
      {blocked && playing && (
        <div className="yt-overlay">
          <button type="button" className="btn btn-honey" onClick={startPlayback}>
            <Play size={18} fill="currentColor" aria-hidden="true" /> แตะเพื่อเล่นพร้อมห้อง
          </button>
        </div>
      )}
    </div>
  );
}

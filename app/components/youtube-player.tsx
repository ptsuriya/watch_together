"use client";

import { Play } from "lucide-react";
import { type CSSProperties, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { readHelperMessage, sendToHelper } from "../../lib/karaoke-key";
import { FLAT_EQ, type QueueItem, type RoomEq } from "../../lib/room-state";
import { canCrossfade, loadYouTubeApi, PlayerState, type YouTubePlayer as Player } from "../../lib/youtube";

/** Where the host's playback was, and the local time that snapshot arrived. */
export type PlaybackFollow = { position: number; at: number };
/** Resume point for one queue item, e.g. after the host's player was rebuilt for another layout. */
export type PlaybackResume = PlaybackFollow & { itemId: string };

const FOLLOW_TOLERANCE_S = 1.6;
const AUTOPLAY_CHECK_MS = 2500;
/** A skip in the middle of a song fades quickly; only a song reaching its end gets the full crossfade. */
const SKIP_FADE_S = 1.5;
const FADE_STEP_MS = 100;
const NEAR_END_CHECK_MS = 500;
/** Nudging the offset moves the video once the person stops, not on every step of the slider. */
const OFFSET_SETTLE_MS = 220;

type Deck = { player: Player | null; ready: boolean; itemId: string | null };
type Fade = { timer: number | undefined; finish: (() => void) | null };
type DeckEvents = {
  onReady: () => void;
  onStateChange: (index: number, state: number) => void;
  onError: (index: number, code: number) => void;
  onFailed: () => void;
};

function expectedPosition(follow: PlaybackFollow, playing: boolean) {
  return follow.position + (playing ? (Date.now() - follow.at) / 1000 : 0);
}

function isRunning(player: Player) {
  const state = player.getPlayerState();
  return state === PlayerState.PLAYING || state === PlayerState.BUFFERING;
}

function endFade(fade: Fade) {
  window.clearInterval(fade.timer);
  fade.timer = undefined;
  fade.finish?.();
  fade.finish = null;
}

/** Creates one YouTube player in `mount` and returns the teardown for it. */
function buildDeck(
  index: number,
  mount: HTMLDivElement | null,
  deck: Deck,
  options: { controls: boolean; fullscreenButton: boolean },
  events: DeckEvents,
) {
  let disposed = false;
  let player: Player | null = null;

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
        controls: options.controls ? 1 : 0,
        disablekb: options.controls ? 0 : 1,
        fs: options.fullscreenButton ? 1 : 0,
        rel: 0,
        playsinline: 1,
        iv_load_policy: 3,
        origin: window.location.origin,
      },
      events: {
        onReady: () => {
          if (disposed) return;
          deck.player = player;
          deck.ready = true;
          events.onReady();
        },
        onStateChange: ({ data }) => events.onStateChange(index, data),
        onError: ({ data }) => events.onError(index, data),
      },
    });
  }, () => {
    if (!disposed) events.onFailed();
  });

  return () => {
    disposed = true;
    deck.player = null;
    deck.ready = false;
    deck.itemId = null;
    player?.destroy();
    mount?.replaceChildren();
  };
}

/**
 * The room's YouTube player. It keeps two players ("decks") so one song can fade out while the next fades in.
 */
export function YouTubePlayer({
  item,
  playing,
  controls,
  fullscreenButton = true,
  crossfade = 0,
  hasNext = false,
  semitones,
  vocalCut = 0,
  eq,
  follow,
  offset = 0,
  resume,
  timeRef,
  onPlayingChange,
  onEnded,
  onNearEnd,
  onError,
}: {
  item: QueueItem;
  playing: boolean;
  /** The host gets YouTube's own controls; a guest's player mirrors the host and takes no input. */
  controls: boolean;
  /** Off on the TV screen, where YouTube's own fullscreen would hide the QR and the key. */
  fullscreenButton?: boolean;
  /** Seconds of overlap between songs; 0 switches without a fade. */
  crossfade?: number;
  /** Host: there is a next song, so the end of this one should start it. */
  hasNext?: boolean;
  /** Karaoke host: the key to ask the KUMA Karaoke Key extension for. */
  semitones?: number;
  /** Karaoke: how much of the centre channel the extension should subtract, to thin the guide vocal. */
  vocalCut?: number;
  /** Karaoke: the room's three EQ bands, in dB. */
  eq?: RoomEq;
  /** Guests: keep the player within a second or two of the host. */
  follow?: PlaybackFollow;
  /** Guests: seconds this device plays ahead of the host, to cancel the delay of a screen someone is sharing. */
  offset?: number;
  /** Host: where to start the item when the player loads it. */
  resume?: PlaybackResume;
  /** Receives a reader for the current playback position. */
  timeRef?: RefObject<(() => number | null) | null>;
  onPlayingChange?: (playing: boolean) => void;
  onEnded?: () => void;
  /** Host: this song is within the crossfade of its end. */
  onNearEnd?: () => void;
  onError?: (code: number) => void;
}) {
  const mountA = useRef<HTMLDivElement>(null);
  const mountB = useRef<HTMLDivElement>(null);
  const decksRef = useRef<Deck[]>([
    { player: null, ready: false, itemId: null },
    { player: null, ready: false, itemId: null },
  ]);
  const activeRef = useRef(0);
  const fadeRef = useRef<Fade>({ timer: undefined, finish: null });
  const nearEndItemRef = useRef<string | null>(null);
  /** The room's own volume. Read from the player between fades, never from the middle of one. */
  const baseVolumeRef = useRef(100);
  const { low, mid, high } = eq ?? FLAT_EQ;
  // Kept as three numbers so the effect below can depend on the values, not on a new object every render.
  const tone = useMemo(() => ({ low, mid, high }), [high, low, mid]);
  const latest = useRef({ playing, follow, offset, resume, semitones, vocalCut, tone, onPlayingChange, onEnded, onError });
  /** The offset this player has already moved to, so a fresh one can move it at once. */
  const offsetRef = useRef(offset);
  const [active, setActive] = useState(0);
  const [readyCount, setReadyCount] = useState(0);
  const [fadeSeconds, setFadeSeconds] = useState(0);
  const [blocked, setBlocked] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Sticky: once built, the second deck stays, so turning crossfade off never interrupts the song playing on it. */
  const [twoDecks, setTwoDecks] = useState(false);
  const sendsKey = semitones !== undefined;

  useEffect(() => {
    latest.current = { playing, follow, offset, resume, semitones, vocalCut, tone, onPlayingChange, onEnded, onError };
  });

  useEffect(() => {
    if (crossfade <= 0 || twoDecks) return;
    const timeoutId = window.setTimeout(() => setTwoDecks(canCrossfade()), 0);
    return () => window.clearTimeout(timeoutId);
  }, [crossfade, twoDecks]);

  // Rebuilding a player is the only way to change YouTube's player options, so these depend on them.
  useEffect(() => {
    const decks = decksRef.current;
    const fade = fadeRef.current;
    const events: DeckEvents = {
      onReady: () => setReadyCount((count) => count + 1),
      onStateChange: (index, state) => {
        // The deck fading out keeps sending events; only the one in front speaks for the room.
        if (index !== activeRef.current) return;
        if (state === PlayerState.PLAYING) setBlocked(false);
        if (state === PlayerState.ENDED) latest.current.onEnded?.();
        if (state === PlayerState.PLAYING || state === PlayerState.PAUSED) {
          latest.current.onPlayingChange?.(state === PlayerState.PLAYING);
        }
      },
      onError: (index, code) => {
        if (index === activeRef.current) latest.current.onError?.(code);
      },
      onFailed: () => setFailed(true),
    };
    const options = { controls, fullscreenButton };
    const teardowns = [buildDeck(0, mountA.current, decks[0], options, events)];
    if (twoDecks) teardowns.push(buildDeck(1, mountB.current, decks[1], options, events));
    return () => {
      endFade(fade);
      activeRef.current = 0;
      teardowns.forEach((teardown) => teardown());
    };
  }, [controls, fullscreenButton, twoDecks]);

  useEffect(() => {
    if (!timeRef) return;
    timeRef.current = () => {
      const time = decksRef.current[activeRef.current].player?.getCurrentTime();
      return typeof time === "number" && Number.isFinite(time) ? time : null;
    };
    return () => {
      timeRef.current = null;
    };
  }, [timeRef]);

  // Load the item, fading from the deck that is playing when there is one.
  useEffect(() => {
    const current = decksRef.current[activeRef.current];
    if (!current.ready || !current.player || current.itemId === item.id) return;

    const { playing: wantPlaying, follow: followNow, resume: resumeNow } = latest.current;
    const resumeAt = resumeNow?.itemId === item.id ? resumeNow : undefined;
    const from = followNow ?? resumeAt;
    // Only a guest following the host carries the offset; the host's own resume point is already right.
    const startSeconds = from ? Math.max(0, expectedPosition(from, wantPlaying) + (followNow ? latest.current.offset : 0)) : 0;
    const video = { videoId: item.videoId, startSeconds };
    const outgoing = current.player;

    const otherIndex = activeRef.current === 0 ? 1 : 0;
    const other = decksRef.current[otherIndex];
    const canFade = crossfade > 0 && wantPlaying && current.itemId !== null && other.ready && other.player && isRunning(outgoing);

    endFade(fadeRef.current);
    if (!canFade || !other.player) {
      current.itemId = item.id;
      if (wantPlaying) outgoing.loadVideoById(video);
      else outgoing.cueVideoById(video);
      return;
    }

    const remaining = outgoing.getDuration() - outgoing.getCurrentTime();
    const seconds = remaining <= crossfade + 2 ? crossfade : Math.min(SKIP_FADE_S, crossfade);
    const incoming = other.player;
    // Taking it from the player here would pick up a half-faded value and leave every song quieter than the last.
    const volume = Math.max(baseVolumeRef.current, 1);
    incoming.setVolume(0);
    incoming.loadVideoById(video);
    other.itemId = item.id;
    activeRef.current = otherIndex;
    setActive(otherIndex);
    setFadeSeconds(seconds);

    const startedAt = performance.now();
    // Setting the volume a player already believes it has does nothing, and after loading a video its belief and the
    // sound can disagree — so nudge it to another value first.
    const forceVolume = (player: Player, level: number) => {
      player.setVolume(level === 0 ? 1 : Math.max(0, level - 1));
      player.setVolume(level);
    };
    // A browser can swallow the second player's autoplay; ask again while the fade is still running.
    const keepPlaying = [600, 1600].map((delay) => window.setTimeout(() => {
      if (!isRunning(incoming)) incoming.playVideo();
    }, delay));
    fadeRef.current.finish = () => {
      keepPlaying.forEach((timer) => window.clearTimeout(timer));
      outgoing.pauseVideo();
      forceVolume(outgoing, volume);
      forceVolume(incoming, volume);
      // A player also restores its own remembered volume shortly after a video starts, so insist for a moment.
      [400, 1200, 2500].forEach((delay) => window.setTimeout(() => forceVolume(incoming, volume), delay));
    };
    fadeRef.current.timer = window.setInterval(() => {
      const progress = Math.min(1, (performance.now() - startedAt) / (seconds * 1000));
      outgoing.setVolume(Math.round(volume * (1 - progress)));
      incoming.setVolume(Math.round(volume * progress));
      if (progress >= 1) endFade(fadeRef.current);
    }, FADE_STEP_MS);
  }, [crossfade, item.id, item.videoId, readyCount]);

  useEffect(() => {
    const deck = decksRef.current[activeRef.current];
    if (!deck.ready || !deck.player) return;
    const player = deck.player;
    if (playing && !isRunning(player) && player.getPlayerState() !== PlayerState.ENDED) player.playVideo();
    if (!playing) {
      // Pausing in the middle of a crossfade settles it straight away.
      endFade(fadeRef.current);
      if (isRunning(player)) player.pauseVideo();
    }
  }, [active, item.id, playing, readyCount]);

  // Follow the volume the person actually chose, sampled only while no fade is moving it.
  useEffect(() => {
    if (!playing || readyCount === 0) return;
    const intervalId = window.setInterval(() => {
      if (fadeRef.current.timer !== undefined) return;
      const volume = decksRef.current[activeRef.current].player?.getVolume();
      if (typeof volume === "number" && Number.isFinite(volume) && volume > 0) baseVolumeRef.current = volume;
    }, 1000);
    return () => window.clearInterval(intervalId);
  }, [playing, readyCount]);

  // Browsers block autoplay with sound until the person interacts with the page; offer a button when that happens.
  useEffect(() => {
    if (!playing || readyCount === 0) return;
    const timeoutId = window.setTimeout(() => {
      const state = decksRef.current[activeRef.current].player?.getPlayerState();
      if (state !== PlayerState.PLAYING && state !== PlayerState.BUFFERING && state !== PlayerState.ENDED) setBlocked(true);
    }, AUTOPLAY_CHECK_MS);
    return () => window.clearTimeout(timeoutId);
  }, [active, item.id, playing, readyCount]);

  useEffect(() => {
    const deck = decksRef.current[activeRef.current];
    if (!deck.ready || !deck.player || !follow || deck.itemId !== item.id) return;
    const player = deck.player;
    const target = () => {
      const now = latest.current.follow ?? follow;
      return Math.max(0, expectedPosition(now, latest.current.playing) + latest.current.offset);
    };
    if (offsetRef.current !== offset) {
      const timeoutId = window.setTimeout(() => {
        offsetRef.current = offset;
        player.seekTo(target(), true);
      }, OFFSET_SETTLE_MS);
      return () => window.clearTimeout(timeoutId);
    }
    if (Math.abs(player.getCurrentTime() - target()) > FOLLOW_TOLERANCE_S) player.seekTo(target(), true);
  }, [active, follow, item.id, offset, playing, readyCount]);

  // Host: start the next song while this one is still ending.
  useEffect(() => {
    if (!onNearEnd || !hasNext || !playing || crossfade <= 0 || !twoDecks) return;
    const intervalId = window.setInterval(() => {
      const deck = decksRef.current[activeRef.current];
      if (!deck.player || deck.itemId !== item.id || nearEndItemRef.current === item.id) return;
      const duration = deck.player.getDuration();
      const remaining = duration - deck.player.getCurrentTime();
      if (duration > crossfade + 6 && remaining > 0 && remaining <= crossfade) {
        nearEndItemRef.current = item.id;
        onNearEnd();
      }
    }, NEAR_END_CHECK_MS);
    return () => window.clearInterval(intervalId);
  }, [crossfade, hasNext, item.id, onNearEnd, playing, twoDecks]);

  // Karaoke: tell the extension inside the playing deck which key to use, and how much voice to take out.
  useEffect(() => {
    if (semitones === undefined) return;
    sendToHelper(decksRef.current[activeRef.current].player?.getIframe(), { type: "key", semitones });
  }, [active, item.id, readyCount, semitones]);

  useEffect(() => {
    if (semitones === undefined) return;
    sendToHelper(decksRef.current[activeRef.current].player?.getIframe(), { type: "vocals", amount: vocalCut });
  }, [active, item.id, readyCount, semitones, vocalCut]);

  useEffect(() => {
    if (semitones === undefined) return;
    sendToHelper(decksRef.current[activeRef.current].player?.getIframe(), { type: "eq", ...tone });
  }, [active, item.id, readyCount, semitones, tone]);

  // A freshly loaded embed announces itself; it needs the current key again.
  useEffect(() => {
    if (!sendsKey) return;
    const handleMessage = (event: MessageEvent) => {
      const message = readHelperMessage(event);
      const frame = decksRef.current[activeRef.current].player?.getIframe();
      if (message?.type !== "ready" || !frame || event.source !== frame.contentWindow) return;
      sendToHelper(frame, { type: "key", semitones: latest.current.semitones ?? 0 });
      sendToHelper(frame, { type: "vocals", amount: latest.current.vocalCut });
      sendToHelper(frame, { type: "eq", ...latest.current.tone });
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [sendsKey]);

  function startPlayback() {
    const player = decksRef.current[activeRef.current].player;
    if (!player) return;
    player.unMute();
    if (latest.current.follow) player.seekTo(expectedPosition(latest.current.follow, true), true);
    player.playVideo();
    setBlocked(false);
  }

  return (
    <div className="yt-frame" style={{ "--deck-fade": `${fadeSeconds}s` } as CSSProperties}>
      <div ref={mountA} className={`yt-mount${active === 0 ? " is-active" : ""}`} />
      <div ref={mountB} className={`yt-mount${active === 1 ? " is-active" : ""}`} hidden={!twoDecks} />
      {!controls && <div className="yt-shield" aria-hidden="true" />}
      {readyCount === 0 && !failed && <div className="yt-overlay" aria-live="polite"><span className="spinner" aria-hidden="true" />กำลังโหลดวิดีโอ…</div>}
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

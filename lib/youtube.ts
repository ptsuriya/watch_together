import { isVideoId, VIDEO_ID_PATTERN } from "./room-state";

/**
 * Finds the video id in anything a person might paste: a watch, share, Shorts, live or embed link, the text the
 * YouTube app shares ("Title https://youtu.be/…"), or a bare id.
 */
export function parseYouTubeId(input: string): string | null {
  const value = input.trim();
  if (VIDEO_ID_PATTERN.test(value)) return value;

  const candidate = value.match(/https?:\/\/\S+/i)?.[0] ?? value.split(/\s+/).find((part) => /youtu/i.test(part));
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id = url.searchParams.get("v") ?? url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/)?.[1] ?? null;
  }
  return isVideoId(id) ? id : null;
}

/** The playlist id in a link, if there is one worth reading. */
export function parsePlaylistId(input: string): string | null {
  const candidate = input.trim().match(/https?:\/\/\S+/i)?.[0] ?? input.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(candidate) ? candidate : `https://${candidate}`);
  } catch {
    return null;
  }
  if (!/(^|\.)youtube\.com$|(^|\.)youtu\.be$/.test(url.hostname)) return null;
  const list = url.searchParams.get("list");
  return list && /^[\w-]{2,64}$/.test(list) ? list : null;
}

export type PlaylistItem = { videoId: string; title: string; channel: string };
export type PlaylistLookup =
  | { ok: true; items: PlaylistItem[] }
  | { ok: false; reason: "mix" | "missing" | "no-key" | "lookup" };

/** The songs in a public playlist, or why the room could not read it. */
export async function lookupPlaylist(list: string): Promise<PlaylistLookup> {
  try {
    const response = await fetch(`/api/playlist?list=${encodeURIComponent(list)}`, { signal: AbortSignal.timeout(8000) });
    const data = (await response.json()) as { items?: PlaylistItem[]; error?: string };
    if (response.ok && Array.isArray(data.items)) return { ok: true, items: data.items };
    const reason = data.error;
    if (reason === "mix" || reason === "missing" || reason === "no-key") return { ok: false, reason };
    return { ok: false, reason: "lookup" };
  } catch {
    return { ok: false, reason: "lookup" };
  }
}

export type VideoLookup =
  | { playable: true; title?: string; channel?: string }
  | { playable: false; reason: "embed" | "missing" };

/** Title and channel for a video, or why it cannot play in the room. Falls back to playable when the lookup fails. */
export async function lookupVideo(videoId: string): Promise<VideoLookup> {
  try {
    const response = await fetch(`/api/video?id=${videoId}`, { signal: AbortSignal.timeout(4000) });
    if (!response.ok) return { playable: true };
    return (await response.json()) as VideoLookup;
  } catch {
    return { playable: true };
  }
}

// The subset of the YouTube IFrame Player API this app uses.
// https://developers.google.com/youtube/iframe_api_reference

/**
 * Crossfading needs two players at different volumes, and iOS hands volume to the hardware buttons only,
 * so there both songs would play at full blast.
 */
export function canCrossfade() {
  if (typeof navigator === "undefined") return false;
  const agent = navigator.userAgent;
  return !/iPhone|iPad|iPod/.test(agent) && !(/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);
}

export const PlayerState = { UNSTARTED: -1, ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3, CUED: 5 } as const;

export type YouTubePlayer = {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  loadVideoById(options: { videoId: string; startSeconds?: number }): void;
  cueVideoById(options: { videoId: string; startSeconds?: number }): void;
  getCurrentTime(): number;
  getDuration(): number;
  getPlayerState(): number;
  getVolume(): number;
  setVolume(volume: number): void;
  getIframe(): HTMLIFrameElement;
  unMute(): void;
  destroy(): void;
};

type PlayerOptions = {
  host?: string;
  width?: string;
  height?: string;
  videoId?: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: () => void;
    onStateChange?: (event: { data: number }) => void;
    onError?: (event: { data: number }) => void;
  };
};

type YouTubeNamespace = { Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer };

declare global {
  interface Window {
    YT?: YouTubeNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiRequest: Promise<YouTubeNamespace> | null = null;

export function loadYouTubeApi(): Promise<YouTubeNamespace> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiRequest ??= new Promise<YouTubeNamespace>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => {
      apiRequest = null;
      script.remove();
      reject(new Error("The YouTube player could not load."));
    };
    document.head.append(script);
  });
  return apiRequest;
}

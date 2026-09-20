export type RoomMode = "watch" | "remote" | "karaoke";

export const ROOM_MODES = ["watch", "remote", "karaoke"] as const satisfies readonly RoomMode[];

export function parseRoomMode(value: string | null | undefined): RoomMode | undefined {
  // Links shared before "Order to host" became the remote mode.
  if (value === "order") return "remote";
  return ROOM_MODES.find((mode) => mode === value);
}

export type QueueItem = {
  id: string;
  videoId: string;
  title: string;
  channel: string;
  addedBy: string;
};

export type RoomState = {
  /** Changes every time the host page loads, so guests can tell a reloaded host from a room that was emptied. */
  session: string;
  mode: RoomMode;
  nowPlaying: QueueItem | null;
  /** Up next, not including the item that is playing. */
  queue: QueueItem[];
  isPlaying: boolean;
  /** Playback position in seconds at the moment the host sent this state. */
  position: number;
  /** Host notes, e.g. lyrics, shown to everyone in watch mode. */
  notes: string;
  /** Karaoke key offset in semitones. */
  key: number;
  /** Guests may edit the notes too, not only the host. */
  notesShared: boolean;
  /** Seconds the end of a song overlaps the start of the next one; 0 turns crossfading off. */
  crossfade: number;
  /** The host screen has the key-change extension, so key buttons change the sound (not only the number). */
  keyHelper: boolean;
};

export type RoomIntent =
  | { kind: "add"; item: QueueItem }
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "next" }
  | { kind: "key"; step: -1 | 0 | 1 }
  | { kind: "remove"; itemId: string }
  | { kind: "jump"; itemId: string }
  | { kind: "notes"; text: string }
  | { kind: "mode"; mode: RoomMode }
  | { kind: "playback"; playing: boolean }
  | { kind: "notesShared"; shared: boolean }
  | { kind: "crossfade"; seconds: number };

/** What a guest may ask the host to do. Everything else is host-only; "notes" only while the host shares them. */
export type GuestIntent = Extract<RoomIntent, { kind: "add" | "play" | "pause" | "next" | "key" | "notes" }>;

export type RoomEvent =
  | { kind: "intent"; intent: GuestIntent }
  | { kind: "state"; state: RoomState }
  | { kind: "state:request"; fromHost?: boolean }
  | { kind: "state:recover"; state: RoomState }
  | { kind: "react"; emoji: string; from: string };

export const MAX_QUEUE = 100;
export const MAX_NOTES = 20_000;
export const KEY_RANGE = 12;
export const CROSSFADE_OPTIONS = [0, 3, 6, 10] as const;
export const DEFAULT_CROSSFADE = 6;
export const REACTIONS = ["👏", "🔥", "😍", "😂", "🎉", "🐻", "❤️", "🍯", "🎤", "💯"] as const;

export const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

export function isVideoId(value: unknown): value is string {
  return typeof value === "string" && VIDEO_ID_PATTERN.test(value);
}

export function createRoomState(mode: RoomMode, session = ""): RoomState {
  return {
    session, mode, nowPlaying: null, queue: [], isPlaying: false, position: 0, notes: "", key: 0,
    notesShared: false, crossfade: DEFAULT_CROSSFADE, keyHelper: false,
  };
}

export function hasContent(state: RoomState) {
  return state.nowPlaying !== null || state.queue.length > 0 || state.notes.trim() !== "";
}

export function thumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

export function formatKey(key: number) {
  if (key === 0) return "0";
  return key > 0 ? `+${key}` : `−${Math.abs(key)}`;
}

export function reduceRoom(state: RoomState, intent: RoomIntent): RoomState {
  switch (intent.kind) {
    case "add": {
      const { item } = intent;
      if (state.nowPlaying?.id === item.id || state.queue.some((queued) => queued.id === item.id)) return state;
      if (!state.nowPlaying) return { ...state, nowPlaying: item, isPlaying: true, position: 0, key: 0 };
      if (state.queue.length >= MAX_QUEUE) return state;
      return { ...state, queue: [...state.queue, item] };
    }
    case "next": {
      const [next = null, ...rest] = state.queue;
      if (!state.nowPlaying && !next) return state;
      // A new song starts in its original key, the same way Transpose starts new songs by default.
      return { ...state, nowPlaying: next, queue: rest, isPlaying: next !== null, position: 0, key: 0 };
    }
    case "jump": {
      const item = state.queue.find((queued) => queued.id === intent.itemId);
      if (!item) return state;
      return { ...state, nowPlaying: item, queue: state.queue.filter((queued) => queued !== item), isPlaying: true, position: 0, key: 0 };
    }
    case "remove": {
      const queue = state.queue.filter((queued) => queued.id !== intent.itemId);
      return queue.length === state.queue.length ? state : { ...state, queue };
    }
    case "play":
    case "pause":
    case "playback": {
      const playing = intent.kind === "playback" ? intent.playing : intent.kind === "play";
      if (!state.nowPlaying || state.isPlaying === playing) return state;
      return { ...state, isPlaying: playing };
    }
    case "key": {
      if (state.mode !== "karaoke") return state;
      const key = intent.step === 0 ? 0 : Math.max(-KEY_RANGE, Math.min(KEY_RANGE, state.key + intent.step));
      return key === state.key ? state : { ...state, key };
    }
    case "notes": {
      const notes = intent.text.slice(0, MAX_NOTES);
      return notes === state.notes ? state : { ...state, notes };
    }
    case "mode":
      return intent.mode === state.mode ? state : { ...state, mode: intent.mode, key: 0 };
    case "notesShared":
      return intent.shared === state.notesShared ? state : { ...state, notesShared: intent.shared };
    case "crossfade": {
      const seconds = parseCrossfade(intent.seconds);
      return seconds === state.crossfade ? state : { ...state, crossfade: seconds };
    }
  }
}

function parseCrossfade(value: unknown) {
  return CROSSFADE_OPTIONS.find((option) => option === value) ?? DEFAULT_CROSSFADE;
}

export function isReaction(value: unknown): value is (typeof REACTIONS)[number] {
  return REACTIONS.some((reaction) => reaction === value);
}

// Everything below reads payloads from other room members, which any member can forge. Keep only well-formed fields.

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sanitizeItem(value: unknown): QueueItem | null {
  if (!isRecord(value) || !isVideoId(value.videoId)) return null;
  const id = text(value.id, 64);
  if (!id) return null;
  return {
    id,
    videoId: value.videoId,
    title: text(value.title, 200) || "วิดีโอ YouTube",
    channel: text(value.channel, 100),
    addedBy: text(value.addedBy, 32) || "ผู้ฟัง",
  };
}

export function sanitizeState(value: unknown): RoomState | null {
  if (!isRecord(value)) return null;
  const mode = parseRoomMode(typeof value.mode === "string" ? value.mode : undefined);
  if (!mode) return null;
  const nowPlaying = value.nowPlaying === null ? null : sanitizeItem(value.nowPlaying);
  const queue = Array.isArray(value.queue)
    ? value.queue.slice(0, MAX_QUEUE).flatMap((item) => sanitizeItem(item) ?? [])
    : [];
  const position = typeof value.position === "number" && Number.isFinite(value.position) ? Math.max(0, value.position) : 0;
  const key = typeof value.key === "number" && Number.isInteger(value.key) ? Math.max(-KEY_RANGE, Math.min(KEY_RANGE, value.key)) : 0;
  return {
    session: text(value.session, 40),
    mode,
    nowPlaying,
    queue,
    isPlaying: value.isPlaying === true && nowPlaying !== null,
    position,
    notes: typeof value.notes === "string" ? value.notes.slice(0, MAX_NOTES) : "",
    key,
    notesShared: value.notesShared === true,
    crossfade: parseCrossfade(value.crossfade),
    keyHelper: value.keyHelper === true,
  };
}

export function sanitizeGuestIntent(value: unknown): GuestIntent | null {
  if (!isRecord(value)) return null;
  switch (value.kind) {
    case "add": {
      const item = sanitizeItem(value.item);
      return item ? { kind: "add", item } : null;
    }
    case "play":
    case "pause":
    case "next":
      return { kind: value.kind };
    case "key":
      return value.step === -1 || value.step === 0 || value.step === 1 ? { kind: "key", step: value.step } : null;
    case "notes":
      return typeof value.text === "string" ? { kind: "notes", text: value.text.slice(0, MAX_NOTES) } : null;
    default:
      return null;
  }
}

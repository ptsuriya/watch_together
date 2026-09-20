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
  /** The notes panel is on screen at all. */
  notesOn: boolean;
  /** Guests may edit the notes too, not only the host. */
  notesShared: boolean;
  /** Seconds the end of a song overlaps the start of the next one; 0 turns crossfading off. */
  crossfade: number;
  /** The host screen has the key-change extension, so key buttons change the sound (not only the number). */
  keyHelper: boolean;
  /** Messages from phones fly across the screen. */
  chat: boolean;
  /** Who may change the key: the host alone, the person who queued the song, or anyone in the room. */
  keyControl: KeyControl;
};

/** 0 resets to the original key; the rest move a whole or half semitone. */
export type KeyStep = -1 | -0.5 | 0 | 0.5 | 1;
export const KEY_STEPS = [-1, -0.5, 0, 0.5, 1] as const satisfies readonly KeyStep[];

export type KeyControl = "host" | "owner" | "everyone";
export const KEY_CONTROL_OPTIONS = ["everyone", "owner", "host"] as const satisfies readonly KeyControl[];

export type RoomIntent =
  | { kind: "add"; item: QueueItem }
  | { kind: "play" }
  | { kind: "pause" }
  | { kind: "next" }
  | { kind: "key"; step: KeyStep; from?: string }
  | { kind: "remove"; itemId: string }
  | { kind: "jump"; itemId: string }
  | { kind: "notes"; text: string }
  | { kind: "mode"; mode: RoomMode }
  | { kind: "playback"; playing: boolean }
  | { kind: "notesOn"; enabled: boolean }
  | { kind: "notesShared"; shared: boolean }
  | { kind: "crossfade"; seconds: number }
  | { kind: "chat"; enabled: boolean }
  | { kind: "keyControl"; value: KeyControl };

/** What a guest may ask the host to do. Everything else is host-only; "notes" only while the host shares them. */
export type GuestIntent = Extract<RoomIntent, { kind: "add" | "play" | "pause" | "next" | "key" | "notes" }>;

export type RoomEvent =
  | { kind: "intent"; intent: GuestIntent }
  | { kind: "state"; state: RoomState }
  | { kind: "state:request"; fromHost?: boolean }
  | { kind: "state:recover"; state: RoomState }
  | { kind: "react"; emoji: string; from: string }
  | { kind: "chat"; text: string; from: string };

export const MAX_QUEUE = 100;
export const MAX_NOTES = 20_000;
export const KEY_RANGE = 12;
export const CROSSFADE_OPTIONS = [0, 3, 6, 10] as const;
export const DEFAULT_CROSSFADE = 6;
export const MAX_CHAT = 80;
export const REACTIONS = ["👏", "🔥", "😍", "😂", "🎉", "🐻", "❤️", "🍯", "🎤", "💯"] as const;

export const VIDEO_ID_PATTERN = /^[\w-]{11}$/;

export function isVideoId(value: unknown): value is string {
  return typeof value === "string" && VIDEO_ID_PATTERN.test(value);
}

export function createRoomState(mode: RoomMode, session = ""): RoomState {
  return {
    session, mode, nowPlaying: null, queue: [], isPlaying: false, position: 0, notes: "", key: 0,
    notesOn: true, notesShared: false, crossfade: DEFAULT_CROSSFADE, keyHelper: false, chat: true, keyControl: "everyone",
  };
}

export function hasContent(state: RoomState) {
  return state.nowPlaying !== null || state.queue.length > 0 || state.notes.trim() !== "";
}

export function thumbnailUrl(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}

/** Keys move in half semitones, so keep them on that grid and inside the range. */
export function clampKey(key: number) {
  return Math.max(-KEY_RANGE, Math.min(KEY_RANGE, Math.round(key * 2) / 2));
}

export function formatKey(key: number) {
  const size = Number.isInteger(key) ? String(Math.abs(key)) : Math.abs(key).toFixed(1);
  if (key === 0) return "0";
  return key > 0 ? `+${size}` : `−${size}`;
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
      const key = intent.step === 0 ? 0 : clampKey(state.key + intent.step);
      return key === state.key ? state : { ...state, key };
    }
    case "notes": {
      const notes = intent.text.slice(0, MAX_NOTES);
      return notes === state.notes ? state : { ...state, notes };
    }
    case "mode":
      return intent.mode === state.mode ? state : { ...state, mode: intent.mode, key: 0 };
    case "notesOn":
      return intent.enabled === state.notesOn ? state : { ...state, notesOn: intent.enabled };
    case "notesShared":
      return intent.shared === state.notesShared ? state : { ...state, notesShared: intent.shared };
    case "crossfade": {
      const seconds = parseCrossfade(intent.seconds);
      return seconds === state.crossfade ? state : { ...state, crossfade: seconds };
    }
    case "chat":
      return intent.enabled === state.chat ? state : { ...state, chat: intent.enabled };
    case "keyControl":
      return intent.value === state.keyControl ? state : { ...state, keyControl: intent.value };
  }
}

function parseCrossfade(value: unknown) {
  return CROSSFADE_OPTIONS.find((option) => option === value) ?? DEFAULT_CROSSFADE;
}

function parseKeyControl(value: unknown): KeyControl {
  return KEY_CONTROL_OPTIONS.find((option) => option === value) ?? "everyone";
}

/** Whether a guest with this display name may change the key right now. */
export function mayChangeKey(state: RoomState, from: string | undefined) {
  if (state.keyControl === "everyone") return true;
  if (state.keyControl === "owner") return Boolean(from) && from === state.nowPlaying?.addedBy;
  return false;
}

export function sanitizeChat(text: unknown) {
  return typeof text === "string" ? text.replace(/\s+/g, " ").trim().slice(0, MAX_CHAT) : "";
}

/** One emoji character (with its optional skin tone, variation selector or joined parts). */
const SINGLE_EMOJI = /^\p{Extended_Pictographic}(\u200d\p{Extended_Pictographic}|[\uFE0F\u20E3]|\p{Emoji_Modifier})*$/u;

/** Everyone may bring one emoji of their own, so anything that is a single emoji is allowed through. */
export function sanitizeReaction(value: unknown) {
  if (typeof value !== "string") return null;
  const emoji = value.trim();
  if (!emoji || emoji.length > 12) return null;
  return SINGLE_EMOJI.test(emoji) ? emoji : null;
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
  const key = typeof value.key === "number" && Number.isFinite(value.key) ? clampKey(value.key) : 0;
  return {
    session: text(value.session, 40),
    mode,
    nowPlaying,
    queue,
    isPlaying: value.isPlaying === true && nowPlaying !== null,
    position,
    notes: typeof value.notes === "string" ? value.notes.slice(0, MAX_NOTES) : "",
    key,
    notesOn: value.notesOn !== false,
    notesShared: value.notesShared === true,
    crossfade: parseCrossfade(value.crossfade),
    keyHelper: value.keyHelper === true,
    chat: value.chat !== false,
    keyControl: parseKeyControl(value.keyControl),
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
    case "key": {
      const step = KEY_STEPS.find((option) => option === value.step);
      return step === undefined ? null : { kind: "key", step, from: text(value.from, 32) || undefined };
    }
    case "notes":
      return typeof value.text === "string" ? { kind: "notes", text: value.text.slice(0, MAX_NOTES) } : null;
    default:
      return null;
  }
}

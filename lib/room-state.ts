export type RoomMode = "watch" | "remote" | "karaoke" | "singalong";

export const ROOM_MODES = ["watch", "remote", "karaoke", "singalong"] as const satisfies readonly RoomMode[];

/** Both karaoke modes: the room carries a key, and the queue talks about who sings. */
export function isKaraoke(mode: RoomMode) {
  return mode === "karaoke" || mode === "singalong";
}

/** Everyone plays the video on their own device, instead of watching one screen the host runs. */
export function hasOwnScreens(mode: RoomMode) {
  return mode === "watch" || mode === "singalong";
}

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
  /** Who queued it. The host fills this in; it is what per-person limits and the mic bomb count. */
  addedById?: string;
  /** Blind karaoke: the person the room picked to sing it, who had no say in the song. */
  singer?: string;
  /** Vote mode: the member ids that want this one next. */
  votes?: string[];
};

/** Who sings: the person the room picked, or whoever queued it. */
export function singerOf(item: QueueItem) {
  return item.singer ?? item.addedBy;
}

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
  /** How much of the centre channel the room subtracts, to thin out the guide vocal: 0, 0.5 or 1. */
  vocalCut: number;
  /** Three bands in dB, for putting a thinned karaoke mix back into shape. */
  eq: RoomEq;
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
  /** A Jamulus server the room sings through, as host[:port]. Empty when the room is not using one. */
  voiceRoom: string;
  /** Who may change the key: the host alone, the person who queued the song, or anyone in the room. */
  keyControl: KeyControl;
  /** Member ids the host has given the run of the room: queue and settings, everything but handing out this right. */
  cohosts: string[];
  /** Member ids that were shown the door. Their own page leaves, and the host stops listening to them. */
  banned: string[];
  /** How many songs one guest may keep in the queue at a time; 0 lifts the limit. Hosts and co-hosts are free. */
  queueLimit: number;
  /** Which song comes next: the top of the queue, a random one, or the one with the most votes. */
  queueOrder: QueueOrder;
  /** The party game running in the room. */
  game: PartyGame;
  /** How long the mic bomb gives someone to find a song. */
  bombSeconds: number;
  /** Everyone rates the song that is playing, and the room sees the result when it ends. */
  scoring: boolean;
  /** Mic bomb: whose turn it is to find a song, and how long they have left. */
  spotlight: Spotlight | null;
  /** Scores for the song playing now, one per member id. */
  scores: Record<string, number>;
  /** The result card for the song that just ended; the host clears it after a few seconds. */
  lastScore: ScoreResult | null;
  /** Every song's average, kept per singer, so the night has a running table. */
  standings: Standing[];
  /** A knock-out running in the room: one song each per round, lowest score goes home. */
  tournament: Tournament | null;
  /**
   * Seconds the host's own screen runs ahead of the room. The host's ears can be late — Bluetooth headphones, a
   * soundbar — and only the other screens can move to meet them, so this travels with the room.
   */
  hostOffset: number;
};

/** How far any one screen may sit from the room, in seconds. */
export const MAX_OFFSET = 5;

export function clampOffset(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Math.round(value * 100) / 100));
}

export type QueueOrder = "line" | "random" | "vote";
export const QUEUE_ORDERS = ["line", "random", "vote"] as const satisfies readonly QueueOrder[];

/** Off, the mic bomb (the room hands someone the mic), or blind karaoke (you sing what someone else picked). */
export type PartyGame = "off" | "bomb" | "blind";
export const PARTY_GAMES = ["off", "bomb", "blind"] as const satisfies readonly PartyGame[];

export const QUEUE_LIMITS = [0, 1, 2, 3, 5] as const;
/** Long enough to find a song on a phone, short enough to stay a game. */
export const BOMB_SECONDS = 60;
export const BOMB_SECOND_OPTIONS = [30, 45, 60, 90, 120] as const;
export const SCORE_MAX = 5;
/** How long the room looks at the score of the song that just ended. */
export const SCORE_SHOW_MS = 12_000;

export type Spotlight = { memberId: string; name: string; seconds: number };
export type ScoreResult = { title: string; singer: string; average: number; count: number };
/**
 * A knock-out. Everyone still in sings one song a round; when the last of them has sung, the lowest score of that
 * round is out. The last one standing is the champion.
 */
export type TournamentFlash = { kind: "start" | "out" | "champion"; name: string; left: number };

/** Everyone sings every round, or the round is a set of head-to-head pairs. */
export type TourFormat = "solo" | "battle";
export const TOUR_FORMATS = ["solo", "battle"] as const satisfies readonly TourFormat[];

/** How the order (and so the pairs) is decided each round. */
export type TourSeeding = "random" | "score" | "pick";
export const TOUR_SEEDINGS = ["random", "score", "pick"] as const satisfies readonly TourSeeding[];

/** One head-to-head. A bye has nobody on the other side and goes through. */
export type TourPair = { a: string; b: string | null };

/** "pick" seeding: everyone chooses their own slot, in a random order of choosing. */
export type TourDraft = { order: string[]; turn: number; slots: (string | null)[] };

/** Genres a round can be about, the way a singing show does it. */
export const ROUND_THEMES = ["แร็พ", "ป็อป", "ฮิปฮอป", "ลูกทุ่ง", "ร็อค", "เพื่อชีวิต", "สากล", "อนิเมะ"] as const;
export const MAX_THEME = 24;

export type Tournament = {
  format: TourFormat;
  seeding: TourSeeding;
  /** What this round is about, e.g. a genre. Empty when the round is open. */
  theme: string;
  /** Battle format: this round's pairs, in bracket order. */
  pairs: TourPair[];
  /** Set while everyone is choosing their slot; nobody sings until it is done. */
  draft: TourDraft | null;
  round: number;
  /** Still in, in the order they joined. */
  players: string[];
  /** Knocked out, earliest first. */
  out: string[];
  /** Who has already sung this round. */
  done: string[];
  /** This round's scores, by name. */
  scores: Record<string, number>;
  champion: string | null;
  /** What the room should be told about, big, for a few seconds. */
  flash: TournamentFlash | null;
  /** The crossfade the room had before; a knock-out wants a clean stop between performances. */
  crossfadeBefore: number;
};
export const MAX_PLAYERS = 24;
/** How long the shared screen holds a tournament announcement. */
export const TOURNAMENT_FLASH_MS = 9000;

/** One singer's night: the songs they were scored on, and the times the mic bomb ran out on them. */
export type Standing = { name: string; total: number; songs: number; misses: number };
export const MAX_STANDINGS = 40;
/** What letting the mic bomb run out costs, in points. */
export const BOMB_PENALTY = 1;

/** The table the room reads: most points first, and more songs breaks a tie. */
export function standingsBoard(state: RoomState) {
  return [...state.standings]
    .map((row) => ({
      ...row,
      points: Math.round((row.total - row.misses * BOMB_PENALTY) * 10) / 10,
      average: row.songs > 0 ? Math.round((row.total / row.songs) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.points - a.points || b.songs - a.songs);
}

/** Adds to one singer's row, making it if this is their first time on the board. */
function addStanding(standings: Standing[], name: string, change: Partial<Standing>) {
  if (standings.some((row) => row.name === name)) {
    return standings.map((row) => (row.name === name
      ? { ...row, total: row.total + (change.total ?? 0), songs: row.songs + (change.songs ?? 0), misses: row.misses + (change.misses ?? 0) }
      : row));
  }
  return [...standings, { name, total: change.total ?? 0, songs: change.songs ?? 0, misses: change.misses ?? 0 }].slice(-MAX_STANDINGS);
}

export const MAX_COHOSTS = 10;
export const MAX_BANNED = 40;

/** 0 resets to the original key; the rest move a whole or half semitone. */
export type KeyStep = -1 | -0.5 | 0 | 0.5 | 1;
export const KEY_STEPS = [-1, -0.5, 0, 0.5, 1] as const satisfies readonly KeyStep[];
/** One press of the key buttons. The room counts these presses; the pitch shifter gets semitones. */
export const KEY_UNIT: KeyStep = 0.5;

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
  | { kind: "keyControl"; value: KeyControl }
  | { kind: "voiceRoom"; address: string }
  | { kind: "vocalCut"; amount: number }
  | { kind: "eq"; eq: RoomEq }
  | { kind: "cohost"; memberId: string; enabled: boolean }
  /** Show someone the door, or open it again for everyone. */
  | { kind: "kick"; memberId: string; by?: "host" | "cohost" }
  | { kind: "unban" }
  | { kind: "queueLimit"; count: number }
  | { kind: "queueOrder"; value: QueueOrder }
  | { kind: "game"; value: PartyGame }
  | { kind: "bombSeconds"; seconds: number }
  | { kind: "scoring"; enabled: boolean }
  /** The host fills in who voted; a guest only says which song. */
  | { kind: "vote"; itemId: string; memberId?: string }
  | { kind: "score"; value: number; memberId?: string }
  /** Hand the mic to someone at random. The host picks the person and the time. */
  | { kind: "bomb"; memberId?: string; name?: string; seconds?: number }
  /** missed: the countdown ran out with no song, which costs that person a point. */
  | { kind: "spotlightOff"; missed?: boolean }
  | { kind: "scoreClear" }
  | { kind: "standingsReset" }
  /** The host starts it with the room's names; anyone managing may call it off. */
  | { kind: "tournament"; action: "start" | "stop"; players?: string[]; format?: TourFormat; seeding?: TourSeeding }
  /** A player choosing their own slot in the bracket, from their own phone. */
  | { kind: "tournamentPick"; slot: number; name?: string }
  | { kind: "tournamentTheme"; theme: string }
  | { kind: "tournamentFlash" };

/** What a co-host may do on top of what everyone can: run the queue and the room's settings. */
export const MANAGER_INTENTS = [
  "remove", "jump", "mode", "crossfade", "chat", "notesOn", "notesShared",
  "queueLimit", "queueOrder", "game", "bombSeconds", "scoring", "bomb", "standingsReset", "tournament", "tournamentTheme", "vocalCut", "eq", "voiceRoom", "kick", "unban",
] as const;

/** What anyone in the room may send. The host decides which ones to honour, by who asked. */
export type GuestIntent = Extract<
  RoomIntent,
  { kind: "add" | "play" | "pause" | "next" | "key" | "notes" | "remove" | "jump" | "mode" | "crossfade" | "chat"
    | "notesOn" | "notesShared" | "queueLimit" | "queueOrder" | "game" | "bombSeconds" | "scoring" | "vote" | "score"
    | "bomb" | "standingsReset" | "tournament" | "tournamentPick" | "tournamentTheme" | "vocalCut" | "eq"
    | "voiceRoom" | "kick" | "unban" }
>;

export type RoomEvent =
  | { kind: "intent"; intent: GuestIntent; from?: string; fromId?: string }
  | { kind: "state"; state: RoomState }
  | { kind: "state:request"; fromHost?: boolean }
  | { kind: "state:recover"; state: RoomState }
  | { kind: "react"; emoji: string; from: string }
  | { kind: "chat"; text: string; from: string }
  /** A word from the host meant for one member, e.g. "your queue is full". */
  | { kind: "notice"; to: string; text: string };

export const MAX_QUEUE = 100;
export const MAX_NOTES = 20_000;
export const KEY_RANGE = 12;
export const CROSSFADE_OPTIONS = [0, 3, 6, 10] as const;
/** Off, half, and the whole centre channel. */
export const VOCAL_CUT_OPTIONS = [0, 0.5, 1] as const;

export type RoomEq = { low: number; mid: number; high: number };
export const EQ_RANGE = 8;
export const FLAT_EQ: RoomEq = { low: 0, mid: 0, high: 0 };

export function isFlatEq(eq: RoomEq) {
  return eq.low === 0 && eq.mid === 0 && eq.high === 0;
}

function parseBand(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(-EQ_RANGE, Math.min(EQ_RANGE, Math.round(value)));
}

export function parseEq(value: unknown): RoomEq {
  if (typeof value !== "object" || value === null) return { ...FLAT_EQ };
  const band = value as Record<string, unknown>;
  return { low: parseBand(band.low), mid: parseBand(band.mid), high: parseBand(band.high) };
}
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
    vocalCut: 0, eq: { ...FLAT_EQ }, notesOn: true, notesShared: false, crossfade: DEFAULT_CROSSFADE, keyHelper: false, chat: true, keyControl: "everyone",
    voiceRoom: "", cohosts: [], banned: [], queueLimit: 0, queueOrder: "line", game: "off", bombSeconds: BOMB_SECONDS, scoring: false,
    spotlight: null, scores: {}, lastScore: null,
    standings: [], tournament: null, hostOffset: 0,
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

/** What people see: one per press, not the half semitone underneath. */
export function formatKey(key: number) {
  const steps = Math.round(key / KEY_UNIT);
  if (steps === 0) return "0";
  return steps > 0 ? `+${steps}` : `−${Math.abs(steps)}`;
}

export function reduceRoom(state: RoomState, intent: RoomIntent): RoomState {
  switch (intent.kind) {
    case "add": {
      const { item } = intent;
      if (state.nowPlaying?.id === item.id || state.queue.some((queued) => queued.id === item.id)) return state;
      // Whoever the mic bomb landed on has found their song: it goes on next, and the countdown stops.
      const answered = Boolean(state.spotlight && item.addedById && state.spotlight.memberId === item.addedById);
      const spotlight = answered ? null : state.spotlight;
      if (!state.nowPlaying) return { ...state, nowPlaying: item, isPlaying: true, position: 0, key: 0, spotlight, scores: {} };
      if (state.queue.length >= MAX_QUEUE) return state;
      return { ...state, queue: answered ? [item, ...state.queue] : [...state.queue, item], spotlight };
    }
    case "next": {
      const [next, rest] = pickNext(state);
      if (!state.nowPlaying && !next) return state;
      // A new song starts in its original key, the same way Transpose starts new songs by default.
      return { ...state, nowPlaying: next, queue: rest, isPlaying: next !== null, position: 0, key: 0, ...closeScores(state) };
    }
    case "jump": {
      const item = state.queue.find((queued) => queued.id === intent.itemId);
      if (!item) return state;
      return {
        ...state, nowPlaying: item, queue: state.queue.filter((queued) => queued !== item),
        isPlaying: true, position: 0, key: 0, ...closeScores(state),
      };
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
      if (!isKaraoke(state.mode)) return state;
      const key = intent.step === 0 ? 0 : clampKey(state.key + intent.step);
      return key === state.key ? state : { ...state, key };
    }
    case "notes": {
      const notes = intent.text.slice(0, MAX_NOTES);
      return notes === state.notes ? state : { ...state, notes };
    }
    case "mode":
      if (intent.mode === state.mode) return state;
      return {
        ...state, mode: intent.mode, key: 0, vocalCut: 0, eq: { ...FLAT_EQ },
        // Watching together is not singing: the games, the scoring and the knock-out go quiet outside karaoke.
        ...(isKaraoke(intent.mode)
          ? {}
          : { game: "off" as PartyGame, spotlight: null, scoring: false, scores: {}, lastScore: null, tournament: null }),
      };
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
    case "voiceRoom": {
      const address = parseVoiceRoom(intent.address);
      return address === state.voiceRoom ? state : { ...state, voiceRoom: address };
    }
    case "eq": {
      const eq = parseEq(intent.eq);
      return isFlatEq({ low: eq.low - state.eq.low, mid: eq.mid - state.eq.mid, high: eq.high - state.eq.high })
        ? state
        : { ...state, eq };
    }
    case "vocalCut": {
      if (!isKaraoke(state.mode)) return state;
      const amount = VOCAL_CUT_OPTIONS.find((option) => option === intent.amount) ?? 0;
      return amount === state.vocalCut ? state : { ...state, vocalCut: amount };
    }
    case "cohost": {
      const has = state.cohosts.includes(intent.memberId);
      if (intent.enabled === has) return state;
      const cohosts = intent.enabled
        ? [...state.cohosts, intent.memberId].slice(-MAX_COHOSTS)
        : state.cohosts.filter((id) => id !== intent.memberId);
      return { ...state, cohosts };
    }
    case "kick": {
      if (!intent.memberId || state.banned.includes(intent.memberId)) return state;
      if (intent.by && intent.by !== "host" && state.cohosts.includes(intent.memberId)) return state;
      return {
        ...state,
        banned: [...state.banned, intent.memberId].slice(-MAX_BANNED),
        cohosts: state.cohosts.filter((id) => id !== intent.memberId),
      };
    }
    case "unban":
      return state.banned.length === 0 ? state : { ...state, banned: [] };
    case "queueLimit": {
      const count = QUEUE_LIMITS.find((option) => option === intent.count) ?? 0;
      return count === state.queueLimit ? state : { ...state, queueLimit: count };
    }
    case "queueOrder": {
      const value = QUEUE_ORDERS.find((option) => option === intent.value) ?? "line";
      return value === state.queueOrder ? state : { ...state, queueOrder: value };
    }
    case "game": {
      if (!isKaraoke(state.mode)) return state;
      const value = PARTY_GAMES.find((option) => option === intent.value) ?? "off";
      if (value === state.game) return state;
      return { ...state, game: value, spotlight: value === "bomb" ? state.spotlight : null };
    }
    case "bombSeconds": {
      if (!isKaraoke(state.mode)) return state;
      const seconds = BOMB_SECOND_OPTIONS.find((option) => option === intent.seconds) ?? BOMB_SECONDS;
      return seconds === state.bombSeconds ? state : { ...state, bombSeconds: seconds };
    }
    case "scoring": {
      if (!isKaraoke(state.mode) || intent.enabled === state.scoring) return state;
      return { ...state, scoring: intent.enabled, scores: {}, lastScore: null };
    }
    case "vote": {
      if (!intent.memberId) return state;
      const queue = state.queue.map((item) => {
        if (item.id !== intent.itemId) return item;
        const votes = item.votes ?? [];
        return { ...item, votes: votes.includes(intent.memberId!) ? votes.filter((id) => id !== intent.memberId) : [...votes, intent.memberId!] };
      });
      return { ...state, queue };
    }
    case "score": {
      if (!intent.memberId || !state.scoring || !state.nowPlaying) return state;
      const value = Math.max(1, Math.min(SCORE_MAX, Math.round(intent.value)));
      if (state.scores[intent.memberId] === value) return state;
      return { ...state, scores: { ...state.scores, [intent.memberId]: value } };
    }
    case "bomb": {
      if (!isKaraoke(state.mode) || !intent.memberId || !intent.name) return state;
      return { ...state, spotlight: { memberId: intent.memberId, name: intent.name, seconds: intent.seconds ?? BOMB_SECONDS } };
    }
    case "spotlightOff": {
      if (!state.spotlight) return state;
      const missed = intent.missed === true && state.scoring;
      const standings = missed ? addStanding(state.standings, state.spotlight.name, { misses: 1 }) : state.standings;
      return { ...state, spotlight: null, standings };
    }
    case "scoreClear":
      return state.lastScore ? { ...state, lastScore: null } : state;
    case "standingsReset":
      return state.standings.length === 0 ? state : { ...state, standings: [], scores: {}, lastScore: null };
    case "tournament": {
      if (intent.action === "stop") {
        if (!state.tournament) return state;
        // Give the room back the crossfade it had before the knock-out asked for clean endings.
        return { ...state, tournament: null, crossfade: parseCrossfade(state.tournament.crossfadeBefore) };
      }
      const players = (intent.players ?? []).slice(0, MAX_PLAYERS);
      if (players.length < 2 || !isKaraoke(state.mode)) return state;
      // A knock-out is decided by the room's scores, so it turns scoring on with it — and songs should end, not
      // melt into the next singer's, so the crossfade steps aside until it is over.
      return {
        ...state,
        scoring: true,
        scores: {},
        crossfade: 0,
        tournament: startTournament(players, intent.format, intent.seeding, state),
      };
    }
    case "tournamentTheme": {
      if (!state.tournament) return state;
      const theme = text(intent.theme, MAX_THEME);
      return theme === state.tournament.theme ? state : { ...state, tournament: { ...state.tournament, theme } };
    }
    case "tournamentPick": {
      const game = state.tournament;
      if (!game?.draft || !intent.name) return state;
      const draft = game.draft;
      // Only the person whose turn it is, and only into a slot nobody has taken.
      if (draft.order[draft.turn] !== intent.name) return state;
      if (intent.slot < 0 || intent.slot >= draft.slots.length || draft.slots[intent.slot] !== null) return state;
      const slots = draft.slots.map((name, at) => (at === intent.slot ? intent.name ?? null : name));
      const turn = draft.turn + 1;
      if (turn < draft.order.length) return { ...state, tournament: { ...game, draft: { ...draft, slots, turn } } };
      const order = slots.filter((name): name is string => name !== null);
      return { ...state, tournament: { ...game, draft: null, players: order, pairs: makePairs(game.format, order) } };
    }
    case "tournamentFlash": {
      if (!state.tournament?.flash) return state;
      return { ...state, tournament: { ...state.tournament, flash: null } };
    }
  }
}

/** What the room will play next, as far as anyone can know: random order keeps it a surprise until it happens. */
export function peekNext(state: RoomState): QueueItem | null {
  if (state.queue.length === 0 || state.queueOrder === "random") return null;
  if (state.queueOrder !== "vote") return state.queue[0];
  return state.queue.reduce((top, item) => ((item.votes?.length ?? 0) > (top.votes?.length ?? 0) ? item : top), state.queue[0]);
}

/** Which song plays next, and what is left of the queue. */
function pickNext(state: RoomState): [QueueItem | null, QueueItem[]] {
  if (state.queue.length === 0) return [null, []];
  let index = 0;
  if (state.queueOrder === "random") index = Math.floor(Math.random() * state.queue.length);
  if (state.queueOrder === "vote") {
    state.queue.forEach((item, at) => {
      if ((item.votes?.length ?? 0) > (state.queue[index].votes?.length ?? 0)) index = at;
    });
  }
  return [state.queue[index], state.queue.filter((_, at) => at !== index)];
}

/** The song is over: turn the scores people sent into the card the room sees, and start the next one clean. */
function closeScores(state: RoomState): Pick<RoomState, "scores" | "lastScore" | "standings" | "tournament"> {
  const values = Object.values(state.scores);
  if (!state.scoring || !state.nowPlaying || values.length === 0) {
    return { scores: {}, lastScore: null, standings: state.standings, tournament: state.tournament };
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  const average = Math.round((total / values.length) * 10) / 10;
  const singer = singerOf(state.nowPlaying);
  const standings = addStanding(state.standings, singer, { total: average, songs: 1 });
  return {
    scores: {},
    lastScore: { title: state.nowPlaying.title, singer, average, count: values.length },
    standings,
    tournament: state.tournament ? playRound(state.tournament, singer, average) : null,
  };
}

/** Sets a knock-out up: who is in it, in what order, and what the first round looks like. */
function startTournament(players: string[], format: unknown, seeding: unknown, state: RoomState): Tournament {
  const shape = TOUR_FORMATS.find((option) => option === format) ?? "solo";
  const how = TOUR_SEEDINGS.find((option) => option === seeding) ?? "random";
  const ordered = how === "score" ? bySeason(players, state) : shuffle(players);
  const drafting = how === "pick";
  return {
    format: shape,
    seeding: how,
    theme: "",
    round: 1,
    players: drafting ? players : ordered,
    pairs: drafting ? [] : makePairs(shape, ordered),
    draft: drafting ? { order: shuffle(players), turn: 0, slots: players.map(() => null) } : null,
    out: [],
    done: [],
    scores: {},
    champion: null,
    flash: { kind: "start", name: "", left: players.length },
    crossfadeBefore: state.crossfade,
  };
}

function shuffle(names: string[]) {
  const list = [...names];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const at = Math.floor(Math.random() * (i + 1));
    [list[i], list[at]] = [list[at], list[i]];
  }
  return list;
}

/** Best of the night first, so the strongest meet the weakest, the way a seeded bracket does. */
function bySeason(players: string[], state: RoomState) {
  const board = standingsBoard(state);
  const points = new Map(board.map((row) => [row.name, row.points]));
  return [...players].sort((a, b) => (points.get(b) ?? 0) - (points.get(a) ?? 0));
}

/** Battle: first against last, second against second-last, and a bye for whoever is left over. */
export function makePairs(format: TourFormat, order: string[]): TourPair[] {
  if (format !== "battle") return [];
  const list = [...order];
  const pairs: TourPair[] = [];
  while (list.length > 1) {
    pairs.push({ a: list.shift() as string, b: list.pop() as string });
  }
  if (list.length === 1) pairs.push({ a: list[0], b: null });
  return pairs;
}

/** Whose turn it is to choose a slot, if the room is still choosing. */
export function draftTurn(game: Tournament) {
  return game.draft ? game.draft.order[game.draft.turn] ?? null : null;
}

/** Records this singer's round, and when the last player has sung, sends the lowest score home. */
function playRound(game: Tournament, singer: string, average: number): Tournament {
  if (game.champion || game.draft || !game.players.includes(singer) || game.done.includes(singer)) return game;
  const done = [...game.done, singer];
  const scores = { ...game.scores, [singer]: average };
  // Nobody is out until everyone who owes a song this round has sung one.
  const owed = game.format === "battle" ? game.pairs.flatMap((pair) => (pair.b ? [pair.a, pair.b] : [])) : game.players;
  if (owed.some((name) => !done.includes(name))) return { ...game, done, scores };
  const losers = game.format === "battle" ? battleLosers(game.pairs, scores) : [lowest(game.players, scores)];
  return nextRound(game, scores, losers);
}

/** Each pair sends one home; a bye has nobody to lose to. */
function battleLosers(pairs: TourPair[], scores: Record<string, number>) {
  return pairs.flatMap((pair) => {
    if (!pair.b) return [];
    return [(scores[pair.a] ?? 0) >= (scores[pair.b] ?? 0) ? pair.b : pair.a];
  });
}

function lowest(players: string[], scores: Record<string, number>) {
  return [...players].sort((a, b) => (scores[a] ?? 0) - (scores[b] ?? 0))[0];
}

/** Sends the round's losers home and sets the next one up, or crowns whoever is left. */
function nextRound(game: Tournament, scores: Record<string, number>, losers: string[]): Tournament {
  const players = game.players.filter((name) => !losers.includes(name));
  const out = [...game.out, ...losers];
  if (players.length <= 1) {
    const champion = players[0] ?? losers[losers.length - 1] ?? "";
    return { ...game, players, out, done: [], scores: {}, pairs: [], champion, flash: { kind: "champion", name: champion, left: 1 } };
  }
  // The strongest of the night meet the weakest again, unless the room asked for chance.
  const order = game.seeding === "random" ? players : [...players].sort((a, b) => (scores[b] ?? 0) - (scores[a] ?? 0));
  return {
    ...game,
    round: game.round + 1,
    players: order,
    out,
    pairs: makePairs(game.format, order),
    done: [],
    scores: {},
    theme: "",
    flash: { kind: "out", name: losers.join(", "), left: players.length },
  };
}

/** Who the room is still waiting on this round. In a battle, a bye owes nothing. */
export function waitingOn(game: Tournament) {
  const owed = game.format === "battle" ? game.pairs.flatMap((pair) => (pair.b ? [pair.a, pair.b] : [])) : game.players;
  return owed.filter((name) => !game.done.includes(name));
}

/** The running average of the song playing now, or null while nobody has rated it. */
export function scoreAverage(state: RoomState) {
  const values = Object.values(state.scores);
  if (values.length === 0) return null;
  const total = values.reduce((sum, value) => sum + value, 0);
  return { average: Math.round((total / values.length) * 10) / 10, count: values.length };
}

/** How many songs this member already has waiting; the limit counts the queue, not the song playing. */
export function queuedBy(state: RoomState, memberId: string | null | undefined) {
  return memberId ? state.queue.filter((item) => item.addedById === memberId).length : 0;
}

function parseCrossfade(value: unknown) {
  return CROSSFADE_OPTIONS.find((option) => option === value) ?? DEFAULT_CROSSFADE;
}

function parseKeyControl(value: unknown): KeyControl {
  return KEY_CONTROL_OPTIONS.find((option) => option === value) ?? "everyone";
}

export function isBanned(state: RoomState, memberId: string | null | undefined) {
  return Boolean(memberId) && state.banned.includes(memberId as string);
}

export function isManager(state: RoomState, memberId: string | null | undefined) {
  return Boolean(memberId) && state.cohosts.includes(memberId as string);
}

/** Whether a guest with this display name may change the key right now. */
export function mayChangeKey(state: RoomState, from: string | undefined) {
  if (state.keyControl === "everyone") return true;
  if (state.keyControl === "owner") return Boolean(from) && from === state.nowPlaying?.addedBy;
  return false;
}

/** A Jamulus address is a host name or IP with an optional port; anything else is not one. */
const VOICE_ROOM_PATTERN = /^[a-z0-9.-]{1,60}(:\d{1,5})?$/i;
export const MAX_VOICE_ROOM = 66;

export function parseVoiceRoom(value: unknown) {
  if (typeof value !== "string") return "";
  const address = value.trim().replace(/^jamulus:\/\//i, "").replace(/\/+$/, "").slice(0, MAX_VOICE_ROOM);
  return VOICE_ROOM_PATTERN.test(address) ? address : "";
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
  const singer = text(value.singer, 32);
  const addedById = text(value.addedById, 64);
  return {
    id,
    videoId: value.videoId,
    title: text(value.title, 200) || "วิดีโอ YouTube",
    channel: text(value.channel, 100),
    addedBy: text(value.addedBy, 32) || "ผู้ฟัง",
    ...(addedById ? { addedById } : {}),
    ...(singer ? { singer } : {}),
    ...(Array.isArray(value.votes) ? { votes: memberIds(value.votes) } : {}),
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
    vocalCut: VOCAL_CUT_OPTIONS.find((option) => option === value.vocalCut) ?? 0,
    eq: parseEq(value.eq),
    notesOn: value.notesOn !== false,
    notesShared: value.notesShared === true,
    crossfade: parseCrossfade(value.crossfade),
    keyHelper: value.keyHelper === true,
    chat: value.chat !== false,
    keyControl: parseKeyControl(value.keyControl),
    voiceRoom: parseVoiceRoom(value.voiceRoom),
    cohosts: Array.isArray(value.cohosts) ? memberIds(value.cohosts).slice(0, MAX_COHOSTS) : [],
    banned: Array.isArray(value.banned) ? memberIds(value.banned).slice(0, MAX_BANNED) : [],
    queueLimit: QUEUE_LIMITS.find((option) => option === value.queueLimit) ?? 0,
    queueOrder: QUEUE_ORDERS.find((option) => option === value.queueOrder) ?? "line",
    game: PARTY_GAMES.find((option) => option === value.game) ?? "off",
    bombSeconds: BOMB_SECOND_OPTIONS.find((option) => option === value.bombSeconds) ?? BOMB_SECONDS,
    scoring: value.scoring === true,
    spotlight: sanitizeSpotlight(value.spotlight),
    scores: sanitizeScores(value.scores),
    lastScore: sanitizeScoreResult(value.lastScore),
    standings: Array.isArray(value.standings) ? sanitizeStandings(value.standings) : [],
    tournament: sanitizeTournament(value.tournament),
    hostOffset: clampOffset(value.hostOffset),
  };
}

function memberIds(value: unknown[]) {
  return value.slice(0, MAX_QUEUE).flatMap((id) => (typeof id === "string" && id.length > 0 && id.length <= 64 ? [id] : []));
}

function sanitizeSpotlight(value: unknown): Spotlight | null {
  if (!isRecord(value)) return null;
  const memberId = text(value.memberId, 64);
  const name = text(value.name, 32);
  const seconds = typeof value.seconds === "number" && Number.isFinite(value.seconds) ? Math.max(0, Math.round(value.seconds)) : 0;
  return memberId && name ? { memberId, name, seconds: Math.min(seconds, 600) } : null;
}

function sanitizeScores(value: unknown): Record<string, number> {
  if (!isRecord(value)) return {};
  const scores: Record<string, number> = {};
  for (const [memberId, score] of Object.entries(value).slice(0, MAX_QUEUE)) {
    if (memberId.length > 64 || typeof score !== "number" || !Number.isFinite(score)) continue;
    scores[memberId] = Math.max(1, Math.min(SCORE_MAX, Math.round(score)));
  }
  return scores;
}

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.slice(0, MAX_PLAYERS).flatMap((name) => text(name, 32) || []) : [];
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(999, Math.round(value))) : 0;
}

function sanitizePairs(value: unknown[], players: string[]): TourPair[] {
  return value.slice(0, MAX_PLAYERS).flatMap((raw) => {
    if (!isRecord(raw)) return [];
    const a = text(raw.a, 32);
    const b = text(raw.b, 32);
    if (!a || !players.includes(a)) return [];
    return [{ a, b: b && players.includes(b) ? b : null }];
  });
}

function sanitizeTournament(value: unknown): Tournament | null {
  if (!isRecord(value)) return null;
  const players = names(value.players);
  const out = names(value.out);
  const champion = text(value.champion, 32);
  if (players.length === 0 && !champion) return null;
  const scores: Record<string, number> = {};
  if (isRecord(value.scores)) {
    for (const [name, score] of Object.entries(value.scores).slice(0, MAX_PLAYERS)) {
      if (name.length <= 32 && typeof score === "number" && Number.isFinite(score)) {
        scores[name] = Math.max(0, Math.min(SCORE_MAX, Math.round(score * 10) / 10));
      }
    }
  }
  const round = typeof value.round === "number" && Number.isFinite(value.round) ? Math.max(1, Math.round(value.round)) : 1;
  const flash = isRecord(value.flash) ? value.flash : null;
  const kind = flash && (flash.kind === "start" || flash.kind === "out" || flash.kind === "champion") ? flash.kind : null;
  const draft = isRecord(value.draft) ? value.draft : null;
  const slots = Array.isArray(draft?.slots)
    ? draft.slots.slice(0, MAX_PLAYERS).map((name) => text(name, 32) || null)
    : [];
  const order = draft ? names(draft.order) : [];
  return {
    format: TOUR_FORMATS.find((option) => option === value.format) ?? "solo",
    seeding: TOUR_SEEDINGS.find((option) => option === value.seeding) ?? "random",
    theme: text(value.theme, MAX_THEME),
    round: Math.min(round, 99),
    players,
    pairs: Array.isArray(value.pairs) ? sanitizePairs(value.pairs, players) : [],
    draft: draft && order.length > 0 && slots.length === order.length
      ? { order, turn: Math.max(0, Math.min(order.length, count(draft.turn))), slots }
      : null,
    out,
    done: names(value.done).filter((name) => players.includes(name)),
    scores,
    champion: champion || null,
    flash: kind && flash ? { kind, name: text(flash.name, 32), left: count(flash.left) } : null,
    crossfadeBefore: parseCrossfade(value.crossfadeBefore),
  };
}

function sanitizeStandings(value: unknown[]): Standing[] {
  return value.slice(0, MAX_STANDINGS).flatMap((row) => {
    if (!isRecord(row)) return [];
    const name = text(row.name, 32);
    const songs = typeof row.songs === "number" && Number.isFinite(row.songs) ? Math.max(0, Math.round(row.songs)) : 0;
    const total = typeof row.total === "number" && Number.isFinite(row.total) ? Math.max(0, row.total) : 0;
    const misses = typeof row.misses === "number" && Number.isFinite(row.misses) ? Math.max(0, Math.round(row.misses)) : 0;
    if (!name || (songs === 0 && misses === 0)) return [];
    return [{
      name,
      songs: Math.min(songs, 999),
      total: Math.min(Math.round(total * 10) / 10, songs * SCORE_MAX),
      misses: Math.min(misses, 999),
    }];
  });
}

function sanitizeScoreResult(value: unknown): ScoreResult | null {
  if (!isRecord(value)) return null;
  const average = typeof value.average === "number" && Number.isFinite(value.average) ? value.average : null;
  const count = typeof value.count === "number" && Number.isFinite(value.count) ? Math.round(value.count) : 0;
  if (average === null || count <= 0) return null;
  return {
    title: text(value.title, 200) || "เพลงที่ผ่านมา",
    singer: text(value.singer, 32) || "ผู้ร้อง",
    average: Math.max(0, Math.min(SCORE_MAX, Math.round(average * 10) / 10)),
    count: Math.min(count, MAX_QUEUE),
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
    case "remove":
    case "jump": {
      const itemId = text(value.itemId, 64);
      return itemId ? { kind: value.kind, itemId } : null;
    }
    case "mode": {
      const mode = parseRoomMode(typeof value.mode === "string" ? value.mode : undefined);
      return mode ? { kind: "mode", mode } : null;
    }
    case "crossfade":
      return typeof value.seconds === "number" ? { kind: "crossfade", seconds: value.seconds } : null;
    case "chat":
      return typeof value.enabled === "boolean" ? { kind: "chat", enabled: value.enabled } : null;
    case "notesOn":
      return typeof value.enabled === "boolean" ? { kind: "notesOn", enabled: value.enabled } : null;
    case "notesShared":
      return typeof value.shared === "boolean" ? { kind: "notesShared", shared: value.shared } : null;
    case "key": {
      const step = KEY_STEPS.find((option) => option === value.step);
      return step === undefined ? null : { kind: "key", step, from: text(value.from, 32) || undefined };
    }
    case "notes":
      return typeof value.text === "string" ? { kind: "notes", text: value.text.slice(0, MAX_NOTES) } : null;
    case "queueLimit":
      return typeof value.count === "number" ? { kind: "queueLimit", count: value.count } : null;
    case "queueOrder": {
      const order = QUEUE_ORDERS.find((option) => option === value.value);
      return order ? { kind: "queueOrder", value: order } : null;
    }
    case "game": {
      const game = PARTY_GAMES.find((option) => option === value.value);
      return game ? { kind: "game", value: game } : null;
    }
    case "scoring":
      return typeof value.enabled === "boolean" ? { kind: "scoring", enabled: value.enabled } : null;
    case "bombSeconds":
      return typeof value.seconds === "number" ? { kind: "bombSeconds", seconds: value.seconds } : null;
    case "vocalCut":
      return typeof value.amount === "number" ? { kind: "vocalCut", amount: value.amount } : null;
    case "voiceRoom":
      return typeof value.address === "string" ? { kind: "voiceRoom", address: value.address } : null;
    case "kick": {
      const memberId = text(value.memberId, 64);
      return memberId ? { kind: "kick", memberId } : null;
    }
    case "unban":
      return { kind: "unban" };
    case "eq":
      return { kind: "eq", eq: parseEq(value.eq) };
    case "vote": {
      // Who voted comes from the envelope the host trusts, never from the payload.
      const itemId = text(value.itemId, 64);
      return itemId ? { kind: "vote", itemId } : null;
    }
    case "score":
      return typeof value.value === "number" ? { kind: "score", value: value.value } : null;
    case "bomb":
      return { kind: "bomb" };
    case "standingsReset":
      return { kind: "standingsReset" };
    case "tournament": {
      // Who is playing comes from the host's own member list, never from the sender.
      const action = value.action === "start" ? "start" : value.action === "stop" ? "stop" : null;
      if (!action) return null;
      return {
        kind: "tournament",
        action,
        format: TOUR_FORMATS.find((option) => option === value.format),
        seeding: TOUR_SEEDINGS.find((option) => option === value.seeding),
      };
    }
    case "tournamentPick": {
      // The name is filled in by the host from the envelope, so a sender's own is dropped.
      const slot = typeof value.slot === "number" && Number.isFinite(value.slot) ? Math.round(value.slot) : null;
      return slot === null || slot < 0 || slot > MAX_PLAYERS ? null : { kind: "tournamentPick", slot };
    }
    case "tournamentTheme":
      return typeof value.theme === "string" ? { kind: "tournamentTheme", theme: value.theme } : null;
    default:
      return null;
  }
}

import type { RealtimeStatus, RoomMember } from "../../lib/room-realtime";
import type { RoomIntent, RoomMode, RoomState } from "../../lib/room-state";

export type AddVideoResult = { ok: boolean; message: string };

export type Toast = { id: number; text: string };

/** Everything a room screen needs; the room client owns the state and the realtime connection. */
export type RoomModel = {
  state: RoomState;
  isHost: boolean;
  /** The host, or someone the host made a co-host: may run the queue and the room's settings. */
  canManage: boolean;
  selfId: string | null;
  selfName: string;
  members: RoomMember[];
  status: RealtimeStatus;
  hostOnline: boolean;
  roomCode: string;
  inviteUrl: string;
  dispatch: (intent: RoomIntent) => void;
  addVideo: (input: string) => Promise<AddVideoResult>;
};

export const MODE_LABELS: Record<RoomMode, { name: string; short: string; description: string }> = {
  watch: {
    name: "ดูด้วยกัน",
    short: "ดูด้วยกัน",
    description: "ทุกคนมีจอของตัวเอง เล่นพร้อมกัน เข้าคิวได้ทุกคน โฮสต์แปะเนื้อเพลงหรือโน้ตให้ทั้งห้องดู",
  },
  remote: {
    name: "รีโมท",
    short: "รีโมท",
    description: "เครื่องโฮสต์เป็นทีวีกลางหรือแชร์จอ คนอื่นใช้มือถือเป็นรีโมทเพิ่มเพลงเข้าคิว",
  },
  karaoke: {
    name: "คาราโอเกะ จอกลาง",
    short: "เกะจอกลาง",
    description: "ร้องอยู่ห้องเดียวกัน จอโฮสต์คือจอเนื้อเพลง ทุกคนใช้มือถือขอเพลงและปรับคีย์",
  },
  singalong: {
    name: "คาราโอเกะด้วยกัน",
    short: "เกะด้วยกัน",
    description: "ร้องกันคนละที่ ทุกคนมีจอของตัวเอง เนื้อเพลงขึ้นทุกเครื่อง ปรับคีย์ได้ถ้าเครื่องนั้นติดตั้งส่วนเสริม",
  },
};

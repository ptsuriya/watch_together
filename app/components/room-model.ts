import type { RealtimeStatus, RoomMember } from "../../lib/room-realtime";
import type { RoomIntent, RoomMode, RoomState } from "../../lib/room-state";

export type AddVideoResult = { ok: boolean; message: string };

export type Toast = { id: number; text: string };

/** Everything a room screen needs; the room client owns the state and the realtime connection. */
export type RoomModel = {
  state: RoomState;
  isHost: boolean;
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
    name: "คาราโอเกะ",
    short: "คาราโอเกะ",
    description: "เหมือนรีโมท เพิ่มปุ่มลด-เพิ่มคีย์จากมือถือ ทำงานคู่กับส่วนขยาย Transpose",
  },
};

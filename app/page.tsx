import RoomClient from "./room-client";
import { parseRoomMode } from "../lib/room-state";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; host?: string; mode?: string }>;
}) {
  const { room, host, mode } = await searchParams;
  return (
    <RoomClient
      sharedRoom={room}
      requestedHost={host === "1"}
      initialMode={parseRoomMode(mode)}
      supabaseUrl={process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}
      supabaseKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
    />
  );
}

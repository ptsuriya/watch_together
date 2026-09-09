import RoomClient from "./room-client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; host?: string }>;
}) {
  const { room, host } = await searchParams;
  return (
    <RoomClient
      sharedRoom={room}
      requestedHost={host === "1"}
      supabaseUrl={process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL}
      supabaseKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
    />
  );
}

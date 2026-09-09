import RoomClient from "./room-client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ room?: string; host?: string }>;
}) {
  const { room, host } = await searchParams;
  return <RoomClient sharedRoom={room} requestedHost={host === "1"} />;
}

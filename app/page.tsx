import RoomClient from "./room-client";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ room?: string }>;
}) {
  const { room } = await searchParams;
  return <RoomClient sharedRoom={room} />;
}

import { isVideoId } from "../../../lib/room-state";

const DAY = 60 * 60 * 24;
/** One paste should not be able to bury a room's queue. */
const MAX_ITEMS = 50;
const PLAYLIST_ID = /^[\w-]{2,64}$/;

type Item = { videoId: string; title: string; channel: string };

/**
 * Reads a public YouTube playlist through the official Data API, which is the only sanctioned way to list one.
 * Without a key the room says so plainly rather than scraping the page behind YouTube's back.
 */
export async function GET(request: Request) {
  const list = new URL(request.url).searchParams.get("list");
  if (!list || !PLAYLIST_ID.test(list)) return Response.json({ error: "invalid list" }, { status: 400 });
  // A mix or radio list is generated per viewer and has no stable contents to read.
  if (/^(RD|UL|TL)/.test(list)) return Response.json({ error: "mix" }, { status: 422 });

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return Response.json({ error: "no-key" }, { status: 501 });

  const endpoint = new URL("https://www.googleapis.com/youtube/v3/playlistItems");
  endpoint.searchParams.set("part", "snippet,status");
  endpoint.searchParams.set("maxResults", "50");
  endpoint.searchParams.set("playlistId", list);
  endpoint.searchParams.set("key", key);

  try {
    const response = await fetch(endpoint, { next: { revalidate: 600 }, signal: AbortSignal.timeout(6000) });
    if (response.status === 404) return Response.json({ error: "missing" }, { status: 404 });
    if (!response.ok) return Response.json({ error: "lookup" }, { status: 502 });

    const data = (await response.json()) as { items?: unknown };
    const items = Array.isArray(data.items) ? data.items : [];
    const songs: Item[] = [];
    for (const raw of items) {
      if (songs.length >= MAX_ITEMS) break;
      if (typeof raw !== "object" || raw === null) continue;
      const entry = raw as { snippet?: Record<string, unknown>; status?: Record<string, unknown> };
      const snippet = entry.snippet ?? {};
      const resource = snippet.resourceId as { videoId?: unknown } | undefined;
      const videoId = resource?.videoId;
      // Deleted and private entries keep their slot in a playlist; they cannot play, so they do not join the queue.
      const privacy = entry.status?.privacyStatus;
      if (!isVideoId(videoId) || privacy === "private" || privacy === "privacyStatusUnspecified") continue;
      const title = typeof snippet.title === "string" ? snippet.title : "";
      if (title === "Deleted video" || title === "Private video") continue;
      songs.push({
        videoId,
        title: title.slice(0, 200) || "วิดีโอ YouTube",
        channel: typeof snippet.videoOwnerChannelTitle === "string" ? snippet.videoOwnerChannelTitle.slice(0, 100) : "",
      });
    }

    return Response.json({ items: songs }, { headers: { "Cache-Control": `public, max-age=600, s-maxage=${DAY}` } });
  } catch {
    return Response.json({ error: "lookup" }, { status: 502 });
  }
}

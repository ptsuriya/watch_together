import { isVideoId } from "../../../lib/room-state";

const DAY = 60 * 60 * 24;

/**
 * Looks a video up through YouTube oEmbed, which needs no API key. oEmbed answers 401/403 for videos that cannot be
 * embedded (embedding disabled, private) and 400/404 for ids that do not exist.
 */
export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id");
  if (!isVideoId(id)) return Response.json({ error: "invalid id" }, { status: 400 });

  const watchUrl = `https://www.youtube.com/watch?v=${id}`;
  try {
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`, {
      next: { revalidate: DAY },
      signal: AbortSignal.timeout(4000),
    });
    if (response.status === 401 || response.status === 403) return cached({ playable: false, reason: "embed" });
    if (response.status === 400 || response.status === 404) return cached({ playable: false, reason: "missing" });
    if (!response.ok) return Response.json({ playable: true });

    const data: unknown = await response.json();
    const record = typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
    return cached({
      playable: true,
      title: typeof record.title === "string" ? record.title.slice(0, 200) : undefined,
      channel: typeof record.author_name === "string" ? record.author_name.slice(0, 100) : undefined,
    });
  } catch {
    // Unknown is not the same as unplayable: let the room try, the player reports real failures.
    return Response.json({ playable: true });
  }
}

function cached(body: object) {
  return Response.json(body, { headers: { "Cache-Control": `public, max-age=3600, s-maxage=${DAY}` } });
}

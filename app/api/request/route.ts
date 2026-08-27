import { and, asc, eq } from "drizzle-orm";
import { extractYouTubeId, getDb, mediaItems, playoutQueueItems } from "@/lib/control";
import { getYouTubeVideoMetadata, YouTubeImportError } from "@/lib/youtube-playlist";

const CHANNEL_ID = "byrequest";
const MAX_QUEUE_LENGTH = 100;

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { youtube?: unknown };
    const youtubeId = extractYouTubeId(String(payload.youtube ?? ""));
    if (!youtubeId) return Response.json({ error: "Pega un enlace válido de YouTube." }, { status: 400 });

    const db = getDb();
    const queue = await db.select({ id: playoutQueueItems.id }).from(playoutQueueItems)
      .where(eq(playoutQueueItems.channelId, CHANNEL_ID))
      .orderBy(asc(playoutQueueItems.position));
    if (queue.length >= MAX_QUEUE_LENGTH) {
      return Response.json({ error: "La fila está llena por ahora. Intenta de nuevo en unos minutos." }, { status: 429 });
    }

    let [media] = await db.select().from(mediaItems).where(eq(mediaItems.youtubeId, youtubeId)).limit(1);
    if (!media) {
      const metadata = await getYouTubeVideoMetadata(youtubeId);
      [media] = await db.insert(mediaItems).values({
        type: "music",
        title: metadata.title,
        subtitle: metadata.artist,
        youtubeId: metadata.youtubeId,
        sourceType: "youtube",
        duration: metadata.duration,
      }).returning();
    }

    const [duplicate] = await db.select({ id: playoutQueueItems.id }).from(playoutQueueItems).where(and(
      eq(playoutQueueItems.channelId, CHANNEL_ID),
      eq(playoutQueueItems.mediaItemId, media.id),
    )).limit(1);
    if (duplicate) return Response.json({ error: "Ese videoclip ya está formado en #BYREQUEST." }, { status: 409 });

    await db.insert(playoutQueueItems).values({
      channelId: CHANNEL_ID,
      mediaItemId: media.id,
      position: Date.now(),
    });

    return Response.json({
      ok: true,
      title: media.title,
      position: queue.length + 1,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof YouTubeImportError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "La solicitud no tiene un formato válido." }, { status: 400 });
    }
    return Response.json({ error: "No pudimos agregar ese video a la fila. Intenta de nuevo." }, { status: 500 });
  }
}

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { mediaItems } from "@/db/schema";
import { getMediaBucket } from "@/lib/media-storage";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const id = Number((await context.params).id);
  if (!id) return new Response("Video inválido", { status: 400 });
  const [media] = await getDb().select().from(mediaItems).where(eq(mediaItems.id, id)).limit(1);
  if (!media?.storageKey) return new Response("Video no encontrado", { status: 404 });

  const bucket = getMediaBucket();
  const head = await bucket.head(media.storageKey);
  if (!head) return new Response("Video no encontrado", { status: 404 });
  const headers = new Headers({ "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=86400", "Content-Type": media.mimeType ?? "video/mp4" });
  head.writeHttpMetadata(headers);
  const range = request.headers.get("Range");

  if (range) {
    const match = /^bytes=(\d+)-(\d*)$/.exec(range);
    if (!match) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${head.size}` } });
    const start = Number(match[1]);
    const end = match[2] ? Math.min(Number(match[2]), head.size - 1) : head.size - 1;
    if (start > end || start >= head.size) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${head.size}` } });
    const length = end - start + 1;
    const object = await bucket.get(media.storageKey, { range: { offset: start, length } });
    if (!object) return new Response("Video no encontrado", { status: 404 });
    headers.set("Content-Length", String(length));
    headers.set("Content-Range", `bytes ${start}-${end}/${head.size}`);
    headers.set("ETag", object.httpEtag);
    return new Response(object.body, { status: 206, headers });
  }

  const object = await bucket.get(media.storageKey);
  if (!object) return new Response("Video no encontrado", { status: 404 });
  headers.set("Content-Length", String(object.size));
  headers.set("ETag", object.httpEtag);
  return new Response(object.body, { headers });
}

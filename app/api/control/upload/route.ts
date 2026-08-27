import { max } from "drizzle-orm";
import { ControlError, getDb, isChannelId, mediaItems, playlistItems, requireOperator, eq } from "@/lib/control";
import { getMediaBucket } from "@/lib/media-storage";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  let uploadedKey = "";
  let createdItemId: number | null = null;
  let bucket: ReturnType<typeof getMediaBucket> | null = null;
  try {
    await requireOperator();
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > MAX_UPLOAD_BYTES + 2 * 1024 * 1024) throw new ControlError("El archivo supera el límite de 50 MB.", 413);
    const form = await request.formData();
    const file = form.get("file");
    const type = String(form.get("type") ?? "ident");
    const title = String(form.get("title") ?? "").trim();
    const subtitle = String(form.get("subtitle") ?? "").trim();
    const duration = Math.max(1, Math.min(14400, Number(form.get("duration")) || 30));
    const channelId = form.get("channelId");
    if (!file || typeof file === "string") throw new ControlError("Selecciona un archivo de video.");
    const videoExtension = /\.(mp4|m4v|mov|webm|ogv|ogg)$/i.test(file.name);
    if (!file.type.startsWith("video/") && !videoExtension) throw new ControlError("Selecciona un archivo de video.");
    if (!title || !["music", "ident", "commercial", "program"].includes(type)) throw new ControlError("Revisa el título y el tipo de pieza.");
    if (!isChannelId(channelId)) throw new ControlError("Selecciona un canal.");
    if (file.size > MAX_UPLOAD_BYTES) throw new ControlError("El archivo supera el límite de 50 MB.", 413);

    uploadedKey = `media/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-") || "video"}`;
    bucket = getMediaBucket();
    await bucket.put(uploadedKey, file.stream(), { httpMetadata: { contentType: file.type || "video/mp4" }, customMetadata: { title, channelId } });
    const db = getDb();
    const [item] = await db.insert(mediaItems).values({ type: type as "music" | "ident" | "commercial" | "program", title, subtitle, youtubeId: "", sourceType: "upload", storageKey: uploadedKey, mimeType: file.type || "video/mp4", fileSize: file.size, duration }).returning();
    if (!item) throw new Error("El video se subió, pero no fue posible guardarlo en la biblioteca.");
    createdItemId = item.id;
    const [positionRow] = await db.select({ value: max(playlistItems.position) }).from(playlistItems).where(eq(playlistItems.channelId, channelId));
    await db.insert(playlistItems).values({ channelId, mediaItemId: item.id, position: (positionRow.value ?? -1) + 1 });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    if (createdItemId !== null) {
      try { await getDb().delete(mediaItems).where(eq(mediaItems.id, createdItemId)); }
      catch (cleanupError) { console.error("No se pudo retirar el registro incompleto de la subida.", cleanupError); }
    }
    if (uploadedKey && bucket) {
      try { await bucket.delete(uploadedKey); }
      catch (cleanupError) { console.error("No se pudo retirar el archivo incompleto de la subida.", cleanupError); }
    }
    console.error("Falló la subida de video.", error);
    const status = error instanceof ControlError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar el video." }, { status });
  }
}

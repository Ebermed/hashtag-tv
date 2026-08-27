import { max } from "drizzle-orm";
import { ControlError, getDb, isChannelId, mediaItems, playlistItems, requireOperator, eq } from "@/lib/control";
import { getMediaBucket } from "@/lib/media-storage";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    await requireOperator();
    const form = await request.formData();
    const file = form.get("file");
    const type = String(form.get("type") ?? "ident");
    const title = String(form.get("title") ?? "").trim();
    const subtitle = String(form.get("subtitle") ?? "").trim();
    const duration = Math.max(1, Math.min(14400, Number(form.get("duration")) || 30));
    const channelId = form.get("channelId");
    if (!(file instanceof File) || !file.type.startsWith("video/")) throw new ControlError("Selecciona un archivo de video.");
    if (!title || !["music", "ident", "commercial", "program"].includes(type)) throw new ControlError("Revisa el título y el tipo de pieza.");
    if (!isChannelId(channelId)) throw new ControlError("Selecciona un canal.");
    if (file.size > MAX_UPLOAD_BYTES) throw new ControlError("El archivo supera el límite de 50 MB.");

    const key = `media/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
    await getMediaBucket().put(key, file.stream(), { httpMetadata: { contentType: file.type }, customMetadata: { title, channelId } });
    const db = getDb();
    const [item] = await db.insert(mediaItems).values({ type: type as "music" | "ident" | "commercial" | "program", title, subtitle, youtubeId: "", sourceType: "upload", storageKey: key, mimeType: file.type, fileSize: file.size, duration }).returning();
    const [positionRow] = await db.select({ value: max(playlistItems.position) }).from(playlistItems).where(eq(playlistItems.channelId, channelId));
    await db.insert(playlistItems).values({ channelId, mediaItemId: item.id, position: (positionRow.value ?? -1) + 1 });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    const status = error instanceof ControlError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar el video." }, { status });
  }
}

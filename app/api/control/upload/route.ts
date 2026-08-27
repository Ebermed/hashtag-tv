import { max } from "drizzle-orm";
import { ControlError, getDb, isChannelId, mediaItems, playlistItems, requireOperator, eq } from "@/lib/control";
import { getMediaBucket, type UploadedPart } from "@/lib/media-storage";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const PART_BYTES = 5 * 1024 * 1024;
const VALID_MEDIA_TYPES = ["music", "ident", "commercial", "program"] as const;
const STORAGE_KEY_PATTERN = /^media\/[0-9a-f-]{36}-[^/]+$/i;

type MediaType = (typeof VALID_MEDIA_TYPES)[number];
type ChannelId = "tv" | "rock" | "pop" | "perreo" | "kpop" | "byrequest";
type UploadMetadata = {
  type: MediaType;
  title: string;
  subtitle: string;
  duration: number;
  channelId: ChannelId;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

function errorResponse(error: unknown) {
  console.error("Falló la subida de video.", error);
  const status = error instanceof ControlError ? error.status : 500;
  return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar el video." }, { status });
}

function cleanFileName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "video.mp4";
}

function parseMetadata(value: unknown): UploadMetadata {
  if (!value || typeof value !== "object") throw new ControlError("Faltan los datos del video.");
  const input = value as Record<string, unknown>;
  const type = String(input.type ?? "");
  const title = String(input.title ?? "").trim();
  const subtitle = String(input.subtitle ?? "").trim();
  const duration = Math.max(1, Math.min(14400, Math.round(Number(input.duration) || 0)));
  const channelId = String(input.channelId ?? "");
  const fileName = cleanFileName(String(input.fileName ?? "video.mp4"));
  const fileSize = Math.round(Number(input.fileSize) || 0);
  const mimeType = String(input.mimeType ?? "video/mp4").slice(0, 100);
  const videoExtension = /\.(mp4|m4v|mov|webm|ogv|ogg)$/i.test(fileName);

  if (!title || !VALID_MEDIA_TYPES.includes(type as MediaType)) throw new ControlError("Revisa el título y el tipo de pieza.");
  if (!isChannelId(channelId)) throw new ControlError("Selecciona un canal.");
  if (!mimeType.startsWith("video/") && !videoExtension) throw new ControlError("Selecciona un archivo de video.");
  if (fileSize < 1) throw new ControlError("El archivo de video está vacío.");
  if (fileSize > MAX_UPLOAD_BYTES) throw new ControlError("El archivo supera el límite de 50 MB.", 413);

  return { type: type as MediaType, title, subtitle, duration, channelId, fileName, fileSize, mimeType };
}

function parseUploadReference(value: unknown) {
  if (!value || typeof value !== "object") throw new ControlError("La sesión de subida no es válida.");
  const input = value as Record<string, unknown>;
  const key = String(input.key ?? "");
  const uploadId = String(input.uploadId ?? "");
  if (!STORAGE_KEY_PATTERN.test(key) || !uploadId || uploadId.length > 512) throw new ControlError("La sesión de subida no es válida.");
  return { key, uploadId };
}

function parseParts(value: unknown, fileSize: number) {
  const expectedParts = Math.ceil(fileSize / PART_BYTES);
  if (!Array.isArray(value) || value.length !== expectedParts || expectedParts > 10) throw new ControlError("La subida quedó incompleta. Inténtalo otra vez.");
  return value.map((part, index) => {
    if (!part || typeof part !== "object") throw new ControlError("La subida quedó incompleta. Inténtalo otra vez.");
    const entry = part as Record<string, unknown>;
    const partNumber = Number(entry.partNumber);
    const etag = String(entry.etag ?? "");
    if (partNumber !== index + 1 || !etag || etag.length > 512) throw new ControlError("La subida quedó incompleta. Inténtalo otra vez.");
    return { partNumber, etag } satisfies UploadedPart;
  });
}

export async function POST(request: Request) {
  let uploadedKey = "";
  let createdItemId: number | null = null;
  try {
    await requireOperator();
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action ?? "");
    const metadata = parseMetadata(body.metadata);
    const bucket = getMediaBucket();

    if (action === "create") {
      uploadedKey = `media/${crypto.randomUUID()}-${metadata.fileName}`;
      const upload = await bucket.createMultipartUpload(uploadedKey, {
        httpMetadata: { contentType: metadata.mimeType },
        customMetadata: { title: metadata.title, channelId: metadata.channelId },
      });
      return Response.json({ key: upload.key, uploadId: upload.uploadId, partSize: PART_BYTES }, { status: 201 });
    }

    if (action !== "complete") throw new ControlError("La acción de subida no es válida.");
    const reference = parseUploadReference(body);
    const parts = parseParts(body.parts, metadata.fileSize);
    uploadedKey = reference.key;
    const upload = bucket.resumeMultipartUpload(reference.key, reference.uploadId);
    const storedObject = await upload.complete(parts);
    if (!storedObject || storedObject.size !== metadata.fileSize) throw new Error("El almacenamiento no confirmó el video completo.");

    const db = getDb();
    const [item] = await db.insert(mediaItems).values({
      type: metadata.type,
      title: metadata.title,
      subtitle: metadata.subtitle,
      youtubeId: "",
      sourceType: "upload",
      storageKey: uploadedKey,
      mimeType: metadata.mimeType,
      fileSize: metadata.fileSize,
      duration: metadata.duration,
    }).returning();
    if (!item) throw new Error("El video se subió, pero no fue posible guardarlo en la biblioteca.");
    createdItemId = item.id;
    const [positionRow] = await db.select({ value: max(playlistItems.position) }).from(playlistItems).where(eq(playlistItems.channelId, metadata.channelId));
    await db.insert(playlistItems).values({ channelId: metadata.channelId, mediaItemId: item.id, position: (positionRow.value ?? -1) + 1 });
    uploadedKey = "";
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    if (createdItemId !== null) {
      try { await getDb().delete(mediaItems).where(eq(mediaItems.id, createdItemId)); }
      catch (cleanupError) { console.error("No se pudo retirar el registro incompleto de la subida.", cleanupError); }
    }
    if (uploadedKey) {
      try { await getMediaBucket().delete(uploadedKey); }
      catch (cleanupError) { console.error("No se pudo retirar el archivo incompleto de la subida.", cleanupError); }
    }
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireOperator();
    const url = new URL(request.url);
    const reference = parseUploadReference({ key: url.searchParams.get("key"), uploadId: url.searchParams.get("uploadId") });
    const partNumber = Number(url.searchParams.get("partNumber"));
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10) throw new ControlError("El fragmento de video no es válido.");
    if (!request.body) throw new ControlError("El fragmento de video está vacío.");
    if (contentLength > PART_BYTES) throw new ControlError("El fragmento de video es demasiado grande.", 413);

    const upload = getMediaBucket().resumeMultipartUpload(reference.key, reference.uploadId);
    const part = await upload.uploadPart(partNumber, request.body);
    return Response.json(part);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireOperator();
    const url = new URL(request.url);
    const reference = parseUploadReference({ key: url.searchParams.get("key"), uploadId: url.searchParams.get("uploadId") });
    await getMediaBucket().resumeMultipartUpload(reference.key, reference.uploadId).abort();
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}

import { env } from "cloudflare:workers";
import { eq, max } from "drizzle-orm";
import { getDb } from "@/db";
import { mediaItems, playlistItems } from "@/db/schema";

type YouTubeEnvironment = { YOUTUBE_DATA_API_KEY?: string };
type PlaylistPage = {
  nextPageToken?: string;
  items?: Array<{ contentDetails?: { videoId?: string } }>;
};
type VideoPage = {
  items?: Array<{
    id?: string;
    snippet?: { title?: string; channelTitle?: string; liveBroadcastContent?: string };
    contentDetails?: { duration?: string };
    status?: { embeddable?: boolean; privacyStatus?: string };
  }>;
};

export class YouTubeImportError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function extractPlaylistId(value: string) {
  const clean = value.trim();
  if (/^[A-Za-z0-9_-]{10,}$/.test(clean)) return clean;
  try {
    const url = new URL(clean);
    return url.searchParams.get("list") ?? "";
  } catch {
    return "";
  }
}

function durationToSeconds(value: string) {
  const match = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value);
  if (!match) return 0;
  return Number(match[1] ?? 0) * 86400 + Number(match[2] ?? 0) * 3600 + Number(match[3] ?? 0) * 60 + Number(match[4] ?? 0);
}

function cleanChannelTitle(value: string) {
  return value
    .replace(/\s*-\s*Topic$/i, "")
    .replace(/VEVO$/i, "")
    .replace(/\s+Official$/i, "")
    .trim() || "Artista por confirmar";
}

function cleanTrackTitle(value: string) {
  let title = value.trim();
  const descriptor = /\s*[[(](?:official\s*)?(?:music\s*)?(?:video|audio|lyric(?:s)?|visuali[sz]er|4k|hd)(?:\s*official)?[^)\]]*[)\]]\s*$/i;
  while (descriptor.test(title)) title = title.replace(descriptor, "").trim();
  return title;
}

function trackMetadata(rawTitle: string, channelTitle: string) {
  const split = rawTitle.match(/^(.+?)\s+(?:-|–|—|\|)\s+(.+)$/);
  if (split) return { artist: split[1].trim(), title: cleanTrackTitle(split[2]) || rawTitle.trim() };
  return { artist: cleanChannelTitle(channelTitle), title: cleanTrackTitle(rawTitle) || rawTitle.trim() };
}

async function youtubeRequest<T>(path: string, parameters: Record<string, string>, apiKey: string) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  for (const [key, value] of Object.entries(parameters)) if (value) url.searchParams.set(key, value);
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-goog-api-key": apiKey,
    },
  });
  const data = await response.json() as T & { error?: { message?: string; errors?: Array<{ reason?: string }> } };
  if (!response.ok) {
    const reason = data.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") throw new YouTubeImportError("YouTube agotó la cuota diaria. Intenta de nuevo mañana.", 429);
    if (response.status === 404) throw new YouTubeImportError("No encontré esa playlist de YouTube.", 404);
    if (response.status === 403) throw new YouTubeImportError("YouTube no permite leer esa playlist. Confirma que sea pública o no listada.", 403);
    throw new YouTubeImportError(data.error?.message || "YouTube no pudo entregar la playlist.", 502);
  }
  return data;
}

function chunksOf<T>(items: T[], size = 10) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function importYouTubePlaylist(value: string, channelId: string) {
  const apiKey = (env as unknown as YouTubeEnvironment).YOUTUBE_DATA_API_KEY;
  if (!apiKey) throw new YouTubeImportError("Falta conectar la clave de YouTube Data API para importar playlists.", 503);
  const playlistId = extractPlaylistId(value);
  if (!playlistId) throw new YouTubeImportError("Pega un enlace válido de una playlist de YouTube.");

  const db = getDb();
  const [existingMedia, assignedRows, positionRow] = await Promise.all([
    db.select({ id: mediaItems.id, youtubeId: mediaItems.youtubeId }).from(mediaItems).where(eq(mediaItems.sourceType, "youtube")),
    db.select({ mediaItemId: playlistItems.mediaItemId }).from(playlistItems).where(eq(playlistItems.channelId, channelId)),
    db.select({ value: max(playlistItems.position) }).from(playlistItems).where(eq(playlistItems.channelId, channelId)),
  ]);
  const mediaIdByYouTube = new Map(existingMedia.filter((item) => item.youtubeId).map((item) => [item.youtubeId, item.id]));
  const assignedMediaIds = new Set(assignedRows.map((item) => item.mediaItemId));
  const seenPlaylistIds = new Set<string>();
  const seenPageTokens = new Set<string>();
  let nextPageToken = "";
  let nextPosition = (positionRow[0]?.value ?? -1) + 1;
  let total = 0;
  let imported = 0;
  let duplicates = 0;
  let unavailable = 0;
  let rotationsAdded = 0;

  do {
    const page = await youtubeRequest<PlaylistPage>("playlistItems", {
      part: "contentDetails",
      playlistId,
      maxResults: "50",
      pageToken: nextPageToken,
    }, apiKey);
    const rawIds = (page.items ?? []).map((item) => item.contentDetails?.videoId ?? "").filter(Boolean);
    total += rawIds.length;
    const pageIds = rawIds.filter((id) => {
      if (seenPlaylistIds.has(id)) return false;
      seenPlaylistIds.add(id);
      return true;
    });
    const newIds = pageIds.filter((id) => !mediaIdByYouTube.has(id));
    duplicates += pageIds.length - newIds.length;

    if (newIds.length) {
      const videos = await youtubeRequest<VideoPage>("videos", {
        part: "snippet,contentDetails,status",
        id: newIds.join(","),
      }, apiKey);
      const rows = (videos.items ?? []).flatMap((item) => {
        const youtubeId = item.id ?? "";
        const duration = durationToSeconds(item.contentDetails?.duration ?? "");
        const unavailableVideo = !youtubeId
          || !duration
          || item.status?.embeddable === false
          || item.status?.privacyStatus === "private"
          || item.snippet?.liveBroadcastContent === "live"
          || item.snippet?.liveBroadcastContent === "upcoming";
        if (unavailableVideo) return [];
        const metadata = trackMetadata(item.snippet?.title ?? "Videoclip sin título", item.snippet?.channelTitle ?? "");
        return [{ type: "music" as const, title: metadata.title, subtitle: metadata.artist, youtubeId, sourceType: "youtube" as const, duration: Math.min(duration, 14400) }];
      });
      unavailable += newIds.length - rows.length;
      if (rows.length) {
        for (const rowChunk of chunksOf(rows)) {
          const inserted = await db.insert(mediaItems).values(rowChunk).returning({ id: mediaItems.id, youtubeId: mediaItems.youtubeId });
          for (const item of inserted) mediaIdByYouTube.set(item.youtubeId, item.id);
          imported += inserted.length;
        }
      }
    }

    const rotationValues = pageIds.flatMap((youtubeId) => {
      const mediaItemId = mediaIdByYouTube.get(youtubeId);
      if (!mediaItemId || assignedMediaIds.has(mediaItemId)) return [];
      assignedMediaIds.add(mediaItemId);
      return [{ channelId, mediaItemId, position: nextPosition++ }];
    });
    if (rotationValues.length) {
      for (const rotationChunk of chunksOf(rotationValues)) {
        await db.insert(playlistItems).values(rotationChunk).onConflictDoNothing();
        rotationsAdded += rotationChunk.length;
      }
    }

    nextPageToken = page.nextPageToken ?? "";
    if (nextPageToken && seenPageTokens.has(nextPageToken)) break;
    if (nextPageToken) seenPageTokens.add(nextPageToken);
  } while (nextPageToken);

  return { total, imported, duplicates, unavailable, rotationsAdded };
}

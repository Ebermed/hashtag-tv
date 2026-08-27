import { and, asc, desc, eq } from "drizzle-orm";
import { getCabinaSession } from "@/lib/cabina-auth";
import { getDb } from "@/db";
import { channelSettings, controlLog, liveSessions, mediaItems, playlistItems, playoutQueueItems, signalOverrides } from "@/db/schema";

export const CHANNEL_IDS = ["tv", "rock", "pop", "perreo", "kpop"] as const;
export type ChannelId = (typeof CHANNEL_IDS)[number];

export function isChannelId(value: unknown): value is ChannelId {
  return typeof value === "string" && CHANNEL_IDS.includes(value as ChannelId);
}

export function extractYouTubeId(value: string) {
  const trimmed = value.trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.hostname === "youtu.be") return url.pathname.slice(1).split("/")[0] || null;
    if (url.hostname.includes("youtube.com")) {
      if (url.pathname.startsWith("/live/") || url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] || null;
      return url.searchParams.get("v");
    }
  } catch {}
  return null;
}

export async function requireOperator() {
  const session = await getCabinaSession();
  if (!session) throw new ControlError("Inicia sesión para entrar a la cabina.", 401);
  return { displayName: session.username, email: session.username };
}

export async function getControlState() {
  const db = getDb();
  const [media, rotation, queue, settings, sessions, overrides, logs] = await Promise.all([
    db.select().from(mediaItems).orderBy(desc(mediaItems.id)),
    db.select({ id: playlistItems.id, channelId: playlistItems.channelId, position: playlistItems.position, mediaItemId: mediaItems.id, title: mediaItems.title, subtitle: mediaItems.subtitle, type: mediaItems.type, youtubeId: mediaItems.youtubeId, duration: mediaItems.duration }).from(playlistItems).innerJoin(mediaItems, eq(playlistItems.mediaItemId, mediaItems.id)).orderBy(asc(playlistItems.channelId), asc(playlistItems.position)),
    db.select({ id: playoutQueueItems.id, channelId: playoutQueueItems.channelId, position: playoutQueueItems.position, mediaItemId: mediaItems.id, title: mediaItems.title, subtitle: mediaItems.subtitle, type: mediaItems.type, youtubeId: mediaItems.youtubeId, duration: mediaItems.duration }).from(playoutQueueItems).innerJoin(mediaItems, eq(playoutQueueItems.mediaItemId, mediaItems.id)).orderBy(asc(playoutQueueItems.channelId), asc(playoutQueueItems.position)),
    db.select().from(channelSettings),
    db.select().from(liveSessions),
    db.select().from(signalOverrides),
    db.select().from(controlLog).orderBy(desc(controlLog.id)).limit(12),
  ]);
  return { media, rotation, queue, settings, liveSessions: sessions, overrides, logs };
}

export async function logControl(channelId: string, action: string, detail: string, operatorEmail: string) {
  await getDb().insert(controlLog).values({ channelId, action, detail, operatorEmail });
}

export class ControlError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export { and, asc, channelSettings, desc, eq, getDb, liveSessions, mediaItems, playlistItems, playoutQueueItems, signalOverrides };

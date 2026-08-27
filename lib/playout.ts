import { asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { channelPlayout, channelSettings, liveSessions, mediaItems, playlistItems, playoutQueueItems, signalOverrides } from "@/db/schema";
import type { ChannelId } from "@/lib/control";

type Media = typeof mediaItems.$inferSelect;
type QueueEntry = { queueId: number; position: number; media: Media };
type Settings = typeof channelSettings.$inferSelect;
type Selection = { media: Media | null; queueId: number | null };

function mediaSignal(channelId: ChannelId, media: Media, startedAt: string, endsAt: string, mode: "automation" | "media" = "automation") {
  return {
    channelId,
    mode,
    segmentType: media.type,
    mediaItemId: media.id,
    sourceType: media.sourceType,
    youtubeId: media.sourceType === "youtube" ? media.youtubeId : null,
    mediaUrl: media.sourceType === "upload" ? `/api/media/${media.id}` : null,
    title: media.title,
    subtitle: media.subtitle,
    startedAt,
    endsAt,
    duration: media.duration,
  };
}

function liveSignal(channelId: ChannelId, session: typeof liveSessions.$inferSelect) {
  return {
    channelId,
    mode: "live" as const,
    segmentType: "live",
    sourceType: "youtube" as const,
    youtubeId: session.youtubeId,
    mediaUrl: null,
    title: session.title,
    subtitle: session.subtitle,
    startedAt: session.startedAt,
    endsAt: null,
    duration: 86400,
  };
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function uniqueMedia(items: Media[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function pick(items: Media[], seed: string, excludedId?: number | null) {
  const eligible = items.length > 1 && excludedId ? items.filter((item) => item.id !== excludedId) : items;
  if (!eligible.length) return null;
  return eligible[hashSeed(seed) % eligible.length];
}

function dueForCommercial(settings: Settings, lastCommercialAt: string | null, at: number) {
  if (!settings.commercialsEnabled) return false;
  const anchor = Date.parse(lastCommercialAt ?? settings.updatedAt);
  return Number.isFinite(anchor) && at - anchor >= settings.commercialIntervalMinutes * 60_000;
}

async function context(channelId: ChannelId) {
  const db = getDb();
  const [allRotation, settingsRows, playoutRows, queueRows] = await Promise.all([
    db.select({ channelId: playlistItems.channelId, position: playlistItems.position, media: mediaItems }).from(playlistItems).innerJoin(mediaItems, eq(playlistItems.mediaItemId, mediaItems.id)).orderBy(asc(playlistItems.position)),
    db.select().from(channelSettings).where(eq(channelSettings.channelId, channelId)).limit(1),
    db.select().from(channelPlayout).where(eq(channelPlayout.channelId, channelId)).limit(1),
    db.select({ queueId: playoutQueueItems.id, position: playoutQueueItems.position, media: mediaItems }).from(playoutQueueItems).innerJoin(mediaItems, eq(playoutQueueItems.mediaItemId, mediaItems.id)).where(eq(playoutQueueItems.channelId, channelId)).orderBy(asc(playoutQueueItems.position), asc(playoutQueueItems.id)),
  ]);
  const direct = allRotation.filter((item) => item.channelId === channelId);
  const musicSource = channelId === "tv" || channelId === "byrequest" ? allRotation : direct;
  const nowIso = new Date().toISOString();
  const settings: Settings = settingsRows[0] ?? { channelId, shuffleEnabled: true, commercialsEnabled: false, commercialIntervalMinutes: 30, updatedAt: nowIso };
  return {
    settings,
    playout: playoutRows[0] ?? null,
    queue: queueRows as QueueEntry[],
    music: uniqueMedia(musicSource.filter((item) => item.media.type === "music").map((item) => item.media)),
    idents: uniqueMedia(direct.filter((item) => item.media.type === "ident").map((item) => item.media)),
    commercials: uniqueMedia(direct.filter((item) => item.media.type === "commercial").map((item) => item.media)),
  };
}

function chooseMusic(items: Media[], settings: Settings, seed: string, previousId: number | null, queue: QueueEntry[]): Selection {
  const queued = queue.shift();
  if (queued) return { media: queued.media, queueId: queued.queueId };
  if (!items.length) return { media: null, queueId: null };
  if (settings.shuffleEnabled) return { media: pick(items, seed, previousId), queueId: null };
  const previousIndex = items.findIndex((item) => item.id === previousId);
  return { media: items[(previousIndex + 1 + items.length) % items.length], queueId: null };
}

function chooseFollowing(previous: Media | null, at: number, seed: string, settings: Settings, music: Media[], idents: Media[], commercials: Media[], queue: QueueEntry[], lastCommercialAt: string | null): Selection {
  const commercialDue = dueForCommercial(settings, lastCommercialAt, at);
  if (previous?.type === "music" && idents.length) return { media: pick(idents, `${seed}:ident`, previous.id), queueId: null };
  if ((previous?.type === "ident" || previous?.type === "music") && commercialDue && commercials.length) return { media: pick(commercials, `${seed}:commercial`, previous.id), queueId: null };
  return chooseMusic(music, settings, `${seed}:music`, previous?.id ?? null, queue);
}

function previewFollowing(current: Media, currentEndsAt: number, sequence: number, settings: Settings, music: Media[], idents: Media[], commercials: Media[], sourceQueue: QueueEntry[], lastCommercialAt: string | null) {
  const queue = [...sourceQueue];
  const preview: Media[] = [];
  let previous: Media | null = current;
  let at = currentEndsAt;
  let commercialAnchor = lastCommercialAt;
  for (let index = 0; index < 2; index += 1) {
    const selected: Media | null = chooseFollowing(previous, at, `preview:${sequence + index}`, settings, music, idents, commercials, queue, commercialAnchor).media;
    if (!selected) break;
    preview.push(selected);
    if (selected.type === "commercial") commercialAnchor = new Date(at).toISOString();
    at += selected.duration * 1000;
    previous = selected;
  }
  return preview.map((media) => ({ id: media.id, type: media.type, title: media.title, subtitle: media.subtitle, duration: media.duration }));
}

async function automaticSignal(channelId: ChannelId) {
  const db = getDb();
  const data = await context(channelId);
  const now = Date.now();
  let current: Media | null = null;
  if (data.playout?.currentMediaItemId && Date.parse(data.playout.endsAt) > now) {
    [current] = await db.select().from(mediaItems).where(eq(mediaItems.id, data.playout.currentMediaItemId)).limit(1);
  }

  if (!current) {
    let previous: Media | null = null;
    if (data.playout?.currentMediaItemId) [previous] = await db.select().from(mediaItems).where(eq(mediaItems.id, data.playout.currentMediaItemId)).limit(1);
    const sequence = (data.playout?.sequence ?? 0) + 1;
    const chosen = chooseFollowing(previous, now, `${channelId}:${sequence}:${data.playout?.endsAt ?? "start"}`, data.settings, data.music, data.idents, data.commercials, [...data.queue], data.playout?.lastCommercialAt ?? null);
    current = chosen.media;
    if (!current) return { signal: { channelId, mode: "automation" as const }, schedule: [] };

    const startedAt = new Date(now).toISOString();
    const endsAt = new Date(now + current.duration * 1000).toISOString();
    const lastCommercialAt = current.type === "commercial" ? startedAt : data.playout?.lastCommercialAt ?? null;
    await db.insert(channelPlayout).values({ channelId, currentMediaItemId: current.id, startedAt, endsAt, lastCommercialAt, sequence, updatedAt: startedAt }).onConflictDoUpdate({ target: channelPlayout.channelId, set: { currentMediaItemId: current.id, startedAt, endsAt, lastCommercialAt, sequence, updatedAt: startedAt } });
    if (chosen.queueId) await db.delete(playoutQueueItems).where(eq(playoutQueueItems.id, chosen.queueId));
    data.playout = { channelId, currentMediaItemId: current.id, startedAt, endsAt, lastCommercialAt, sequence, updatedAt: startedAt };
    data.queue = data.queue.filter((item) => item.queueId !== chosen.queueId);
  }

  const startedAt = data.playout?.startedAt ?? new Date(now).toISOString();
  const endsAt = data.playout?.endsAt ?? new Date(now + current.duration * 1000).toISOString();
  const schedule = previewFollowing(current, Date.parse(endsAt), data.playout?.sequence ?? 0, data.settings, data.music, data.idents, data.commercials, data.queue, data.playout?.lastCommercialAt ?? null);
  return { signal: mediaSignal(channelId, current, startedAt, endsAt), schedule };
}

export async function resolveChannelSignal(channelId: ChannelId) {
  const db = getDb();
  const [[override], [live]] = await Promise.all([
    db.select().from(signalOverrides).where(eq(signalOverrides.channelId, channelId)).limit(1),
    db.select().from(liveSessions).where(eq(liveSessions.channelId, channelId)).limit(1),
  ]);
  const now = Date.now();
  const overrideExpired = override?.endsAt ? Date.parse(override.endsAt) <= now : false;

  if (override && override.mode === "live" && live) return { signal: liveSignal(channelId, live), schedule: [] };
  if (override && override.mode === "media" && !overrideExpired && override.mediaItemId) {
    const [media] = await db.select().from(mediaItems).where(eq(mediaItems.id, override.mediaItemId)).limit(1);
    if (media) return { signal: mediaSignal(channelId, media, override.startedAt, override.endsAt ?? new Date(now + media.duration * 1000).toISOString(), "media"), schedule: [] };
  }
  if (live) return { signal: liveSignal(channelId, live), schedule: [] };
  return automaticSignal(channelId);
}

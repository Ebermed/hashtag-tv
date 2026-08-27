import { max, min } from "drizzle-orm";
import { ControlError, channelSettings, extractYouTubeId, getControlState, getDb, isChannelId, liveSessions, logControl, mediaItems, playlistItems, playoutQueueItems, requireOperator, signalOverrides, eq } from "@/lib/control";
import { getMediaBucket } from "@/lib/media-storage";
import { importYouTubePlaylist, YouTubeImportError } from "@/lib/youtube-playlist";

function errorResponse(error: unknown) {
  if (error instanceof ControlError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error(JSON.stringify({
    event: "control_request_failed",
    errorType: error instanceof Error ? error.name : typeof error,
  }));
  return Response.json(
    { error: "No fue posible completar la operación. Intenta de nuevo." },
    { status: 500 },
  );
}

export async function GET() {
  try {
    const user = await requireOperator();
    return Response.json({ ...(await getControlState()), operator: { displayName: user.displayName } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const user = await requireOperator();
    const payload = await request.json() as Record<string, unknown>;
    const action = String(payload.action ?? "");
    const db = getDb();

    if (action === "add-media") {
      const type = String(payload.type ?? "music");
      const title = String(payload.title ?? "").trim();
      const subtitle = String(payload.subtitle ?? "").trim();
      const youtubeId = extractYouTubeId(String(payload.youtube ?? ""));
      const duration = Math.max(1, Math.min(14400, Number(payload.duration) || 30));
      if (!title || !youtubeId || !["music", "ident", "commercial", "program"].includes(type)) throw new ControlError("Revisa el título, tipo y enlace de YouTube.");
      const [item] = await db.insert(mediaItems).values({ type: type as "music" | "ident" | "commercial" | "program", title, subtitle, youtubeId, sourceType: "youtube", duration }).returning();
      if (isChannelId(payload.channelId)) {
        const [positionRow] = await db.select({ value: max(playlistItems.position) }).from(playlistItems).where(eq(playlistItems.channelId, payload.channelId));
        await db.insert(playlistItems).values({ channelId: payload.channelId, mediaItemId: item.id, position: (positionRow.value ?? -1) + 1 }).onConflictDoNothing();
      }
      return Response.json({ item }, { status: 201 });
    }

    if (action === "import-playlist") {
      const channelId = payload.channelId;
      if (!isChannelId(channelId)) throw new ControlError("Selecciona el canal para esta playlist.");
      try {
        const result = await importYouTubePlaylist(String(payload.playlist ?? ""), channelId);
        await logControl(channelId, "Importó playlist de YouTube", `${result.imported} piezas nuevas, ${result.duplicates} repetidas`, user.email);
        return Response.json(result, { status: 201 });
      } catch (error) {
        if (error instanceof YouTubeImportError) throw new ControlError(error.message, error.status);
        throw error;
      }
    }

    if (action === "delete-media") {
      const id = Number(payload.id);
      const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, id)).limit(1);
      if (!item) throw new ControlError("La pieza ya no existe.", 404);
      await db.delete(mediaItems).where(eq(mediaItems.id, id));
      if (item.storageKey) await getMediaBucket().delete(item.storageKey);
      return Response.json({ ok: true });
    }

    if (action === "rotation-add" || action === "queue") {
      const channelId = payload.channelId;
      const mediaItemId = Number(payload.mediaItemId);
      if (!isChannelId(channelId) || !mediaItemId) throw new ControlError("Canal o pieza inválida.");
      const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaItemId)).limit(1);
      if (!item) throw new ControlError("La pieza ya no existe.", 404);
      const [positionRow] = await db.select({ value: max(playlistItems.position) }).from(playlistItems).where(eq(playlistItems.channelId, channelId));
      const [rotationItem] = await db.insert(playlistItems).values({ channelId, mediaItemId, position: (positionRow.value ?? -1) + 1 }).onConflictDoNothing().returning();
      return Response.json({ rotationItem: rotationItem ?? null }, { status: 201 });
    }

    if (action === "rotation-remove" || action === "remove-queue") {
      const id = Number(payload.id);
      if (!id) throw new ControlError("Elemento inválido.");
      await db.delete(playlistItems).where(eq(playlistItems.id, id));
      return Response.json({ ok: true });
    }

    if (action === "rotation-move") {
      const id = Number(payload.id);
      const direction = payload.direction === "up" ? -1 : payload.direction === "down" ? 1 : 0;
      const channelId = payload.channelId;
      if (!id || !direction || !isChannelId(channelId)) throw new ControlError("Movimiento inválido.");
      const rows = await db.select().from(playlistItems).where(eq(playlistItems.channelId, channelId)).orderBy(playlistItems.position);
      const currentIndex = rows.findIndex((item) => item.id === id);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= rows.length) return Response.json({ ok: true });
      [rows[currentIndex], rows[targetIndex]] = [rows[targetIndex], rows[currentIndex]];
      await Promise.all(rows.map((item, position) => db.update(playlistItems).set({ position }).where(eq(playlistItems.id, item.id))));
      return Response.json({ ok: true });
    }

    if (action === "enqueue-next") {
      const channelId = payload.channelId;
      const mediaItemId = Number(payload.mediaItemId);
      if (!isChannelId(channelId) || !mediaItemId) throw new ControlError("Canal o pieza inválida.");
      const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaItemId)).limit(1);
      if (!item) throw new ControlError("La pieza ya no existe.", 404);
      const [positionRow] = await db.select({ value: min(playoutQueueItems.position) }).from(playoutQueueItems).where(eq(playoutQueueItems.channelId, channelId));
      const [queued] = await db.insert(playoutQueueItems).values({ channelId, mediaItemId, position: (positionRow.value ?? 0) - 1 }).returning();
      await logControl(channelId, "Programó la siguiente pieza", item.title, user.email);
      return Response.json({ queued }, { status: 201 });
    }

    if (action === "queue-remove") {
      const id = Number(payload.id);
      if (!id) throw new ControlError("Elemento inválido.");
      await db.delete(playoutQueueItems).where(eq(playoutQueueItems.id, id));
      return Response.json({ ok: true });
    }

    if (action === "settings") {
      const channelId = payload.channelId;
      if (!isChannelId(channelId)) throw new ControlError("Canal inválido.");
      const updatedAt = new Date().toISOString();
      const values = {
        channelId,
        shuffleEnabled: payload.shuffleEnabled !== false,
        commercialsEnabled: payload.commercialsEnabled === true,
        commercialIntervalMinutes: 30,
        updatedAt,
      };
      await db.insert(channelSettings).values(values).onConflictDoUpdate({ target: channelSettings.channelId, set: values });
      return Response.json({ settings: values });
    }

    if (action === "start-live" || action === "return-live") {
      const channelId = payload.channelId;
      if (!isChannelId(channelId)) throw new ControlError("Canal inválido.");
      let [session] = await db.select().from(liveSessions).where(eq(liveSessions.channelId, channelId)).limit(1);
      if (action === "start-live") {
        const youtubeId = extractYouTubeId(String(payload.youtube ?? ""));
        const title = String(payload.title ?? "").trim();
        const subtitle = String(payload.subtitle ?? "").trim();
        if (!youtubeId || !title) throw new ControlError("Agrega el enlace de YouTube Live y el nombre del programa.");
        const startedAt = new Date().toISOString();
        const values = { channelId, youtubeId, title, subtitle, startedAt, updatedAt: startedAt };
        await db.insert(liveSessions).values(values).onConflictDoUpdate({ target: liveSessions.channelId, set: values });
        session = values;
      }
      if (!session) throw new ControlError("No hay un programa en vivo activo.");
      const signal = { channelId, mode: "live" as const, mediaItemId: null, youtubeId: session.youtubeId, title: session.title, subtitle: session.subtitle, startedAt: session.startedAt, endsAt: null, updatedBy: user.email };
      await db.insert(signalOverrides).values(signal).onConflictDoUpdate({ target: signalOverrides.channelId, set: signal });
      await logControl(channelId, action === "start-live" ? "Tomó señal desde OBS" : "Volvió al estudio", session.title, user.email);
      return Response.json({ signal });
    }

    if (action === "end-live") {
      const channelId = payload.channelId;
      if (!isChannelId(channelId)) throw new ControlError("Canal inválido.");
      await db.delete(liveSessions).where(eq(liveSessions.channelId, channelId));
      const signal = { channelId, mode: "automation" as const, mediaItemId: null, youtubeId: null, title: "Programación automática", subtitle: "", startedAt: new Date().toISOString(), endsAt: null, updatedBy: user.email };
      await db.insert(signalOverrides).values(signal).onConflictDoUpdate({ target: signalOverrides.channelId, set: signal });
      await logControl(channelId, "Cerró el programa", "Regreso a programación automática", user.email);
      return Response.json({ signal });
    }

    if (action === "signal") {
      const channelId = payload.channelId;
      const mode = String(payload.mode ?? "automation");
      if (!isChannelId(channelId) || !["automation", "media", "live"].includes(mode)) throw new ControlError("Señal inválida.");
      let values: typeof signalOverrides.$inferInsert = { channelId, mode: mode as "automation" | "media" | "live", title: "Programación automática", subtitle: "", youtubeId: null, mediaItemId: null, endsAt: null, startedAt: new Date().toISOString(), updatedBy: user.email };
      if (mode === "media") {
        const mediaItemId = Number(payload.mediaItemId);
        const [item] = await db.select().from(mediaItems).where(eq(mediaItems.id, mediaItemId)).limit(1);
        if (!item) throw new ControlError("Selecciona una pieza de la biblioteca.");
        const now = new Date();
        values = { ...values, mediaItemId: item.id, youtubeId: item.youtubeId, title: item.title, subtitle: item.subtitle, endsAt: new Date(now.getTime() + item.duration * 1000).toISOString(), startedAt: now.toISOString() };
      }
      if (mode === "live") {
        const youtubeId = extractYouTubeId(String(payload.youtube ?? ""));
        const title = String(payload.title ?? "").trim();
        const subtitle = String(payload.subtitle ?? "").trim();
        if (!youtubeId || !title) throw new ControlError("Agrega el enlace de YouTube Live y el nombre del programa.");
        values = { ...values, youtubeId, title, subtitle };
      }
      await db.insert(signalOverrides).values(values).onConflictDoUpdate({ target: signalOverrides.channelId, set: values });
      await logControl(channelId, mode === "automation" ? "Regresó a automático" : mode === "live" ? "Tomó señal en vivo" : "Lanzó una pieza", values.title ?? "Señal actualizada", user.email);
      return Response.json({ signal: values });
    }

    throw new ControlError("Acción desconocida.");
  } catch (error) { return errorResponse(error); }
}

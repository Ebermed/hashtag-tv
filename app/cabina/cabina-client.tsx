"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, Antenna, ArrowDown, ArrowLeft, ArrowUp, CirclePlay, Clapperboard, Clock3, Eye, Library, ListPlus, ListVideo, LogOut, RadioTower, RefreshCw, Send, Shuffle, Trash2, Tv, Upload, Video, Zap } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type MediaType = "music" | "ident" | "commercial" | "program";
type MediaItem = { id: number; type: MediaType; title: string; subtitle: string; youtubeId: string; sourceType: "youtube" | "upload"; duration: number };
type RotationItem = Pick<MediaItem, "type" | "title" | "subtitle" | "youtubeId" | "duration"> & { id: number; channelId: string; position: number; mediaItemId: number };
type QueueItem = RotationItem;
type Signal = { channelId: string; mode: "automation" | "media" | "live"; title: string; subtitle: string; youtubeId?: string | null; startedAt?: string; endsAt?: string | null };
type LogItem = { id: number; channelId: string; action: string; detail: string; createdAt: string };
type ChannelSetting = { channelId: string; enabled: boolean; shuffleEnabled: boolean; commercialsEnabled: boolean; commercialIntervalMinutes: number };
type LiveSession = { channelId: string; youtubeId: string; title: string; subtitle: string; startedAt: string };
type ControlState = { media: MediaItem[]; rotation: RotationItem[]; queue: QueueItem[]; settings: ChannelSetting[]; liveSessions: LiveSession[]; overrides: Signal[]; logs: LogItem[] };
type DurationStatus = "idle" | "detecting" | "detected" | "error";
type YouTubePlayer = { destroy: () => void; getDuration: () => number; mute: () => void; pauseVideo: () => void };
type YouTubeApi = { Player: new (element: HTMLElement, options: { videoId: string; playerVars: Record<string, number>; events: { onReady: (event: { target: YouTubePlayer }) => void; onError: () => void } }) => YouTubePlayer };
type YouTubeWindow = Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };

const channelList = [
  { id: "tv", label: "#TV", color: "#f4ff52" },
  { id: "rock", label: "#ROCK", color: "#ff6b35" },
  { id: "pop", label: "#POP", color: "#ff5bac" },
  { id: "perreo", label: "#PERREO", color: "#00e0a4" },
  { id: "kpop", label: "#KPOP", color: "#a985ff" },
  { id: "byrequest", label: "#BYREQUEST", color: "#53d8ff" },
];

const isCoreChannel = (channelId: string) => channelId === "tv" || channelId === "byrequest";

const typeLabel = { music: "Videoclip", ident: "ID de canal", commercial: "Comercial", program: "Programa" };

function formatDuration(value: string | number) {
  const seconds = Math.max(0, Number(value) || 0);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function extractYouTubeId(value: string) {
  const clean = value.trim();
  if (/^[\w-]{11}$/.test(clean)) return clean;
  try {
    const url = new URL(clean);
    if (url.hostname.includes("youtu.be")) return url.pathname.split("/").filter(Boolean)[0] ?? "";
    if (url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/live/") || url.pathname.startsWith("/embed/")) return url.pathname.split("/")[2] ?? "";
    return url.searchParams.get("v") ?? "";
  } catch {
    return "";
  }
}

let youtubeApiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeApi() {
  const youtubeWindow = window as YouTubeWindow;
  if (youtubeWindow.YT?.Player) return Promise.resolve(youtubeWindow.YT);
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise<YouTubeApi>((resolve, reject) => {
    const previousReady = youtubeWindow.onYouTubeIframeAPIReady;
    const timeout = window.setTimeout(() => reject(new Error("YouTube tardó demasiado en responder.")), 12000);
    youtubeWindow.onYouTubeIframeAPIReady = () => {
      previousReady?.();
      window.clearTimeout(timeout);
      if (youtubeWindow.YT?.Player) resolve(youtubeWindow.YT);
      else reject(new Error("YouTube no entregó los datos del video."));
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => {
        window.clearTimeout(timeout);
        script.remove();
        reject(new Error("No se pudo conectar con YouTube."));
      };
      document.head.appendChild(script);
    }
  }).catch((error) => {
    youtubeApiPromise = null;
    throw error;
  });

  return youtubeApiPromise;
}

async function detectYouTubeDuration(value: string) {
  const videoId = extractYouTubeId(value);
  if (!videoId) throw new Error("Ese enlace de YouTube no parece válido.");
  const api = await loadYouTubeApi();

  return new Promise<number>((resolve, reject) => {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;top:0;width:320px;height:180px;pointer-events:none";
    document.body.appendChild(host);
    let player: YouTubePlayer | null = null;
    let settled = false;
    let attempts = 0;

    const finish = (duration?: number, failure?: Error) => {
      if (settled) return;
      settled = true;
      player?.destroy();
      host.remove();
      if (duration) resolve(duration);
      else reject(failure ?? new Error("No pude leer la duración de este video."));
    };

    const readDuration = (target: YouTubePlayer) => {
      target.mute();
      target.pauseVideo();
      const check = () => {
        const duration = Math.ceil(target.getDuration());
        if (Number.isFinite(duration) && duration >= 1) { finish(duration); return; }
        attempts += 1;
        if (attempts >= 30) { finish(undefined, new Error("YouTube no informó la duración de este video.")); return; }
        window.setTimeout(check, 200);
      };
      check();
    };

    player = new api.Player(host, {
      videoId,
      playerVars: { autoplay: 0, controls: 0, playsinline: 1 },
      events: {
        onReady: (event) => readDuration(event.target),
        onError: () => finish(undefined, new Error("El video no está disponible para consultar su duración.")),
      },
    });
  });
}

function detectFileDuration(file: File) {
  return new Promise<number>((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const cleanUp = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const duration = Math.ceil(video.duration);
      cleanUp();
      if (Number.isFinite(duration) && duration >= 1) resolve(duration);
      else reject(new Error("El archivo no incluye una duración legible."));
    };
    video.onerror = () => {
      cleanUp();
      reject(new Error("El navegador no pudo leer los datos de este video."));
    };
    video.src = url;
  });
}

export function CabinaClient({ operatorName }: { operatorName: string }) {
  const [state, setState] = useState<ControlState | null>(null);
  const [channelId, setChannelId] = useState("tv");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [clock, setClock] = useState(0);
  const [live, setLive] = useState({ title: "", subtitle: "", youtube: "" });
  const [asset, setAsset] = useState({ type: "music" as MediaType, source: "youtube" as "youtube" | "upload", title: "", subtitle: "", youtube: "", duration: "" });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [durationStatus, setDurationStatus] = useState<DurationStatus>("idle");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [playlistBusy, setPlaylistBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/control", { cache: "no-store" });
    const data = await response.json();
    if (response.status === 401) {
      window.location.replace("/cabina/login");
      return;
    }
    if (!response.ok) throw new Error(data.error ?? "No se pudo abrir la cabina.");
    setState(data);
  }, []);

  useEffect(() => {
    let active = true;
    fetch("/api/control", { cache: "no-store" })
      .then(async (response) => ({ response, data: await response.json() }))
      .then(({ response, data }) => {
        if (!active) return;
        if (response.status === 401) { window.location.replace("/cabina/login"); return; }
        if (!response.ok) throw new Error(data.error ?? "No se pudo abrir la cabina.");
        setState(data);
      })
      .catch((reason) => { if (active) setError(reason.message); });
    const firstTick = window.setTimeout(() => setClock(Date.now()), 0);
    const timer = window.setInterval(() => setClock(Date.now()), 1000);
    return () => { active = false; window.clearTimeout(firstTick); window.clearInterval(timer); };
  }, []);

  async function action(payload: Record<string, unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (response.status === 401) { window.location.replace("/cabina/login"); return; }
      if (!response.ok) throw new Error(data.error ?? "La orden no pudo completarse.");
      setNotice(success);
      await load();
      return true;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error inesperado"); return false; }
    finally { setBusy(false); }
  }

  function resetAsset() {
    setAsset((current) => ({ ...current, title: "", subtitle: "", youtube: "", duration: "" }));
    setUploadFile(null);
    setDurationStatus("idle");
  }

  async function resolveDuration() {
    const manualDuration = Number(asset.duration);
    if (durationStatus === "detected" && manualDuration >= 1) return manualDuration;
    if (durationStatus === "error" && manualDuration >= 1) return manualDuration;

    setDurationStatus("detecting");
    try {
      const duration = asset.source === "upload"
        ? uploadFile ? await detectFileDuration(uploadFile) : 0
        : await detectYouTubeDuration(asset.youtube);
      if (!duration) throw new Error("Selecciona un archivo de video.");
      setAsset((current) => ({ ...current, duration: String(duration) }));
      setDurationStatus("detected");
      return duration;
    } catch (reason) {
      setDurationStatus("error");
      const message = reason instanceof Error ? reason.message : "No pude detectar la duración.";
      setError(`${message} Puedes escribirla manualmente como respaldo.`);
      return null;
    }
  }

  async function addYouTubeAsset(event: FormEvent) {
    event.preventDefault();
    setError(""); setNotice("");
    const duration = await resolveDuration();
    if (!duration) return;
    const saved = await action({ action: "add-media", channelId, ...asset, duration }, `${asset.title || "La pieza"} fue cargada y añadida a ${activeChannel.label}.`);
    if (saved) resetAsset();
  }

  async function chooseUpload(file: File | null) {
    setUploadFile(file);
    setAsset((current) => ({ ...current, duration: "" }));
    setError("");
    if (!file) { setDurationStatus("idle"); return; }
    setDurationStatus("detecting");
    try {
      const duration = await detectFileDuration(file);
      setAsset((current) => ({ ...current, duration: String(duration) }));
      setDurationStatus("detected");
    } catch (reason) {
      setDurationStatus("error");
      setError(`${reason instanceof Error ? reason.message : "No pude detectar la duración."} Puedes escribirla manualmente como respaldo.`);
    }
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!uploadFile) { setError("Selecciona un archivo de video."); return; }
    const duration = await resolveDuration();
    if (!duration) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const form = new FormData();
      form.set("file", uploadFile);
      form.set("type", asset.type);
      form.set("title", asset.title);
      form.set("subtitle", asset.subtitle);
      form.set("duration", String(duration));
      form.set("channelId", channelId);
      const response = await fetch("/api/control/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No fue posible subir el video.");
      setNotice(`${asset.title || "La pieza"} fue cargada y añadida a la rotación.`);
      resetAsset();
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error inesperado"); }
    finally { setBusy(false); }
  }

  async function importPlaylist(event: FormEvent) {
    event.preventDefault();
    setPlaylistBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/control", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import-playlist", channelId, playlist: playlistUrl }) });
      const data = await response.json() as { error?: string; imported?: number; duplicates?: number; unavailable?: number; rotationsAdded?: number };
      if (response.status === 401) { window.location.replace("/cabina/login"); return; }
      if (!response.ok) throw new Error(data.error ?? "No fue posible importar la playlist.");
      const summary = [`${data.imported ?? 0} nuevos`, `${data.duplicates ?? 0} ya estaban`, `${data.unavailable ?? 0} inaccesibles`].join(" · ");
      setNotice(`Playlist procesada en ${activeChannel.label}: ${summary}. ${data.rotationsAdded ?? 0} piezas añadidas a su rotación.`);
      setPlaylistUrl("");
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Error inesperado"); }
    finally { setPlaylistBusy(false); }
  }

  async function logout() {
    await fetch("/api/cabina/logout", { method: "POST" });
    window.location.assign("/cabina/login");
  }

  const activeChannel = channelList.find((channel) => channel.id === channelId)!;
  const currentSignal = state?.overrides.find((signal) => signal.channelId === channelId);
  const liveSession = state?.liveSessions.find((session) => session.channelId === channelId);
  const settings = state?.settings.find((item) => item.channelId === channelId) ?? { channelId, enabled: isCoreChannel(channelId), shuffleEnabled: true, commercialsEnabled: false, commercialIntervalMinutes: 30 };
  const expired = Boolean(currentSignal?.endsAt && clock && Date.parse(currentSignal.endsAt) <= clock);
  const isAutomatic = !liveSession && (!currentSignal || currentSignal.mode === "automation" || expired);
  const rotation = useMemo(() => state?.rotation.filter((item) => item.channelId === channelId) ?? [], [state, channelId]);
  const priorityQueue = useMemo(() => state?.queue.filter((item) => item.channelId === channelId) ?? [], [state, channelId]);
  const onAirTitle = liveSession && (currentSignal?.mode === "live" || expired) ? liveSession.title : isAutomatic ? "Programación automática" : currentSignal?.title ?? "Señal en control";
  const onAirSubtitle = liveSession && (currentSignal?.mode === "live" || expired) ? liveSession.subtitle : isAutomatic ? `${rotation.filter((item) => item.type === "music").length} videoclips en rotación` : currentSignal?.subtitle ?? "";

  function updateSettings(values: Partial<ChannelSetting>) {
    return action({ action: "settings", channelId, enabled: values.enabled ?? settings.enabled, shuffleEnabled: values.shuffleEnabled ?? settings.shuffleEnabled, commercialsEnabled: values.commercialsEnabled ?? settings.commercialsEnabled }, `Ajustes de ${activeChannel.label} guardados.`);
  }

  return <main className="control-room" style={{ "--control-signal": activeChannel.color } as React.CSSProperties}>
    <header className="control-header">
      <div className="control-brand"><span>#</span><div>HASHTAG <b>TV</b><small>CONTROL MAESTRO</small></div></div>
      <div className="control-status"><i /> SISTEMA AL AIRE</div>
      <div className="operator"><span>OPERADOR</span><b>{operatorName}</b></div>
      <div className="header-actions"><Button asChild variant="outline"><Link href="/"><ArrowLeft /> Ver señal</Link></Button><Button variant="outline" onClick={logout} aria-label="Cerrar sesión"><LogOut /> Salir</Button></div>
    </header>

    <section className="channel-bank" aria-label="Selector de señal">
      {channelList.map((channel) => {
        const enabled = state?.settings.find((item) => item.channelId === channel.id)?.enabled ?? isCoreChannel(channel.id);
        return <button key={channel.id} className={`${channel.id === channelId ? "active" : ""}${enabled ? "" : " is-offline"}`} onClick={() => setChannelId(channel.id)}><span>{channel.label}</span><small>{channel.id === channelId ? "EN CONTROL" : enabled ? "PUBLICADA" : "OCULTA"}</small></button>;
      })}
    </section>

    <section className="master-grid">
      <aside className="signal-monitor">
        <div className="panel-label"><span>MONITOR 01</span><b>PROGRAMA</b></div>
        <div className="monitor-screen">
          {!isAutomatic && currentSignal?.youtubeId ? <img src={`https://i.ytimg.com/vi/${currentSignal.youtubeId}/hqdefault.jpg`} alt="Vista previa de la señal" /> : <div className="monitor-pattern"><span>#</span></div>}
          <div className="monitor-bug">{activeChannel.label}</div>
          <div className="monitor-live"><i /> {liveSession ? "PROGRAMA ACTIVO" : isAutomatic ? "AUTO" : "AL AIRE"}</div>
        </div>
        <div className="monitor-meta"><span>AHORA</span><h1>{onAirTitle}</h1><p>{onAirSubtitle}</p></div>
        <div className="return-bar">
          {liveSession ? <Button disabled={busy || currentSignal?.mode === "live"} onClick={() => action({ action: "return-live", channelId }, `${activeChannel.label} volvió al estudio.`)}><RadioTower /> Volver a OBS</Button> : <Button disabled={busy || isAutomatic} onClick={() => action({ action: "signal", channelId, mode: "automation" }, `${activeChannel.label} regresó a programación automática.`)}><RefreshCw /> Volver a automático</Button>}
          <small>{liveSession ? "Recupera la señal del programa después de un videoclip." : "La rotación recupera la señal con la programación compartida."}</small>
        </div>
      </aside>

      <div className="control-panels">
        {(notice || error) && <div className={error ? "control-alert error" : "control-alert"}>{error || notice}</div>}
        <Tabs defaultValue="switcher">
          <TabsList variant="line" className="control-tabs">
            <TabsTrigger value="switcher"><Antenna /> Al aire</TabsTrigger>
            <TabsTrigger value="rotation"><ListVideo /> Rotación y cola</TabsTrigger>
            <TabsTrigger value="library"><Library /> Biblioteca</TabsTrigger>
          </TabsList>

          <TabsContent value="switcher" className="tab-panel">
            <div className="panel-heading"><div><span>CONTROL DE EMISIÓN</span><h2>Tomar la señal</h2></div><Badge variant="outline">{activeChannel.label}</Badge></div>
            <div className="obs-note"><RadioTower /><div><b>Entrada desde OBS por YouTube Live</b><p>Inicia tu emisión en OBS, pega aquí el enlace del directo y toma el canal. Los videoclips lanzados durante el programa regresarán solos al estudio al terminar.</p></div></div>
            <div className="live-form">
              <div className="input-stack"><label>Nombre del programa</label><Input value={live.title} onChange={(event) => setLive({ ...live, title: event.target.value })} placeholder="Hashtag Noticias" /></div>
              <div className="input-stack"><label>Conductor o descripción</label><Input value={live.subtitle} onChange={(event) => setLive({ ...live, subtitle: event.target.value })} placeholder="En vivo con Eber Medina" /></div>
              <div className="input-stack wide"><label>Enlace de YouTube Live conectado a OBS</label><Input value={live.youtube} onChange={(event) => setLive({ ...live, youtube: event.target.value })} placeholder="https://youtube.com/live/..." /></div>
              <Button className="take-live" disabled={busy} onClick={() => action({ action: "start-live", channelId, ...live }, `${live.title || "El programa"} tomó ${activeChannel.label}.`)}><RadioTower /> {liveSession ? "REINICIAR ENTRADA DE OBS" : "TOMAR SEÑAL DESDE OBS"}</Button>
              {liveSession && <Button className="end-live" variant="outline" disabled={busy} onClick={() => action({ action: "end-live", channelId }, `${liveSession.title} terminó y volvió la rotación.`)}><RefreshCw /> Cerrar programa y volver a automático</Button>}
            </div>
            <div className="quick-launch"><span>LANZAMIENTO RÁPIDO</span>{state?.media.slice(0, 8).map((item) => <button key={item.id} onClick={() => action({ action: "signal", channelId, mode: "media", mediaItemId: item.id }, `${item.title} está al aire en ${activeChannel.label}.`)}><CirclePlay /><div><b>{item.title}</b><small>{typeLabel[item.type]} · {formatDuration(item.duration)}{liveSession ? " · regresa a OBS al terminar" : ""}</small></div><Send /></button>)}{state?.media.length === 0 && <p className="empty-copy">Carga tu primera pieza desde Biblioteca.</p>}</div>
          </TabsContent>

          <TabsContent value="rotation" className="tab-panel">
            <div className="panel-heading"><div><span>AUTOMATIZACIÓN</span><h2>Rotación de {activeChannel.label}</h2></div><Badge>{rotation.length} piezas</Badge></div>
            {channelId === "tv" && <div className="tv-rule"><Tv /><div><b>#TV mezcla todo</b><p>Además de sus propias piezas, toma videoclips de #ROCK, #POP, #PERREO y #KPOP.</p></div></div>}
            <div className="automation-settings">
              <label><span><Eye /> Visibilidad pública<small>{isCoreChannel(channelId) ? "Esta señal principal permanece publicada." : "Al apagarla desaparece por completo de la página pública."}</small></span><Switch checked={settings.enabled} disabled={isCoreChannel(channelId)} onCheckedChange={(checked) => updateSettings({ enabled: checked })} /></label>
              <label><span><Shuffle /> Reproducción aleatoria<small>Activa por defecto; el orden manual se usa al apagarla.</small></span><Switch checked={settings.shuffleEnabled} onCheckedChange={(checked) => updateSettings({ shuffleEnabled: checked })} /></label>
              <label><span><Clock3 /> Comerciales cada 30 minutos<small>Solo entran si hay comerciales cargados en este canal.</small></span><Switch checked={settings.commercialsEnabled} onCheckedChange={(checked) => updateSettings({ commercialsEnabled: checked })} /></label>
            </div>

            <div className="queue-block"><div className="subheading"><div><span>PRIORIDAD</span><h3>Lo siguiente al aire</h3></div><Badge variant="outline">{priorityQueue.length}</Badge></div>
              <div className="priority-list">{priorityQueue.map((item, index) => <div key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.title}</b><small>{typeLabel[item.type]} · {formatDuration(item.duration)}</small></div><Button size="sm" variant="ghost" onClick={() => action({ action: "queue-remove", id: item.id }, "Pieza retirada de la cola prioritaria.")}><Trash2 /> Quitar</Button></div>)}{priorityQueue.length === 0 && <p className="empty-copy">Cuando marques una pieza como “Siguiente”, aparecerá aquí y tendrá prioridad sobre el modo aleatorio.</p>}</div>
            </div>

            <div className="rotation-block"><div className="subheading"><div><span>CATÁLOGO DEL CANAL</span><h3>Piezas en rotación</h3></div></div>
              <div className="queue-list">{rotation.map((item, index) => <div className="queue-item" key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.title}</b><small>{typeLabel[item.type]} · {item.subtitle || "Hashtag TV"}</small></div><time>{formatDuration(item.duration)}</time><div className="row-actions"><Button size="sm" variant="outline" onClick={() => action({ action: "enqueue-next", channelId, mediaItemId: item.mediaItemId }, `${item.title} quedó como siguiente.`)}><Zap /> Siguiente</Button><Button size="icon-sm" variant="ghost" disabled={index === 0} onClick={() => action({ action: "rotation-move", channelId, id: item.id, direction: "up" }, "Orden actualizado.")} aria-label="Subir"><ArrowUp /></Button><Button size="icon-sm" variant="ghost" disabled={index === rotation.length - 1} onClick={() => action({ action: "rotation-move", channelId, id: item.id, direction: "down" }, "Orden actualizado.")} aria-label="Bajar"><ArrowDown /></Button><Button size="icon-sm" variant="ghost" onClick={() => action({ action: "rotation-remove", id: item.id }, "Pieza retirada de esta rotación.")} aria-label="Quitar de rotación"><Trash2 /></Button></div></div>)}{rotation.length === 0 && <div className="empty-state"><ListVideo /><h3>Esta señal aún no tiene rotación</h3><p>Las piezas que cargues desde Biblioteca se añadirán al canal seleccionado.</p></div>}</div>
            </div>
          </TabsContent>

          <TabsContent value="library" className="tab-panel">
            <div className="panel-heading"><div><span>INGESTA</span><h2>Biblioteca de contenidos</h2></div><Badge variant="outline">{state?.media.length ?? 0} piezas</Badge></div>
            <form className="playlist-import" onSubmit={importPlaylist}>
              <div className="playlist-import-heading"><ListPlus /><div><span>IMPORTACIÓN MASIVA</span><h3>Playlist de YouTube</h3><p>Trae todos los videoclips, detecta título, artista y duración, evita repetidos y los suma a la rotación de {activeChannel.label}.</p></div></div>
              <div className="input-stack"><label htmlFor="playlist-url">Enlace de la playlist</label><Input id="playlist-url" value={playlistUrl} onChange={(event) => setPlaylistUrl(event.target.value)} placeholder="https://youtube.com/playlist?list=..." required /></div>
              <Button type="submit" disabled={busy || playlistBusy}><ListPlus /> {playlistBusy ? "Procesando playlist…" : `Importar todo a ${activeChannel.label}`}</Button>
            </form>
            <form className="asset-form" onSubmit={asset.source === "upload" ? upload : addYouTubeAsset}>
              <div className="input-stack"><label>Tipo de contenido</label><NativeSelect value={asset.type} onChange={(event) => setAsset({ ...asset, type: event.target.value as MediaType })}><NativeSelectOption value="music">Videoclip</NativeSelectOption><NativeSelectOption value="ident">ID de canal</NativeSelectOption><NativeSelectOption value="commercial">Comercial</NativeSelectOption><NativeSelectOption value="program">Programa grabado</NativeSelectOption></NativeSelect></div>
              <div className="input-stack"><label>Título de la pieza</label><Input value={asset.title} onChange={(event) => setAsset({ ...asset, title: event.target.value })} placeholder="Título" required /></div>
              <div className="input-stack"><label>Artista, marca o programa</label><Input value={asset.subtitle} onChange={(event) => setAsset({ ...asset, subtitle: event.target.value })} placeholder="Descripción" /></div>
              <div className="asset-source"><span>ORIGEN</span><div><button type="button" className={asset.source === "youtube" ? "active" : ""} onClick={() => { setAsset({ ...asset, source: "youtube", duration: "" }); setUploadFile(null); setDurationStatus("idle"); setError(""); }}>URL de YouTube</button><button type="button" className={asset.source === "upload" ? "active" : ""} onClick={() => { setAsset({ ...asset, source: "upload", duration: "" }); setDurationStatus("idle"); setError(""); }}>Subir video</button></div></div>
              <div className="input-stack asset-file"><label>{asset.source === "youtube" ? "Enlace de YouTube" : "Archivo de video · máximo 50 MB"}</label>{asset.source === "youtube" ? <Input value={asset.youtube} onChange={(event) => { setAsset({ ...asset, youtube: event.target.value, duration: "" }); setDurationStatus("idle"); }} placeholder="https://youtube.com/watch?v=..." required /> : <Input type="file" accept="video/*" onChange={(event) => chooseUpload(event.target.files?.[0] ?? null)} required />}</div>
              <div className={`asset-duration ${durationStatus}`}><label htmlFor={durationStatus === "error" ? "asset-duration" : undefined}>Duración automática</label>{durationStatus === "error" ? <div className="duration-fallback"><Input id="asset-duration" type="number" min="1" max="14400" value={asset.duration} onChange={(event) => setAsset({ ...asset, duration: event.target.value })} placeholder="Segundos" required /><small>{asset.duration ? formatDuration(asset.duration) : "Respaldo manual"}</small></div> : <div className="duration-readout"><Clock3 /><span>{durationStatus === "detecting" ? "Leyendo el video…" : durationStatus === "detected" ? `${formatDuration(asset.duration)} detectada` : asset.source === "upload" ? "Se lee al elegirlo" : "Se lee al agregarlo"}</span></div>}</div>
              <Button type="submit" disabled={busy || durationStatus === "detecting"}>{asset.source === "upload" ? <Upload /> : <Zap />} {durationStatus === "detecting" ? "Detectando duración" : asset.source === "upload" ? "Subir" : "Agregar"} {durationStatus !== "detecting" && `a ${activeChannel.label}`}</Button>
            </form>
            <div className="library-grid">{state?.media.map((item) => {
              const assigned = state.rotation.filter((rotationItem) => rotationItem.mediaItemId === item.id).map((rotationItem) => channelList.find((channel) => channel.id === rotationItem.channelId)?.label).filter(Boolean);
              const alreadyHere = state.rotation.some((rotationItem) => rotationItem.mediaItemId === item.id && rotationItem.channelId === channelId);
              return <article key={item.id}><div className={`asset-icon ${item.type}`}>{item.type === "music" ? <Video /> : item.type === "ident" ? <Tv /> : item.type === "commercial" ? <Clapperboard /> : <Activity />}</div><Badge variant="outline">{typeLabel[item.type]}</Badge><h3>{item.title}</h3><p>{item.subtitle || "Hashtag TV"}</p><small>{formatDuration(item.duration)} · {item.sourceType === "upload" ? "ARCHIVO" : "YOUTUBE"}</small><div className="assigned-channels">{assigned.length ? assigned.map((label) => <span key={label}>{label}</span>) : <span>SIN ROTACIÓN</span>}</div><div><Button size="sm" onClick={() => action({ action: "enqueue-next", channelId, mediaItemId: item.id }, `${item.title} quedó como siguiente.`)}><Zap /> Siguiente</Button><Button size="sm" variant="outline" disabled={alreadyHere} onClick={() => action({ action: "rotation-add", channelId, mediaItemId: item.id }, `${item.title} fue añadida a ${activeChannel.label}.`)}>{alreadyHere ? "En rotación" : `+ ${activeChannel.label}`}</Button><AlertDialog><AlertDialogTrigger asChild><Button size="icon-sm" variant="ghost" aria-label={`Eliminar ${item.title}`}><Trash2 /></Button></AlertDialogTrigger><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>¿Eliminar “{item.title}”?</AlertDialogTitle><AlertDialogDescription>Se quitará de todos los canales, de la cola y de la biblioteca.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction onClick={() => action({ action: "delete-media", id: item.id }, `${item.title} fue eliminado.`)}>Eliminar</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></div></article>;
            })}</div>
          </TabsContent>
        </Tabs>
      </div>
    </section>

    <section className="control-log"><div className="panel-label"><span>BITÁCORA</span><b>ÚLTIMOS MOVIMIENTOS</b></div><div>{state?.logs.map((item) => <p key={item.id}><time>{new Date(item.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</time><b>#{item.channelId.toUpperCase()}</b><span>{item.action}</span><small>{item.detail}</small></p>)}{state?.logs.length === 0 && <p className="empty-copy">La bitácora comenzará con tu primera orden al aire.</p>}</div></section>
  </main>;
}

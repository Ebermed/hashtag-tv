"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

type Video = { id: string; title: string; artist: string; duration: number; year: string };
type Channel = { id: string; label: string; description: string; accent: string; videos: Video[] };
type RemoteSignal = { channelId?: string; mode: "automation" | "media" | "live"; segmentType?: string; mediaItemId?: number; sourceType?: "youtube" | "upload"; youtubeId?: string | null; mediaUrl?: string | null; title?: string; subtitle?: string; startedAt?: string; endsAt?: string | null; duration?: number };
type RemoteScheduleItem = {
  id: number;
  type: string;
  sourceType: "youtube" | "upload";
  youtubeId: string | null;
  mediaUrl: string | null;
  title: string;
  subtitle: string;
  duration: number;
  startsAt: string;
  endsAt: string;
};

type YouTubePlayer = {
  destroy: () => void;
  getCurrentTime: () => number;
  getPlayerState: () => number;
  loadVideoById: (options: { videoId: string; startSeconds: number }) => void;
  mute: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  unMute: () => void;
};

type YouTubeWindow = Window & {
  YT?: {
    Player: new (
      element: HTMLElement,
      options: {
        videoId: string;
        playerVars: Record<string, number | string>;
        events: {
          onReady: (event: { target: YouTubePlayer }) => void;
          onStateChange: (event: { data: number; target: YouTubePlayer }) => void;
          onError: () => void;
        };
      },
    ) => YouTubePlayer;
  };
  onYouTubeIframeAPIReady?: () => void;
};

const channels: Channel[] = [
  { id: "tv", label: "#TV", description: "De toda, a todas horas", accent: "#f4ff52", videos: [
    { id: "4NRXx6U8ABQ", title: "Blinding Lights", artist: "The Weeknd", duration: 260, year: "2020" },
    { id: "kXYiU_JCYtU", title: "Numb", artist: "Linkin Park", duration: 187, year: "2003" },
    { id: "IHNzOHi8sJs", title: "DDU-DU DDU-DU", artist: "BLACKPINK", duration: 216, year: "2018" },
    { id: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody", artist: "Queen", duration: 359, year: "1975" },
  ]},
  { id: "rock", label: "#ROCK", description: "Guitarras sin horario", accent: "#ff6b35", videos: [
    { id: "kXYiU_JCYtU", title: "Numb", artist: "Linkin Park", duration: 187, year: "2003" },
    { id: "NUTGr5t3MoY", title: "Basket Case", artist: "Green Day", duration: 182, year: "1994" },
    { id: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody", artist: "Queen", duration: 359, year: "1975" },
  ]},
  { id: "pop", label: "#POP", description: "Hits de ayer y hoy", accent: "#ff5bac", videos: [
    { id: "oygrmJFKYZY", title: "Don't Start Now", artist: "Dua Lipa", duration: 183, year: "2019" },
    { id: "4NRXx6U8ABQ", title: "Blinding Lights", artist: "The Weeknd", duration: 260, year: "2020" },
    { id: "CevxZvSJLk8", title: "Roar", artist: "Katy Perry", duration: 270, year: "2013" },
  ]},
  { id: "perreo", label: "#PERREO", description: "Reggaetón de continuo", accent: "#00e0a4", videos: [
    { id: "Cr8K88UcO0s", title: "Tití Me Preguntó", artist: "Bad Bunny", duration: 244, year: "2022" },
    { id: "kJQP7kiw5Fk", title: "Despacito", artist: "Luis Fonsi ft. Daddy Yankee", duration: 282, year: "2017" },
    { id: "wnJ6LuUFpMo", title: "TQG", artist: "KAROL G, Shakira", duration: 198, year: "2023" },
  ]},
  { id: "kpop", label: "#KPOP", description: "Seúl en pantalla", accent: "#a985ff", videos: [
    { id: "IHNzOHi8sJs", title: "DDU-DU DDU-DU", artist: "BLACKPINK", duration: 216, year: "2018" },
    { id: "gdZLi9oWNZg", title: "Dynamite", artist: "BTS", duration: 224, year: "2020" },
    { id: "kOHB85vDuow", title: "FANCY", artist: "TWICE", duration: 214, year: "2019" },
  ]},
  { id: "byrequest", label: "#BYREQUEST", description: "Tú eliges qué sigue", accent: "#53d8ff", videos: [
    { id: "IHNzOHi8sJs", title: "DDU-DU DDU-DU", artist: "BLACKPINK", duration: 216, year: "2018" },
    { id: "fJ9rUzIMcZQ", title: "Bohemian Rhapsody", artist: "Queen", duration: 359, year: "1975" },
    { id: "4NRXx6U8ABQ", title: "Blinding Lights", artist: "The Weeknd", duration: 260, year: "2020" },
    { id: "kXYiU_JCYtU", title: "Numb", artist: "Linkin Park", duration: 187, year: "2003" },
  ]},
];

function getSchedule(channel: Channel, now: number) {
  const cycle = channel.videos.reduce((total, video) => total + video.duration, 0);
  let position = Math.floor(now / 1000) % cycle;
  for (let index = 0; index < channel.videos.length; index += 1) {
    const video = channel.videos[index];
    if (position < video.duration) return { current: video, next: channel.videos[(index + 1) % channel.videos.length], after: channel.videos[(index + 2) % channel.videos.length], offset: position, progress: (position / video.duration) * 100 };
    position -= video.duration;
  }
  return { current: channel.videos[0], next: channel.videos[1], after: channel.videos[2], offset: 0, progress: 0 };
}

function TuningCover({ visible, channelId }: { visible: boolean; channelId: string }) {
  return <div className={visible ? "tuning-card visible" : "tuning-card"} role="status" aria-live="polite" aria-label={visible ? `Abriendo #${channelId.toUpperCase()}` : undefined}>
    <div className="tuning-scan" aria-hidden="true" />
    <strong>#{channelId.toUpperCase()}</strong>
    <div className="tuning-loader" aria-hidden="true"><i /><i /><i /><i /></div>
  </div>;
}

function SignalPreloader({ item }: { item?: RemoteScheduleItem }) {
  if (!item || item.sourceType !== "upload" || !item.mediaUrl) return null;
  return <video key={`${item.id}:${item.startsAt}`} className="signal-preload" src={item.mediaUrl} muted playsInline preload="auto" aria-hidden="true" />;
}

function LinearYouTubePlayer({ videoId, channelId, sourceKey, offset, duration, muted, volume, title, syncToClock = true, onEnded }: { videoId: string; channelId: string; sourceKey: string; offset: number; duration: number; muted: boolean; volume: number; title: string; syncToClock?: boolean; onEnded: () => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const readyRef = useRef(false);
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);
  const syncRef = useRef(syncToClock);
  const durationRef = useRef(duration);
  const onEndedRef = useRef(onEnded);
  const videoIdRef = useRef(videoId);
  const anchorRef = useRef({ offset, startedAt: 0 });
  const settleRef = useRef<() => void>(() => undefined);
  const [tuning, setTuning] = useState(true);

  useEffect(() => {
    mutedRef.current = muted;
    volumeRef.current = volume;
    const player = playerRef.current;
    if (!player) return;
    player.setVolume(volume);
    if (muted) player.mute(); else player.unMute();
  }, [muted, volume]);

  useEffect(() => {
    syncRef.current = syncToClock;
  }, [syncToClock]);

  useEffect(() => {
    durationRef.current = duration;
    onEndedRef.current = onEnded;
  }, [duration, onEnded]);

  useEffect(() => {
    videoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    anchorRef.current.startedAt = Date.now();
    let disposed = false;
    let syncTimer: number | undefined;
    let endGuardTimer: number | undefined;
    let settleTimer: number | undefined;
    let revealTimer: number | undefined;
    const ytWindow = window as YouTubeWindow;
    const expectedTime = () => anchorRef.current.offset + (Date.now() - anchorRef.current.startedAt) / 1000;
    const beginTuning = () => {
      setTuning(true);
      if (revealTimer) return;
      revealTimer = window.setTimeout(() => {
        revealTimer = undefined;
        setTuning(false);
      }, 4500);
    };
    const waitUntilSynchronized = (attempt = 0) => {
      if (disposed) return;
      const player = playerRef.current;
      if (!player) return;
      const playing = player.getPlayerState() === 1;
      const drift = Math.abs(player.getCurrentTime() - expectedTime());
      if (playing && (!syncRef.current || drift <= 1.25)) {
        settleTimer = window.setTimeout(() => setTuning(false), 140);
        return;
      }
      if (attempt >= 45) {
        setTuning(false);
        return;
      }
      if (attempt > 0 && attempt % 10 === 0) {
        if (syncRef.current) player.seekTo(expectedTime(), true);
        player.playVideo();
      }
      settleTimer = window.setTimeout(() => waitUntilSynchronized(attempt + 1), 100);
    };
    settleRef.current = () => {
      if (settleTimer) window.clearTimeout(settleTimer);
      beginTuning();
      waitUntilSynchronized();
    };
    const resync = (force = false) => {
      const player = playerRef.current;
      if (!player) return;
      const expected = expectedTime();
      const actual = player.getCurrentTime();
      if (syncRef.current && (force || Math.abs(actual - expected) > 2.5)) {
        player.seekTo(expected, true);
      }
      if (player.getPlayerState() === 2) player.playVideo();
    };

    const createPlayer = () => {
      if (disposed || !mountRef.current || !ytWindow.YT?.Player) return;
      playerRef.current = new ytWindow.YT.Player(mountRef.current, {
        videoId: videoIdRef.current,
        playerVars: {
          autoplay: 1,
          controls: 0,
          disablekb: 1,
          fs: 0,
          iv_load_policy: 3,
          playsinline: 1,
          rel: 0,
          start: Math.floor(anchorRef.current.offset),
        },
        events: {
          onReady: ({ target }) => {
            readyRef.current = true;
            target.setVolume(volumeRef.current);
            // Muted autoplay is accepted much more consistently on iOS. The
            // requested audio state is restored as soon as playback begins.
            target.mute();
            if (syncRef.current) target.seekTo(expectedTime(), true);
            target.playVideo();
            settleRef.current();
            syncTimer = window.setInterval(() => resync(), 5000);
            endGuardTimer = window.setInterval(() => {
              if (syncRef.current && durationRef.current - expectedTime() <= 0.65) setTuning(true);
            }, 120);
          },
          onStateChange: ({ data, target }) => {
            if (data === 1) {
              target.setVolume(volumeRef.current);
              if (mutedRef.current) target.mute(); else target.unMute();
              settleRef.current();
            }
            if (data === 2) window.setTimeout(() => resync(true), 120);
            if (data === 0) {
              setTuning(true);
              onEndedRef.current();
            }
          },
          onError: () => {
            setTuning(true);
            onEndedRef.current();
          },
        },
      });
    };

    if (ytWindow.YT?.Player) {
      createPlayer();
    } else {
      const previousReady = ytWindow.onYouTubeIframeAPIReady;
      ytWindow.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        createPlayer();
      };
      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement("script");
        script.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(script);
      }
    }

    const restoreOnFocus = () => resync();
    beginTuning();
    window.addEventListener("focus", restoreOnFocus);
    document.addEventListener("visibilitychange", restoreOnFocus);
    return () => {
      disposed = true;
      if (syncTimer) window.clearInterval(syncTimer);
      if (endGuardTimer) window.clearInterval(endGuardTimer);
      if (settleTimer) window.clearTimeout(settleTimer);
      if (revealTimer) window.clearTimeout(revealTimer);
      window.removeEventListener("focus", restoreOnFocus);
      document.removeEventListener("visibilitychange", restoreOnFocus);
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // Keep one YouTube player alive for the entire viewing session.
  }, []);

  useEffect(() => {
    anchorRef.current = { offset, startedAt: Date.now() };
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    player.loadVideoById({ videoId, startSeconds: Math.floor(offset) });
    player.setVolume(volumeRef.current);
    player.mute();
    player.playVideo();
    settleRef.current();
    // The offset is captured when the signal changes. Clock ticks must not retune it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, sourceKey, videoId]);

  return <div className="youtube-shell" role="group" aria-label={title}>
    <div className="youtube-signal" ref={mountRef} />
    <TuningCover visible={tuning} channelId={channelId} />
  </div>;
}

function LinearUploadedPlayer({ mediaUrl, channelId, sourceKey, offset, muted, volume, title, onEnded }: { mediaUrl: string; channelId: string; sourceKey: string; offset: number; muted: boolean; volume: number; title: string; onEnded: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const anchorRef = useRef({ offset, startedAt: 0 });
  const onEndedRef = useRef(onEnded);
  const [tuning, setTuning] = useState(true);

  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let revealTimer: number | undefined;
    const beginTuning = () => {
      setTuning(true);
      if (revealTimer) return;
      revealTimer = window.setTimeout(() => {
        revealTimer = undefined;
        setTuning(false);
      }, 3500);
    };
    beginTuning();
    anchorRef.current = { offset, startedAt: Date.now() };
    const revealIfSynchronized = () => {
      const expected = anchorRef.current.offset + (Date.now() - anchorRef.current.startedAt) / 1000;
      if (!video.paused && Math.abs(video.currentTime - expected) <= 1.25) setTuning(false);
    };
    const sync = () => {
      const expected = anchorRef.current.offset + (Date.now() - anchorRef.current.startedAt) / 1000;
      if (Math.abs(video.currentTime - expected) > 2) {
        video.currentTime = expected;
      }
      if (video.paused) video.play().catch(() => undefined);
      revealIfSynchronized();
    };
    video.addEventListener("playing", revealIfSynchronized);
    video.addEventListener("seeked", revealIfSynchronized);
    video.addEventListener("canplay", revealIfSynchronized);
    const advanceSignal = () => onEndedRef.current();
    video.addEventListener("ended", advanceSignal);
    const revealOnError = () => setTuning(false);
    video.addEventListener("error", revealOnError, { once: true });
    video.currentTime = offset;
    video.play().catch(() => undefined);
    const timer = window.setInterval(sync, 5000);
    window.addEventListener("focus", sync);
    return () => {
      window.clearInterval(timer);
      if (revealTimer) window.clearTimeout(revealTimer);
      window.removeEventListener("focus", sync);
      video.removeEventListener("playing", revealIfSynchronized);
      video.removeEventListener("seeked", revealIfSynchronized);
      video.removeEventListener("canplay", revealIfSynchronized);
      video.removeEventListener("ended", advanceSignal);
      video.removeEventListener("error", revealOnError);
    };
    // Capture the offset once per signal. Updating it every clock tick restarts
    // short IDs before they can become visible.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaUrl, sourceKey]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = volume / 100;
    videoRef.current.muted = muted;
  }, [muted, volume]);

  return <div className="youtube-shell" role="group" aria-label={title}><video ref={videoRef} className="uploaded-signal" src={mediaUrl} muted={muted} playsInline preload="auto" /><TuningCover visible={tuning} channelId={channelId} /></div>;
}

export default function Home() {
  const [channelId, setChannelId] = useState("tv");
  const [now, setNow] = useState(0);
  const [onAir, setOnAir] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [cinema, setCinema] = useState(false);
  const [enabledChannelIds, setEnabledChannelIds] = useState<string[]>(["tv", "byrequest"]);
  const [requestUrl, setRequestUrl] = useState("");
  const [requestStatus, setRequestStatus] = useState<{ kind: "idle" | "loading" | "success" | "error"; message: string }>({ kind: "idle", message: "" });
  const [remote, setRemote] = useState<{ signal: RemoteSignal; schedule: RemoteScheduleItem[] }>({ signal: { mode: "automation" }, schedule: [] });
  const refreshSignalRef = useRef<() => void>(() => undefined);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    const updateChannels = async () => {
      try {
        const response = await fetch("/api/channels", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { channels?: string[] };
        if (active && Array.isArray(data.channels) && data.channels.length) setEnabledChannelIds(data.channels);
      } catch {}
    };
    updateChannels();
    const timer = window.setInterval(updateChannels, 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);
  const visibleChannels = useMemo(() => channels.filter((item) => enabledChannelIds.includes(item.id)), [enabledChannelIds]);
  const channel = visibleChannels.find((item) => item.id === channelId) ?? visibleChannels[0] ?? channels[0];
  useEffect(() => {
    let active = true;
    let requestPending = false;
    let refreshQueued = false;
    const updateSignal = async () => {
      if (requestPending) {
        refreshQueued = true;
        return;
      }
      requestPending = true;
      try {
        const response = await fetch(`/api/signal?channel=${channel.id}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active) setRemote(data);
      } catch {}
      finally {
        requestPending = false;
        if (refreshQueued && active) {
          refreshQueued = false;
          void updateSignal();
        }
      }
    };
    refreshSignalRef.current = () => { void updateSignal(); };
    void updateSignal();
    const timer = window.setInterval(() => { void updateSignal(); }, 3000);
    const restoreSignal = () => { if (document.visibilityState === "visible") void updateSignal(); };
    document.addEventListener("visibilitychange", restoreSignal);
    return () => {
      active = false;
      refreshSignalRef.current = () => undefined;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", restoreSignal);
    };
  }, [channel.id]);
  useEffect(() => {
    if (remote.signal.mode === "live" || !remote.signal.endsAt) return;
    const transitionAt = Date.parse(remote.signal.endsAt);
    if (!Number.isFinite(transitionAt)) return;
    const timer = window.setTimeout(() => refreshSignalRef.current(), Math.max(0, transitionAt - Date.now() + 80));
    return () => window.clearTimeout(timer);
  }, [remote.signal.endsAt, remote.signal.mode]);
  const schedule = useMemo(() => getSchedule(channel, now), [channel, now]);
  const remoteStartedAt = remote.signal.startedAt ? Date.parse(remote.signal.startedAt) : now;
  const hasRemoteSignal = remote.signal.channelId === channel.id && Boolean(remote.signal.youtubeId || remote.signal.mediaUrl);
  const remoteOffset = remote.signal.mode === "live" ? 0 : Math.max(0, Math.floor((now - remoteStartedAt) / 1000));
  const current = hasRemoteSignal ? { id: remote.signal.youtubeId || `upload-${remote.signal.mediaItemId}`, title: remote.signal.title || "Señal especial", artist: remote.signal.subtitle || (remote.signal.mode === "live" ? "EN VIVO" : "HASHTAG TV"), duration: remote.signal.duration ?? (remote.signal.endsAt ? Math.max(1, Math.floor((Date.parse(remote.signal.endsAt) - remoteStartedAt) / 1000)) : 86400), year: remote.signal.mode === "live" ? "EN VIVO" : remote.signal.segmentType === "ident" ? "ID DE CANAL" : remote.signal.segmentType === "commercial" ? "COMERCIAL" : "HASHTAG TV" } : schedule.current;
  const currentOffset = hasRemoteSignal ? remoteOffset : schedule.offset;
  const currentProgress = hasRemoteSignal ? (remote.signal.mode === "live" ? 100 : Math.min(100, (currentOffset / current.duration) * 100)) : schedule.progress;
  const sourceKey = hasRemoteSignal ? `${remote.signal.mode}:${remote.signal.startedAt}:${current.id}` : `fallback:${current.id}`;
  const tune = (nextId: string) => { setChannelId(nextId); setOnAir(true); };
  const toggleMute = () => {
    if (muted && volume === 0) setVolume(80);
    setMuted((value) => !value);
  };
  const changeVolume = ([nextVolume]: number[]) => {
    setVolume(nextVolume);
    setMuted(nextVolume === 0);
  };
  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!requestUrl.trim() || requestStatus.kind === "loading") return;
    setRequestStatus({ kind: "loading", message: "Revisando tu videoclip..." });
    try {
      const response = await fetch("/api/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ youtube: requestUrl }),
      });
      const data = await response.json() as { error?: string; title?: string; position?: number };
      if (!response.ok) throw new Error(data.error || "No pudimos agregar ese video.");
      setRequestUrl("");
      setRequestStatus({
        kind: "success",
        message: `${data.title || "Tu videoclip"} quedó en la fila${data.position ? `, lugar ${data.position}` : ""}.`,
      });
    } catch (error) {
      setRequestStatus({ kind: "error", message: error instanceof Error ? error.message : "No pudimos agregar ese video." });
    }
  };

  return (
    <main className={cinema ? "site cinema" : "site"} style={{ "--signal": channel.accent } as React.CSSProperties}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Hashtag TV, inicio"><span className="brand-mark">#</span><span>HASHTAG<br /><b>TV</b></span></a>
        <div className="on-air"><i /> SEÑAL 24/7</div>
        <p className="tagline">DE TODA, A TODAS HORAS</p>
      </header>

      <section className="broadcast" id="top">
        <div className="channel-rail" aria-label="Canales">
          <p>Canales</p>
          {visibleChannels.map((item, index) => <button className={item.id === channel.id ? "channel active" : "channel"} key={item.id} onClick={() => tune(item.id)} aria-pressed={item.id === channel.id}>
            <span>0{index + 1}</span><b>{item.label}</b><small>{item.description}</small>
          </button>)}
        </div>
        <div className="screen-column">
          <div className="player-toolbar">
            <div className="signal-controls">
              <Button variant="outline" onClick={toggleMute} disabled={!onAir}>{muted ? "Activar audio" : "Silenciar"}</Button>
              <div className="volume-control">
                <span>Volumen</span>
                <Slider className="volume-slider" value={[muted ? 0 : volume]} min={0} max={100} step={1} onValueChange={changeVolume} disabled={!onAir} aria-label="Volumen de la señal" />
                <output>{muted ? 0 : volume}%</output>
              </div>
              <Button variant="outline" onClick={() => setCinema((value) => !value)}>{cinema ? "Salir de cine" : "Modo cine"}</Button>
            </div>
          </div>
          <div className="screen-frame"><div className="screen">
            {onAir ? hasRemoteSignal && remote.signal.sourceType === "upload" && remote.signal.mediaUrl ? <LinearUploadedPlayer mediaUrl={remote.signal.mediaUrl} channelId={channel.id} sourceKey={sourceKey} offset={currentOffset} muted={muted} volume={volume} title={`${current.title} en Hashtag TV`} onEnded={() => refreshSignalRef.current()} /> : <LinearYouTubePlayer videoId={current.id} channelId={channel.id} sourceKey={sourceKey} offset={currentOffset} duration={current.duration} muted={muted} volume={volume} title={`${current.title} en Hashtag TV`} syncToClock={remote.signal.mode !== "live"} onEnded={() => refreshSignalRef.current()} /> :
              <button className="tune-in" onClick={() => setOnAir(true)}><span className="test-pattern" aria-hidden="true" /><strong>ENCENDER {channel.label}</strong><small>Entrarás a la transmisión que ya está al aire</small></button>}
            {onAir && <SignalPreloader item={remote.schedule[0]} />}
            <div className="channel-bug">{channel.label}</div>
          </div></div>
          <div className="transport">
            <div className="now-playing"><span>{remote.signal.mode === "live" ? "EN VIVO" : "AHORA EN"} {channel.label}</span><h1>{current.title}</h1><p>{current.artist} · {current.year}</p></div>
          </div>
          <div className={remote.signal.mode === "live" ? "progress live-progress" : "progress"} aria-label={`Avance de ${current.title}`}><span style={{ width: `${currentProgress}%` }} /></div>
          {channel.id === "byrequest" && <section className="request-panel" aria-labelledby="request-title">
            <div className="request-copy"><span>VIDEO A LA CARTA</span><h2 id="request-title">Tú pide. #BYREQUEST lo pone.</h2><p>Pega un enlace de YouTube. Cada pedido entra al final de la fila y se reproduce por orden de llegada.</p></div>
            <form onSubmit={submitRequest}>
              <label htmlFor="request-url">Enlace de YouTube</label>
              <div className="request-fields">
                <Input id="request-url" type="url" inputMode="url" placeholder="https://youtube.com/watch?v=..." value={requestUrl} onChange={(event) => setRequestUrl(event.target.value)} required />
                <Button type="submit" disabled={requestStatus.kind === "loading"}>{requestStatus.kind === "loading" ? "AGREGANDO..." : "PEDIR VIDEOCLIP"}</Button>
              </div>
              <output className={`request-message ${requestStatus.kind}`} aria-live="polite">{requestStatus.message}</output>
            </form>
          </section>}
        </div>
      </section>
      <footer><div className="brand footer-brand"><span className="brand-mark">#</span><span>HASHTAG<br /><b>TV</b></span></div><p>Una página de Ebermedia Entertainment.</p><span>PROTOTIPO · 2026</span></footer>
    </main>
  );
}

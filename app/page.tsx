"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type Video = { id: string; title: string; artist: string; duration: number; year: string };
type Channel = { id: string; label: string; description: string; accent: string; videos: Video[] };
type RemoteSignal = { channelId?: string; mode: "automation" | "media" | "live"; segmentType?: string; mediaItemId?: number; sourceType?: "youtube" | "upload"; youtubeId?: string | null; mediaUrl?: string | null; title?: string; subtitle?: string; startedAt?: string; endsAt?: string | null; duration?: number };
type RemoteScheduleItem = { id: number; type: string; title: string; subtitle: string; duration: number };

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

const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

function LinearYouTubePlayer({ videoId, channelId, sourceKey, offset, muted, volume, title, syncToClock = true }: { videoId: string; channelId: string; sourceKey: string; offset: number; muted: boolean; volume: number; title: string; syncToClock?: boolean }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const readyRef = useRef(false);
  const mutedRef = useRef(muted);
  const volumeRef = useRef(volume);
  const syncRef = useRef(syncToClock);
  const videoIdRef = useRef(videoId);
  const anchorRef = useRef({ offset, startedAt: 0 });
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
    videoIdRef.current = videoId;
  }, [videoId]);

  useEffect(() => {
    anchorRef.current.startedAt = Date.now();
    let disposed = false;
    let syncTimer: number | undefined;
    const ytWindow = window as YouTubeWindow;
    const expectedTime = () => anchorRef.current.offset + (Date.now() - anchorRef.current.startedAt) / 1000;
    const resync = (force = false) => {
      const player = playerRef.current;
      if (!player) return;
      const expected = expectedTime();
      const actual = player.getCurrentTime();
      if (syncRef.current && (force || Math.abs(actual - expected) > 2.5)) player.seekTo(expected, true);
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
            if (mutedRef.current) target.mute(); else target.unMute();
            if (syncRef.current) target.seekTo(expectedTime(), true);
            target.playVideo();
            syncTimer = window.setInterval(() => resync(), 5000);
          },
          onStateChange: ({ data }) => {
            if (data === 1) setTuning(false);
            if (data === 2) window.setTimeout(() => resync(true), 120);
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
    window.addEventListener("focus", restoreOnFocus);
    document.addEventListener("visibilitychange", restoreOnFocus);
    return () => {
      disposed = true;
      if (syncTimer) window.clearInterval(syncTimer);
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
    setTuning(true);
    player.loadVideoById({ videoId, startSeconds: Math.floor(offset) });
    player.setVolume(volumeRef.current);
    if (mutedRef.current) player.mute(); else player.unMute();
    player.playVideo();
    // The offset is captured when the signal changes. Clock ticks must not retune it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, sourceKey, videoId]);

  return <div className="youtube-shell" role="group" aria-label={title}>
    <div className="youtube-signal" ref={mountRef} />
    <div className={tuning ? "tuning-card visible" : "tuning-card"}><span>SINTONIZANDO</span><strong>#{channelId.toUpperCase()}</strong></div>
  </div>;
}

function LinearUploadedPlayer({ mediaUrl, sourceKey, offset, muted, volume, title }: { mediaUrl: string; sourceKey: string; offset: number; muted: boolean; volume: number; title: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const anchorRef = useRef({ offset, startedAt: 0 });

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    anchorRef.current = { offset, startedAt: Date.now() };
    const sync = () => {
      const expected = anchorRef.current.offset + (Date.now() - anchorRef.current.startedAt) / 1000;
      if (Math.abs(video.currentTime - expected) > 2) video.currentTime = expected;
      if (video.paused) video.play().catch(() => undefined);
    };
    video.currentTime = offset;
    video.play().catch(() => undefined);
    const timer = window.setInterval(sync, 5000);
    window.addEventListener("focus", sync);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", sync); };
  }, [mediaUrl, offset, sourceKey]);

  useEffect(() => {
    if (!videoRef.current) return;
    videoRef.current.volume = volume / 100;
    videoRef.current.muted = muted;
  }, [muted, volume]);

  return <div className="youtube-shell" role="group" aria-label={title}><video ref={videoRef} className="uploaded-signal" src={mediaUrl} muted={muted} playsInline preload="auto" /></div>;
}

export default function Home() {
  const [channelId, setChannelId] = useState("tv");
  const [now, setNow] = useState(0);
  const [onAir, setOnAir] = useState(false);
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(80);
  const [cinema, setCinema] = useState(false);
  const [remote, setRemote] = useState<{ signal: RemoteSignal; schedule: RemoteScheduleItem[] }>({ signal: { mode: "automation" }, schedule: [] });
  useEffect(() => {
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const channel = channels.find((item) => item.id === channelId) ?? channels[0];
  useEffect(() => {
    let active = true;
    const updateSignal = async () => {
      try {
        const response = await fetch(`/api/signal?channel=${channelId}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active) setRemote(data);
      } catch {}
    };
    updateSignal();
    const timer = window.setInterval(updateSignal, 3000);
    return () => { active = false; window.clearInterval(timer); };
  }, [channelId]);
  const schedule = useMemo(() => getSchedule(channel, now), [channel, now]);
  const remoteStartedAt = remote.signal.startedAt ? Date.parse(remote.signal.startedAt) : now;
  const hasRemoteSignal = remote.signal.channelId === channelId && Boolean(remote.signal.youtubeId || remote.signal.mediaUrl);
  const remoteOffset = remote.signal.mode === "live" ? 0 : Math.max(0, Math.floor((now - remoteStartedAt) / 1000));
  const current = hasRemoteSignal ? { id: remote.signal.youtubeId || `upload-${remote.signal.mediaItemId}`, title: remote.signal.title || "Señal especial", artist: remote.signal.subtitle || (remote.signal.mode === "live" ? "EN VIVO" : "HASHTAG TV"), duration: remote.signal.duration ?? (remote.signal.endsAt ? Math.max(1, Math.floor((Date.parse(remote.signal.endsAt) - remoteStartedAt) / 1000)) : 86400), year: remote.signal.mode === "live" ? "EN VIVO" : remote.signal.segmentType === "ident" ? "ID DE CANAL" : remote.signal.segmentType === "commercial" ? "COMERCIAL" : "HASHTAG TV" } : schedule.current;
  const currentOffset = hasRemoteSignal ? remoteOffset : schedule.offset;
  const currentProgress = hasRemoteSignal ? (remote.signal.mode === "live" ? 100 : Math.min(100, (currentOffset / current.duration) * 100)) : schedule.progress;
  const sourceKey = hasRemoteSignal ? `${remote.signal.mode}:${remote.signal.startedAt}:${current.id}` : `fallback:${current.id}`;
  const nextGuide = remote.schedule[0] ? { title: remote.schedule[0].title, artist: remote.schedule[0].subtitle, duration: remote.schedule[0].duration } : schedule.next;
  const afterGuide = remote.schedule[1] ? { title: remote.schedule[1].title, artist: remote.schedule[1].subtitle, duration: remote.schedule[1].duration } : schedule.after;
  const tune = (nextId: string) => { setChannelId(nextId); setOnAir(true); };
  const toggleMute = () => {
    if (muted && volume === 0) setVolume(80);
    setMuted((value) => !value);
  };
  const changeVolume = ([nextVolume]: number[]) => {
    setVolume(nextVolume);
    setMuted(nextVolume === 0);
  };

  return (
    <main className={cinema ? "site cinema" : "site"} style={{ "--signal": channel.accent } as React.CSSProperties}>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Hashtag TV, inicio"><span className="brand-mark">#</span><span>HASHTAG<br /><b>TV</b></span></a>
        <div className="on-air"><i /> SEÑAL 24/7</div>
        <p className="tagline">DE TODA, A TODAS HORAS</p>
        <Button className="guide-button" variant="outline" onClick={() => document.getElementById("guia")?.scrollIntoView({ behavior: "smooth" })}>Ver guía</Button>
      </header>

      <section className="broadcast" id="top">
        <div className="channel-rail" aria-label="Canales">
          <p>Canales</p>
          {channels.map((item, index) => <button className={item.id === channelId ? "channel active" : "channel"} key={item.id} onClick={() => tune(item.id)} aria-pressed={item.id === channelId}>
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
            {onAir ? hasRemoteSignal && remote.signal.sourceType === "upload" && remote.signal.mediaUrl ? <LinearUploadedPlayer mediaUrl={remote.signal.mediaUrl} sourceKey={sourceKey} offset={currentOffset} muted={muted} volume={volume} title={`${current.title} en Hashtag TV`} /> : <LinearYouTubePlayer videoId={current.id} channelId={channel.id} sourceKey={sourceKey} offset={currentOffset} muted={muted} volume={volume} title={`${current.title} en Hashtag TV`} syncToClock={remote.signal.mode !== "live"} /> :
              <button className="tune-in" onClick={() => setOnAir(true)}><span className="test-pattern" aria-hidden="true" /><strong>ENCENDER #TV</strong><small>Entrarás a la transmisión que ya está al aire</small></button>}
            <div className="channel-bug">{channel.label}</div>
          </div></div>
          <div className="transport">
            <div className="now-playing"><span>{remote.signal.mode === "live" ? "EN VIVO" : "AHORA EN"} {channel.label}</span><h1>{current.title}</h1><p>{current.artist} · {current.year}</p></div>
          </div>
          <div className={remote.signal.mode === "live" ? "progress live-progress" : "progress"} aria-label={`Avance de ${current.title}`}><span style={{ width: `${currentProgress}%` }} /></div>
        </div>
      </section>

      <section className="guide" id="guia">
        <div className="section-title"><p>PROGRAMACIÓN</p><h2>Lo que está pasando</h2><span>{new Date(now).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })} · HORA DEL ESPECTADOR</span></div>
        <div className="guide-grid">
          <article className="guide-card current-card"><span>{remote.signal.mode === "live" ? "SEÑAL EN VIVO" : "EN PANTALLA"}</span><div className="guide-number">01</div><h3>{current.title}</h3><p>{current.artist}</p><small>{remote.signal.mode === "live" ? "Transmitiendo ahora" : `Quedan aprox. ${formatTime(Math.max(current.duration - currentOffset, 0))}`}</small></article>
          <article className="guide-card"><span>A CONTINUACIÓN</span><div className="guide-number">02</div><h3>{nextGuide.title}</h3><p>{nextGuide.artist}</p><small>{formatTime(nextGuide.duration)}</small></article>
          <article className="guide-card"><span>DESPUÉS</span><div className="guide-number">03</div><h3>{afterGuide.title}</h3><p>{afterGuide.artist}</p><small>{formatTime(afterGuide.duration)}</small></article>
        </div>
      </section>

      <section className="live-strip"><div><span>CONTROL MAESTRO</span><h2>La cabina ya puede tomar la señal.</h2></div><p>Estudio, entrevistas, especiales, comerciales y videoclips pueden entrar al aire. Cuando termina una intervención, la programación automática continúa.</p></section>
      <footer><div className="brand footer-brand"><span className="brand-mark">#</span><span>HASHTAG<br /><b>TV</b></span></div><p>Una evolución de Hashtag Radio.</p><span>PROTOTIPO · 2026</span></footer>
    </main>
  );
}

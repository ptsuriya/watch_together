"use client";

import { QRCodeSVG } from "qrcode.react";
import Image from "next/image";
import {
  Check, ChevronRight, Copy, Crown, Expand, Link2,
  Menu, MonitorUp, Music2, Pause, Play, Plus, Radio, Send, Sparkles, Users, X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type QueueItem, type RoomEvent, type RoomMode, useRoomRealtime,
} from "../lib/room-realtime";

const starterQueue: QueueItem[] = [
  { id: "starter-m83", title: "Midnight City", channel: "M83", duration: "4:04", thumb: "https://i.ytimg.com/vi/dX3k_QDnzHE/mqdefault.jpg" },
  { id: "starter-khai", title: "Sunkissed", channel: "khai dreams", duration: "2:55", thumb: "https://i.ytimg.com/vi/2jTg-q6Drt0/mqdefault.jpg" },
  { id: "starter-bea", title: "Glue Song", channel: "beabadoobee", duration: "2:15", thumb: "https://i.ytimg.com/vi/8P0mThgI7bo/mqdefault.jpg" },
];

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint32Array(8));
  return `WAVE-${Array.from(values, (value) => alphabet[value % alphabet.length]).join("")}`;
}

function getYouTubeId(value: string) {
  const match = value.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
  return match?.[1] ?? null;
}

function makeQueueItem(id: string): QueueItem {
  return {
    id: crypto.randomUUID(),
    title: "New video from YouTube",
    channel: "Added by you",
    duration: "—",
    thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  };
}

export default function RoomClient({
  sharedRoom,
  requestedHost: initialRequestedHost = false,
  supabaseUrl,
  supabaseKey,
}: {
  sharedRoom?: string;
  requestedHost?: boolean;
  supabaseUrl?: string;
  supabaseKey?: string;
}) {
  const [screen, setScreen] = useState<"home" | "room">(sharedRoom ? "room" : "home");
  const [roomCode, setRoomCode] = useState(sharedRoom?.toUpperCase() ?? "WAVE-8K4N");
  const [requestedHost, setRequestedHost] = useState(initialRequestedHost);
  const [joinCode, setJoinCode] = useState("");
  const [mode, setMode] = useState<RoomMode>("watch");
  const [queue, setQueue] = useState(starterQueue);
  const [videoUrl, setVideoUrl] = useState("");
  const [isPlaying, setIsPlaying] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [copied, setCopied] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [notice, setNotice] = useState("");
  const appRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<HTMLIFrameElement>(null);
  const broadcastRef = useRef<(event: RoomEvent) => void>(() => undefined);
  const isHostRef = useRef(false);
  const supabaseConfig = useMemo(
    () => ({ url: supabaseUrl, key: supabaseKey }),
    [supabaseKey, supabaseUrl],
  );

  const controlPlayer = useCallback((action: "play" | "pause" | "seek", seconds?: number) => {
    const command = action === "play" ? "playVideo" : action === "pause" ? "pauseVideo" : "seekTo";
    playerRef.current?.contentWindow?.postMessage(
      JSON.stringify({ event: "command", func: command, args: action === "seek" ? [seconds ?? 0, true] : [] }),
      "https://www.youtube-nocookie.com",
    );
  }, []);

  const handleRoomEvent = useCallback((event: RoomEvent) => {
    if (event.kind === "queue:add") {
      setQueue((current) => current.some((item) => item.id === event.item.id) ? current : [...current, event.item]);
      return;
    }
    if (event.kind === "order:video") {
      if (isHostRef.current) {
        setQueue((current) => current.some((item) => item.id === event.item.id) ? current : [...current, event.item]);
        broadcastRef.current({ kind: "queue:add", item: event.item });
      }
      return;
    }
    if (event.kind === "mode:set") {
      setMode(event.mode);
      return;
    }
    if (event.kind === "player") {
      setIsPlaying(event.action === "play");
      controlPlayer(event.action, event.seconds);
      return;
    }
    if (event.kind === "state:request" && isHostRef.current) {
      broadcastRef.current({ kind: "state:sync", queue, mode, isPlaying });
      return;
    }
    if (event.kind === "state:sync") {
      setQueue(event.queue);
      setMode(event.mode);
      setIsPlaying(event.isPlaying);
      controlPlayer(event.isPlaying ? "play" : "pause");
    }
  }, [controlPlayer, isPlaying, mode, queue]);

  const { status, members, isHost, broadcast, realtimeConfigured } = useRoomRealtime({
    enabled: screen === "room",
    roomCode,
    requestedHost,
    onEvent: handleRoomEvent,
    supabase: supabaseConfig,
  });

  useEffect(() => {
    broadcastRef.current = broadcast;
  }, [broadcast]);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  const inviteUrl = useMemo(() => {
    if (typeof window === "undefined") return `sidewave.app/?room=${roomCode}`;
    return `${window.location.origin}/?room=${roomCode}`;
  }, [roomCode]);

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  function createRoom() {
    const code = makeRoomCode();
    window.history.replaceState({}, "", `/?room=${code}&host=1`);
    setRoomCode(code);
    setRequestedHost(true);
    setScreen("room");
  }

  function joinRoom() {
    if (!joinCode.trim()) return;
    const code = joinCode.trim().toUpperCase();
    window.history.replaceState({}, "", `/?room=${code}`);
    setRoomCode(code);
    setRequestedHost(false);
    setScreen("room");
  }

  function addVideo() {
    const id = getYouTubeId(videoUrl);
    if (!id) return;
    const item = makeQueueItem(id);
    if (mode === "order" && realtimeConfigured && !isHost) {
      broadcast({ kind: "order:video", item });
      setNotice("Order sent to the host.");
    } else {
      setQueue((current) => [...current, item]);
      if (realtimeConfigured) broadcast({ kind: "queue:add", item });
    }
    setVideoUrl("");
  }

  function changeMode(nextMode: RoomMode) {
    if (realtimeConfigured && !isHost) {
      setNotice("Only the host can change the room mode.");
      return;
    }
    setMode(nextMode);
    if (realtimeConfigured) broadcast({ kind: "mode:set", mode: nextMode });
  }

  function togglePlayback() {
    if (mode === "order" && realtimeConfigured && !isHost) {
      setNotice("Only the host controls playback in Order mode.");
      return;
    }
    const action = isPlaying ? "pause" : "play";
    setIsPlaying(!isPlaying);
    controlPlayer(action);
    if (realtimeConfigured) broadcast({ kind: "player", action });
  }

  async function copyInvite() {
    await navigator.clipboard?.writeText(inviteUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function toggleFullscreen() {
    if (!appRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await appRef.current.requestFullscreen();
  }

  if (screen === "home") {
    return (
      <main className="home-shell">
        <nav className="topbar"><a className="brand" href="#top"><span className="brand-mark">S</span>sidewave</a><span className="beta">BETA</span><a href="#how" className="how-link">How it works <ChevronRight size={15} /></a></nav>
        <section className="home-hero" id="top">
          <div className="hero-copy"><p className="eyebrow"><Radio size={14} /> YOUR ROOM, ONE WAVE</p><h1>Press play.<br /><i>Be there.</i></h1><p className="hero-subtitle">Watch YouTube together without the awkward “3, 2, 1, go.” Make a room, invite your people, and let the queue do its thing.</p><button className="primary-button" onClick={createRoom}>Create a room <ChevronRight size={19} /></button></div>
          <div className="room-preview" aria-label="Preview of a Sidewave room"><div className="preview-top"><span><span className="live-dot" /> LIVE ROOM</span><span>06:42 PM</span></div><div className="preview-video"><span className="video-orb orb-a" /><span className="video-orb orb-b" /><button aria-label="Preview play"><Play fill="currentColor" size={30} /></button><p>THE LATE SHIFT</p></div><div className="preview-bottom"><div><strong>After dark</strong><span>Lo-fi dreamscape</span></div><div className="stacked-avatars"><b>R</b><b>T</b><b>+</b></div></div></div>
        </section>
        <section className="join-strip"><div><p className="eyebrow"><Link2 size={14} /> GOT AN INVITE?</p><h2>Enter the room code.</h2></div><div className="join-form"><label htmlFor="room-code" className="sr-only">Room code</label><input id="room-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && joinRoom()} placeholder="WAVE-XXXX" /><button onClick={joinRoom} aria-label="Join room"><ChevronRight size={22} /></button></div></section>
        <section className="how-grid" id="how"><div><span>01</span><h3>Start a wave</h3><p>Create a private room in seconds. No accounts, no complicated setup.</p></div><div><span>02</span><h3>Bring the crew</h3><p>Share a room code or scan the QR. Your people arrive in one tap.</p></div><div><span>03</span><h3>Choose the flow</h3><p>Sync the watch party, or let friends send requests to the host.</p></div></section>
      </main>
    );
  }

  return (
    <main className="room-shell" ref={appRef}>
      <header className="room-header"><button className="brand room-brand" onClick={() => setScreen("home")}><span className="brand-mark">S</span>sidewave</button><div className="room-status"><span className={`sync-dot ${status}`} /> {status === "connected" ? "Synced live" : status === "connecting" ? "Connecting" : status === "disabled" ? "Demo mode" : "Connection issue"} <span className="code-chip">{roomCode}</span></div><div className="header-actions"><button className="icon-button" onClick={() => setShowInvite(true)} aria-label="Invite people"><Users size={19} /></button><button className="icon-button" onClick={toggleFullscreen} aria-label="Toggle fullscreen"><Expand size={19} /></button><button className="menu-button"><Menu size={20} /></button></div></header>
      <div className="room-layout">
        <section className="watch-panel"><div className="video-frame"><iframe ref={playerRef} src="https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?rel=0&enablejsapi=1" title="Now playing YouTube video" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /><div className="video-label"><span>NOW PLAYING</span><strong>YouTube Player API Demo</strong></div><button className="floating-fullscreen" onClick={toggleFullscreen} aria-label="Fullscreen player"><Expand size={18} /></button></div>
          <div className="now-playing"><div className="artwork"><Music2 size={25} /></div><div className="track-info"><p>YOUTUBE SESSION</p><h2>watching in the same moment</h2><span>{isHost ? "You are the host" : "You are listening"} · {members.length || 1} online</span></div><button className="play-button" onClick={togglePlayback} aria-label={isPlaying ? "Pause session" : "Resume session"}>{isPlaying ? <Pause fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} />}</button><div className="timeline"><span style={{ width: "38%" }} /></div><span className="time">12:48 / 32:10</span></div>
          <div className="mode-switch" role="tablist" aria-label="Room mode"><button className={mode === "watch" ? "active" : ""} onClick={() => changeMode("watch")} role="tab" aria-selected={mode === "watch"}><MonitorUp size={18} /><span>Watch together</span><small>Everyone stays in sync</small></button><button className={mode === "order" ? "active" : ""} onClick={() => changeMode("order")} role="tab" aria-selected={mode === "order"}><Send size={18} /><span>Order to host</span><small>Requests go to the host</small></button></div>
          <form className="add-video" onSubmit={(event) => { event.preventDefault(); addVideo(); }}><Link2 size={18} /><label htmlFor="youtube-url" className="sr-only">YouTube URL</label><input id="youtube-url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="Paste a YouTube link to add it" /><button type="submit" disabled={!getYouTubeId(videoUrl)}>{mode === "watch" ? "Add to queue" : "Send order"} <Plus size={17} /></button></form>{notice && <p className="room-notice">{notice}</p>}
        </section>
        <aside className="side-panel"><div className="side-heading"><div><p className="eyebrow">UP NEXT</p><h2>The wave queue</h2></div><span>{queue.length}</span></div><div className="queue-list">{queue.map((item, index) => <button key={item.id} className="queue-item" onClick={() => { setIsPlaying(true); controlPlayer("play"); if (realtimeConfigured) broadcast({ kind: "player", action: "play" }); }}><span className="queue-number">{String(index + 1).padStart(2, "0")}</span><Image src={item.thumb} alt="" width={43} height={31} unoptimized /><span className="queue-copy"><strong>{item.title}</strong><small>{item.channel}</small></span><small className="duration">{item.duration}</small></button>)}</div><div className="people"><div className="side-heading"><div><p className="eyebrow">IN THIS ROOM</p><h2>{members.length || 1} listener{(members.length || 1) === 1 ? "" : "s"}</h2></div><button className="add-person" onClick={() => setShowInvite(true)} aria-label="Invite friend"><Plus size={18} /></button></div><div className="people-list">{members.length ? members.map((member) => <div key={member.id}><span className="avatar avatar-you">{member.name.slice(-1)}</span><span>{member.name}{member.isHost && <small> (Host)</small>}</span>{member.isHost ? <Crown size={15} /> : <span className="presence" />}</div>) : <div><span className="avatar avatar-you">Y</span><span>You <small>({status === "disabled" ? "Demo" : "Joining"})</small></span><span className="presence" /></div>}</div></div></aside>
      </div>
      {showInvite && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowInvite(false)}><section className="invite-card" role="dialog" aria-modal="true" aria-labelledby="invite-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowInvite(false)} aria-label="Close invite dialog"><X size={18} /></button><p className="eyebrow"><Sparkles size={14} /> BRING YOUR PEOPLE</p><h2 id="invite-title">Join this wave</h2><p className="invite-description">Scan this code or send the room link. No sign-in required.</p><div className="qr-wrap"><QRCodeSVG value={inviteUrl} size={170} bgColor="#eef0ff" fgColor="#11142d" level="M" includeMargin /></div><div className="invite-link"><span>{inviteUrl}</span><button onClick={copyInvite}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Copied" : "Copy"}</button></div><div className="invite-code">Room code <strong>{roomCode}</strong></div></section></div>}
      {fullscreen && <div className="fullscreen-note">Press Esc to exit fullscreen</div>}
    </main>
  );
}

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
    videoId: id,
    title: "New video from YouTube",
    channel: "Added by you",
    duration: "—",
    thumb: `https://i.ytimg.com/vi/${id}/mqdefault.jpg`,
  };
}

export default function RoomClient({
  sharedRoom,
  requestedHost: initialRequestedHost = false,
  initialMode,
  supabaseUrl,
  supabaseKey,
}: {
  sharedRoom?: string;
  requestedHost?: boolean;
  initialMode?: RoomMode;
  supabaseUrl?: string;
  supabaseKey?: string;
}) {
  const [screen, setScreen] = useState<"home" | "room">(sharedRoom ? "room" : "home");
  const [roomCode, setRoomCode] = useState(sharedRoom?.toUpperCase() ?? "WAVE-8K4N");
  const [requestedHost, setRequestedHost] = useState(initialRequestedHost);
  const [joinCode, setJoinCode] = useState("");
  const [selectedMode, setSelectedMode] = useState<RoomMode | null>(null);
  const [mode, setMode] = useState<RoomMode>(initialMode ?? "watch");
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [videoUrl, setVideoUrl] = useState("");
  const [launchUrl, setLaunchUrl] = useState("");
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showNameEditor, setShowNameEditor] = useState(false);
  const [listenerName, setListenerName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [appOrigin, setAppOrigin] = useState("https://sidewave.app");
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
        setActiveVideoId(event.item.videoId);
        setIsPlaying(true);
        broadcastRef.current({ kind: "queue:add", item: event.item });
      }
      return;
    }
    if (event.kind === "mode:set") {
      setMode(event.mode);
      return;
    }
    if (event.kind === "video:set") {
      setActiveVideoId(event.videoId);
      setIsPlaying(true);
      return;
    }
    if (event.kind === "player") {
      setIsPlaying(event.action === "play");
      controlPlayer(event.action, event.seconds);
      return;
    }
    if (event.kind === "state:request" && isHostRef.current) {
      broadcastRef.current({ kind: "state:sync", queue, mode, isPlaying, activeVideoId });
      return;
    }
    if (event.kind === "state:sync") {
      setQueue(event.queue);
      setMode(event.mode);
      setIsPlaying(event.isPlaying);
      setActiveVideoId(event.activeVideoId);
      controlPlayer(event.isPlaying ? "play" : "pause");
    }
  }, [activeVideoId, controlPlayer, isPlaying, mode, queue]);

  const { status, members, isHost, broadcast, realtimeConfigured } = useRoomRealtime({
    enabled: screen === "room",
    roomCode,
    requestedHost,
    listenerName,
    onEvent: handleRoomEvent,
    supabase: supabaseConfig,
  });

  useEffect(() => {
    const savedName = window.localStorage.getItem("sidewave-listener-name");
    const timeoutId = savedName ? window.setTimeout(() => setListenerName(savedName), 0) : undefined;
    return () => {
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setAppOrigin(window.location.origin), 0);
    return () => window.clearTimeout(timeoutId);
  }, []);

  useEffect(() => {
    broadcastRef.current = broadcast;
  }, [broadcast]);

  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  const inviteUrl = useMemo(() => {
    return `${appOrigin}/?room=${roomCode}${mode === "order" ? "&mode=order" : ""}`;
  }, [appOrigin, mode, roomCode]);

  useEffect(() => {
    const handleFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  useEffect(() => {
    if (!activeVideoId || !isPlaying) return;
    const timeoutId = window.setTimeout(() => controlPlayer("play"), 500);
    return () => window.clearTimeout(timeoutId);
  }, [activeVideoId, controlPlayer, isPlaying]);

  function createRoom() {
    if (!selectedMode) return;
    const code = makeRoomCode();
    window.history.replaceState({}, "", `/?room=${code}&host=1`);
    setRoomCode(code);
    setRequestedHost(true);
    setMode(selectedMode);
    setShowInvite(selectedMode === "watch");
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
      const shouldStart = mode === "order" ? true : !activeVideoId;
      if (shouldStart) {
        setActiveVideoId(id);
        setIsPlaying(true);
      }
      if (realtimeConfigured) {
        broadcast({ kind: "queue:add", item });
        if (shouldStart && mode !== "order") {
          broadcast({ kind: "video:set", videoId: id });
          broadcast({ kind: "player", action: "play" });
        }
      }
    }
    setVideoUrl("");
  }

  function launchVideo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const id = getYouTubeId(launchUrl);
    if (!id) {
      setNotice("Paste a valid YouTube link to start the room.");
      return;
    }
    setActiveVideoId(id);
    setIsPlaying(true);
    if (realtimeConfigured) broadcast({ kind: "video:set", videoId: id });
    if (realtimeConfigured) broadcast({ kind: "player", action: "play" });
    setShowInvite(false);
    setNotice("YouTube video is ready for everyone in this room.");
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

  function returnHome() {
    window.history.replaceState({}, "", "/");
    setRequestedHost(false);
    setScreen("home");
  }

  function saveListenerName(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = nameDraft.trim().replace(/\s+/g, " ").slice(0, 32);
    if (!nextName) return;
    setListenerName(nextName);
    window.localStorage.setItem("sidewave-listener-name", nextName);
    setShowNameEditor(false);
  }

  const videoForm = <form className="add-video" onSubmit={(event) => { event.preventDefault(); addVideo(); }}><Link2 size={18} /><label htmlFor="youtube-url" className="sr-only">YouTube URL</label><input id="youtube-url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder={mode === "order" ? "Paste a YouTube link to order" : "Paste a YouTube link to add it"} /><button type="submit" disabled={!getYouTubeId(videoUrl)}>{mode === "watch" ? "Add to queue" : isHost ? "Add to list" : "Send order"} <Plus size={17} /></button></form>;

  if (screen === "home") {
    return (
      <main className="home-shell">
        <nav className="topbar"><a className="brand" href="#top"><span className="brand-mark">S</span>sidewave</a><span className="beta">BETA</span><a href="#how" className="how-link">How it works <ChevronRight size={15} /></a></nav>
        <section className="home-hero" id="top">
          <div className="hero-copy"><p className="eyebrow"><Radio size={14} /> YOUR ROOM, ONE WAVE</p><h1>Press play.<br /><i>Be there.</i></h1><p className="hero-subtitle">Watch YouTube together without the awkward “3, 2, 1, go.” Choose how your room works, then invite your people.</p><div className="home-mode-picker" role="radiogroup" aria-label="Choose room mode"><button className={selectedMode === "watch" ? "selected" : ""} onClick={() => setSelectedMode("watch")} role="radio" aria-checked={selectedMode === "watch"}><MonitorUp size={19} /><span><strong>Watch together</strong><small>Sync playback and queue</small></span></button><button className={selectedMode === "order" ? "selected" : ""} onClick={() => setSelectedMode("order")} role="radio" aria-checked={selectedMode === "order"}><Send size={19} /><span><strong>Order to host</strong><small>Requests go to one screen</small></span></button></div><button className="primary-button" onClick={createRoom} disabled={!selectedMode}>Create a room <ChevronRight size={19} /></button></div>
          <div className="room-preview" aria-label="Preview of a Sidewave room"><div className="preview-top"><span><span className="live-dot" /> LIVE ROOM</span><span>06:42 PM</span></div><div className="preview-video"><span className="video-orb orb-a" /><span className="video-orb orb-b" /><button aria-label="Preview play"><Play fill="currentColor" size={30} /></button><p>THE LATE SHIFT</p></div><div className="preview-bottom"><div><strong>After dark</strong><span>Lo-fi dreamscape</span></div><div className="stacked-avatars"><b>R</b><b>T</b><b>+</b></div></div></div>
        </section>
        <section className="join-strip"><div><p className="eyebrow"><Link2 size={14} /> GOT AN INVITE?</p><h2>Enter the room code.</h2></div><div className="join-form"><label htmlFor="room-code" className="sr-only">Room code</label><input id="room-code" value={joinCode} onChange={(event) => setJoinCode(event.target.value)} onKeyDown={(event) => event.key === "Enter" && joinRoom()} placeholder="WAVE-XXXX" /><button onClick={joinRoom} aria-label="Join room"><ChevronRight size={22} /></button></div></section>
        <section className="how-grid" id="how"><div><span>01</span><h3>Start a wave</h3><p>Create a private room in seconds. No accounts, no complicated setup.</p></div><div><span>02</span><h3>Bring the crew</h3><p>Share a room code or scan the QR. Your people arrive in one tap.</p></div><div><span>03</span><h3>Choose the flow</h3><p>Sync the watch party, or let friends send requests to the host.</p></div></section>
      </main>
    );
  }

  if (status === "room-not-found") {
    return <main className="room-closed"><section><span className="brand-mark">S</span><p className="eyebrow">ROOM CLOSED</p><h1>ห้องนี้ปิดแล้ว</h1><p>ลิงก์หรือ QR นี้ไม่ใช่ห้องที่กำลังเปิดอยู่ ลองขอลิงก์ใหม่จากโฮสต์อีกครั้งนะ</p><button className="primary-button" onClick={returnHome}>กลับหน้าหลัก <ChevronRight size={19} /></button></section></main>;
  }

  return (
    <main className="room-shell" ref={appRef}>
      <header className="room-header"><button className="brand room-brand" onClick={() => setScreen("home")}><span className="brand-mark">S</span>sidewave</button><div className="room-status"><span className={`sync-dot ${status}`} /> {status === "connected" ? "Synced live" : status === "connecting" ? "Connecting" : status === "disabled" ? "Demo mode" : "Connection issue"} <span className="code-chip">{roomCode}</span></div><div className="header-actions"><button className="icon-button" onClick={() => setShowInvite(true)} aria-label="Invite people"><Users size={19} /></button><button className="icon-button" onClick={toggleFullscreen} aria-label="Toggle fullscreen"><Expand size={19} /></button><button className="menu-button"><Menu size={20} /></button></div></header>
      <div className={`room-layout ${mode === "order" ? "order-layout" : ""}${mode === "order" && !isHost ? " guest-order-layout" : ""}`}>
        <section className="watch-panel"><div className="video-frame">{activeVideoId ? <><iframe ref={playerRef} src={`https://www.youtube-nocookie.com/embed/${activeVideoId}?rel=0&enablejsapi=1&autoplay=${isPlaying ? "1" : "0"}`} title="Now playing YouTube video" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen /><div className="video-label"><span>NOW PLAYING</span><strong>YouTube video</strong></div><button className="floating-fullscreen" onClick={toggleFullscreen} aria-label="Fullscreen player"><Expand size={18} /></button></> : <div className="empty-player"><Music2 size={34} /><strong>No video yet</strong><span>Paste a YouTube link below to start the room.</span></div>}</div>
          <div className="now-playing"><div className="artwork"><Music2 size={25} /></div><div className="track-info"><p>YOUTUBE SESSION</p><h2>{activeVideoId ? "watching in the same moment" : "Waiting for a video"}</h2><span>{activeVideoId ? `${isHost ? "You are the host" : "You are listening"} · ${members.length || 1} online` : isHost ? "Paste a YouTube link below to begin" : "Waiting for the host to choose a video"}</span></div><button className="play-button" onClick={togglePlayback} aria-label={isPlaying ? "Pause session" : "Resume session"} disabled={!activeVideoId}>{isPlaying ? <Pause fill="currentColor" size={20} /> : <Play fill="currentColor" size={20} />}</button><div className="timeline"><span style={{ width: "38%" }} /></div><span className="time">12:48 / 32:10</span></div>
          <div className="mode-switch" role="tablist" aria-label="Room mode"><button className={mode === "watch" ? "active" : ""} onClick={() => changeMode("watch")} role="tab" aria-selected={mode === "watch"}><MonitorUp size={18} /><span>Watch together</span><small>Everyone stays in sync</small></button><button className={mode === "order" ? "active" : ""} onClick={() => changeMode("order")} role="tab" aria-selected={mode === "order"}><Send size={18} /><span>Order to host</span><small>Requests go to the host</small></button></div>
          {mode !== "order" && videoForm}{mode !== "order" && notice && <p className="room-notice">{notice}</p>}
        </section>
        <aside className="side-panel"><div className="side-heading"><div><p className="eyebrow">UP NEXT</p><h2>The wave queue</h2></div><span>{queue.length}</span></div><div className="queue-list">{queue.length ? queue.map((item, index) => <button key={item.id} className="queue-item" onClick={() => { setActiveVideoId(item.videoId); setIsPlaying(true); controlPlayer("play"); if (realtimeConfigured && mode !== "order") { broadcast({ kind: "video:set", videoId: item.videoId }); broadcast({ kind: "player", action: "play" }); } }}><span className="queue-number">{String(index + 1).padStart(2, "0")}</span><Image src={item.thumb} alt="" width={43} height={31} unoptimized /><span className="queue-copy"><strong>{item.title}</strong><small>{item.channel}</small></span><small className="duration">{item.duration}</small></button>) : <p className="empty-queue">No orders yet. Scan the QR or paste a YouTube link.</p>}</div><div className="people"><div className="side-heading"><div><p className="eyebrow">IN THIS ROOM</p><h2>{members.length || 1} listener{(members.length || 1) === 1 ? "" : "s"}</h2></div><button className="add-person" onClick={() => setShowInvite(true)} aria-label="Invite friend"><Plus size={18} /></button></div><div className="people-list">{members.length ? members.map((member) => <div key={member.id}><span className="avatar avatar-you">{member.name.slice(-1)}</span><span>{member.name}{member.isHost && <small> (Host)</small>}</span>{member.isHost ? <Crown size={15} /> : <span className="presence" />}</div>) : <div><span className="avatar avatar-you">Y</span><span>{listenerName || "You"} <small>({status === "disabled" ? "Demo" : "Joining"})</small></span><span className="presence" /></div>}</div><button className="rename-listener" onClick={() => { setNameDraft(listenerName); setShowNameEditor(true); }}>Change your name</button></div></aside>
        {mode === "order" && <section className="order-input-panel">{!isHost && <p className="guest-order-intro">Send a YouTube link to the host.</p>}{videoForm}{notice && <p className="room-notice">{notice}</p>}</section>}
        {mode === "order" && <aside className="order-qr-card"><p className="eyebrow"><Users size={14} /> SCAN TO ORDER</p><h2>Let guests pick</h2><p>Keep this QR on your shared screen. Guests scan it, then send a YouTube order from their phone.</p><div className="order-qr"><QRCodeSVG value={inviteUrl} size={100} bgColor="#eef0ff" fgColor="#11142d" level="M" includeMargin /></div><div className="order-link"><span>{inviteUrl}</span><button onClick={copyInvite} aria-label="Copy room link">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div></aside>}
      </div>
      {showInvite && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowInvite(false)}><section className="invite-card" role="dialog" aria-modal="true" aria-labelledby="invite-title" onMouseDown={(event) => event.stopPropagation()}><button className="modal-close" onClick={() => setShowInvite(false)} aria-label="Close invite dialog"><X size={18} /></button><p className="eyebrow"><Sparkles size={14} /> ROOM READY</p><h2 id="invite-title">Invite, then press play</h2><p className="invite-description">Share the QR or room link, then choose the first YouTube video for this {mode === "watch" ? "watch-together" : "host-order"} room.</p><div className="qr-wrap"><QRCodeSVG value={inviteUrl} size={150} bgColor="#eef0ff" fgColor="#11142d" level="M" includeMargin /></div><div className="invite-link"><span>{inviteUrl}</span><button onClick={copyInvite}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? "Copied" : "Copy"}</button></div><div className="invite-code">Room code <strong>{roomCode}</strong></div><form className="launch-video" onSubmit={launchVideo}><label htmlFor="launch-youtube">First YouTube link</label><div><input id="launch-youtube" value={launchUrl} onChange={(event) => setLaunchUrl(event.target.value)} placeholder="Paste a YouTube link" /><button type="submit" disabled={!getYouTubeId(launchUrl)}>Start room <Play fill="currentColor" size={14} /></button></div></form><button className="choose-later" onClick={() => setShowInvite(false)}>Choose a video later</button></section></div>}
      {showNameEditor && <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowNameEditor(false)}><form className="name-card" role="dialog" aria-modal="true" aria-labelledby="name-title" onMouseDown={(event) => event.stopPropagation()} onSubmit={saveListenerName}><button className="modal-close" type="button" onClick={() => setShowNameEditor(false)} aria-label="Close name dialog"><X size={18} /></button><p className="eyebrow"><Users size={14} /> LISTENER NAME</p><h2 id="name-title">What should we call you?</h2><label htmlFor="listener-name">Your name</label><input id="listener-name" value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} maxLength={32} placeholder="e.g. Ptsuriya" autoFocus /><button className="save-name" type="submit" disabled={!nameDraft.trim()}>Save name</button></form></div>}
      {fullscreen && <div className="fullscreen-note">Press Esc to exit fullscreen</div>}
    </main>
  );
}

"use client";

import { ArrowRight, Check, Mic, MicVocal, MonitorPlay, Music2, QrCode, ScanLine, Star, Tv, UserX } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ROOM_MODES, type RoomMode } from "../../lib/room-state";
import { MODE_LABELS } from "./room-model";
import { QrScanDialog } from "./qr-scanner";
import { Art, type ArtName, Brand } from "./ui";

const MODE_ICONS: Record<RoomMode, typeof Tv> = { watch: MonitorPlay, remote: Tv, karaoke: Mic, singalong: MicVocal };

const MODE_BEARS: Record<RoomMode, ArtName> = { watch: "laptop", remote: "phone", karaoke: "party", singalong: "hello" };

const MODE_POINTS: Record<RoomMode, string[]> = {
  watch: ["วิดีโอเล่นพร้อมกันทุกเครื่อง", "ทุกคนเข้าคิวได้", "โฮสต์แปะเนื้อเพลง อ่านตัวใหญ่ได้"],
  remote: ["จอโฮสต์โชว์วิดีโอใหญ่สุด", "QR ติดจอ สแกนแล้วใช้ได้เลย", "มือถือเป็นรีโมท เพิ่มคิว เล่น ข้าม"],
  karaoke: ["ทุกอย่างของโหมดรีโมท", "ลด-เพิ่มคีย์จากมือถือ", "จอกลางเปลี่ยนคีย์จริงด้วยส่วนเสริม KUMA"],
  singalong: ["ร้องกันคนละที่ ทุกคนมีจอของตัวเอง", "เนื้อเพลงขึ้นทุกเครื่อง อ่านตัวใหญ่ได้", "ปรับคีย์ทั้งห้อง เครื่องที่ติดตั้งส่วนเสริมจะได้ยินคีย์ใหม่"],
};

const ROOM_CODE = /^WAVE-[A-Z0-9]{8}$/;

/** Accepts a room code with or without its prefix, or a whole invite link. */
function normalizeRoomCode(input: string) {
  const value = input.trim();
  const fromLink = value.match(/[?&]room=([^&#\s]+)/i)?.[1];
  const code = (fromLink ?? value).toUpperCase().replace(/\s+/g, "");
  const withPrefix = code.startsWith("WAVE-") ? code : `WAVE-${code}`;
  return ROOM_CODE.test(withPrefix) ? withPrefix : null;
}

function ModeDiagram({ mode }: { mode: RoomMode }) {
  if (mode === "watch" || mode === "singalong") {
    return (
      <div className="diagram diagram-watch" aria-hidden="true">
        <span className="d-video" /><span className="d-notes" />
        <span className="d-block" /><span className="d-block" />
      </div>
    );
  }
  return (
    <div className="diagram diagram-tv" aria-hidden="true">
      <span className="d-video d-video-lg" />
      <span className="d-side"><span className="d-qr" /><span className="d-line" /><span className="d-line" /></span>
      <span className="d-phone">{mode === "karaoke" ? <b>− +</b> : <b>+</b>}</span>
    </div>
  );
}

export function HomeScreen({ onCreate, onJoin }: { onCreate: (mode: RoomMode) => void; onJoin: (code: string) => void }) {
  const [mode, setMode] = useState<RoomMode>("watch");
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [scanning, setScanning] = useState(false);

  function joinFromScan(value: string) {
    const normalized = normalizeRoomCode(value);
    setScanning(false);
    if (!normalized) {
      setCode(value.slice(0, 64));
      setCodeError("QR นี้ไม่ใช่ห้องของ KUMA Listening Party");
      return;
    }
    onJoin(normalized);
  }

  function join(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeRoomCode(code);
    if (!normalized) {
      setCodeError("รหัสห้องมีรูปแบบ WAVE- ตามด้วยตัวอักษร 8 ตัว หรือวางลิงก์เชิญทั้งลิงก์ก็ได้");
      return;
    }
    onJoin(normalized);
  }

  return (
    <div className="home">
      <header className="site-header">
        <div className="container site-header-inner">
          <Brand />
          <a href="#join" className="btn btn-secondary btn-sm">มีรหัสห้องแล้ว</a>
        </div>
      </header>

      <main>
        <section className="hero bg-dots">
          <div className="container hero-grid">
            <div className="hero-copy">
              <span className="pill">
                <span className="live-dot" aria-hidden="true" /> ปาร์ตี้ฟังเพลงกับหมี KUMA · ไม่ต้องสมัคร
              </span>
              <h1>
                ดูยูทูบด้วยกัน
                <br />
                ไม่ต้องนับ 3 2 1
              </h1>
              <p className="lead">
                เลือกโหมดให้เข้ากับวง แล้วชวนเพื่อนด้วย QR ทุกคนเห็นวิดีโอเดียวกันในจังหวะเดียวกัน จะดูคนละจอ
                ใช้ทีวีเครื่องเดียว หรือร้องคาราโอเกะก็ได้
              </p>

              <p className="field-label" id="mode-label">เลือกโหมดของห้อง</p>
              <div className="card mode-list" role="radiogroup" aria-labelledby="mode-label">
                {ROOM_MODES.map((option) => {
                  const Icon = MODE_ICONS[option];
                  const selected = option === mode;
                  return (
                    <button key={option} type="button" role="radio" aria-checked={selected} className="mode-option" onClick={() => setMode(option)}>
                      <span className="mode-icon"><Icon size={22} aria-hidden="true" /></span>
                      <span className="mode-copy">
                        <strong>{MODE_LABELS[option].name}</strong>
                        <small>{MODE_LABELS[option].description}</small>
                      </span>
                      <span className="mode-check" aria-hidden="true">{selected && <Check size={16} strokeWidth={3} />}</span>
                    </button>
                  );
                })}
              </div>
              <button type="button" className="btn btn-primary btn-lg" onClick={() => onCreate(mode)}>
                สร้างห้อง{MODE_LABELS[mode].name} <ArrowRight size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="hero-art" aria-hidden="true">
              <span className="hero-sun" />
              <div className="hero-screen">
                <span className="hero-screen-play"><Music2 size={30} /></span>
                <span className="hero-screen-bar"><span /></span>
              </div>
              <Art name="waving" className="hero-bear float" sizes="(min-width: 1024px) 220px, 44vw" priority />
              <Art name="boba" className="hero-sticker hero-boba float-slow" sizes="80px" />
              <Art name="star" className="hero-sticker hero-star float" sizes="64px" />
              <Art name="heart" className="hero-sticker hero-heart float-slow" sizes="56px" />
              <span className="sticker sticker-key float-slow">คีย์ +2</span>
              <span className="sticker sticker-queue float">คิวถัดไป 3 เพลง</span>
              <span className="sticker sticker-qr float-slow"><QrCode size={18} /> สแกนเข้าห้อง</span>
            </div>
          </div>
        </section>

        <section className="trust-band" aria-label="จุดเด่น">
          <ul className="container">
            <li><Star size={16} aria-hidden="true" /> ไม่ต้องสมัครสมาชิก</li>
            <li><Star size={16} aria-hidden="true" /> สแกน QR เข้าห้องได้ในแตะเดียว</li>
            <li><Star size={16} aria-hidden="true" /> ใช้ได้ทั้งมือถือ คอม และทีวี</li>
          </ul>
        </section>

        <section className="modes-section" aria-labelledby="modes-title">
          <div className="container">
            <h2 id="modes-title" className="section-title">{ROOM_MODES.length} โหมด สำหรับทุกแบบของวง</h2>
            <p className="section-lead">โฮสต์เปลี่ยนโหมดได้ทุกเมื่อจากหัวห้อง เพื่อนในห้องจะเปลี่ยนตามทันที</p>
            <div className="mode-cards">
              {ROOM_MODES.map((option) => {
                const Icon = MODE_ICONS[option];
                return (
                  <article key={option} className="card mode-card">
                    <Art name={MODE_BEARS[option]} className="mode-card-bear float-slow" sizes="120px" />
                    <ModeDiagram mode={option} />
                    <h3><Icon size={20} aria-hidden="true" /> {MODE_LABELS[option].name}</h3>
                    <ul>
                      {MODE_POINTS[option].map((point) => <li key={point}><Check size={16} aria-hidden="true" /> {point}</li>)}
                    </ul>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="join" className="join-section" aria-labelledby="join-title">
          <div className="container join-grid">
            <div className="join-copy">
              <Art name="envelope" className="join-bear float" sizes="140px" />
              <h2 id="join-title" className="section-title">มีรหัสห้องแล้ว?</h2>
              <p className="section-lead">พิมพ์รหัสที่โฮสต์ส่งมา หรือสแกน QR จากจอของโฮสต์ก็เข้าห้องได้เหมือนกัน</p>
            </div>
            <form className="card join-card" onSubmit={join} noValidate>
              <label htmlFor="room-code" className="field-label">รหัสห้อง</label>
              <div className="add-row">
                <input
                  id="room-code"
                  className="field code-field"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value);
                    setCodeError("");
                  }}
                  placeholder="WAVE-XXXXXXXX"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={codeError ? true : undefined}
                  aria-describedby={codeError ? "room-code-error" : undefined}
                />
                <button type="submit" className="btn btn-primary" disabled={!code.trim()}>
                  เข้าห้อง <ArrowRight size={18} aria-hidden="true" />
                </button>
              </div>
              <button type="button" className="btn btn-secondary btn-block scan-button" onClick={() => setScanning(true)}>
                <ScanLine size={18} aria-hidden="true" /> สแกน QR ด้วยกล้อง
              </button>
              {codeError && <p id="room-code-error" className="form-note is-error">{codeError}</p>}
            </form>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <Art name="sleeping" className="footer-bear" sizes="110px" />
          <div className="footer-copy">
            <strong>KUMA Listening Party</strong>
            <p>
              <UserX size={16} aria-hidden="true" /> ห้องอยู่ตราบที่โฮสต์ยังเปิดหน้าไว้ ไม่เก็บประวัติการดูและไม่ต้องใช้บัญชี
              {" · "}
              <Link href="/discord" className="footer-link">ดูด้วยกันผ่าน Discord</Link>
              {" · "}
              <Link href="/privacy" className="footer-link">ความเป็นส่วนตัว</Link>
            </p>
          </div>
          <Art name="pudding" className="footer-sticker" sizes="56px" />
        </div>
      </footer>

      {scanning && <QrScanDialog onResult={joinFromScan} onClose={() => setScanning(false)} />}
    </div>
  );
}

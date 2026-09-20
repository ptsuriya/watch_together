"use client";

import { Check, Copy, Download, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  helperBrowser, HELPER_PROBE_URL, HELPER_STORE_URL, HELPER_ZIP_URL,
  type HelperBrowser, type HelperStatus,
} from "../../lib/karaoke-key";
import { Art, Dialog } from "./ui";

/** Every browser keeps its extensions somewhere else, and Firefox does not load folders at all. */
const BROWSER_SETUP: Record<Exclude<HelperBrowser, "other">, { name: string; page: string; steps: string[]; note?: string }> = {
  chrome: {
    name: "Chrome",
    page: "chrome://extensions",
    steps: ["เปิด Developer mode ที่มุมขวาบน", "กด Load unpacked แล้วเลือกโฟลเดอร์ที่แตกไว้"],
  },
  edge: {
    name: "Edge",
    page: "edge://extensions",
    steps: ["เปิด “โหมดนักพัฒนา” ที่แถบซ้าย", "กด “โหลดส่วนขยายที่แตกไฟล์แล้ว” แล้วเลือกโฟลเดอร์ที่แตกไว้"],
  },
  opera: {
    name: "Opera",
    page: "opera://extensions",
    steps: ["เปิด Developer mode ที่มุมขวาบน", "กด Load unpacked แล้วเลือกโฟลเดอร์ที่แตกไว้"],
  },
  firefox: {
    name: "Firefox",
    page: "about:debugging#/runtime/this-firefox",
    steps: ["กด “โหลดส่วนเสริมชั่วคราว…” (Load Temporary Add-on)", "เลือกไฟล์ .zip ที่โหลดมาได้เลย ไม่ต้องแตกไฟล์"],
    note: "Firefox เก็บส่วนเสริมชั่วคราวไว้จนกว่าจะปิดเบราว์เซอร์ เปิดใหม่ต้องโหลดอีกครั้ง — และขั้นตอนนี้ยังไม่ได้ทดสอบเต็มที่ ถ้าเสียงไม่เปลี่ยนคีย์ ใช้ Chrome, Edge หรือ Opera ไปก่อน",
  },
};

const noSubscribe = () => () => {};

/** A hidden YouTube embed, loaded only so the extension can announce itself before the first song plays. */
export function KeyHelperProbe({ active }: { active: boolean }) {
  if (!active) return null;
  return <iframe src={HELPER_PROBE_URL} title="ตรวจส่วนเสริมเปลี่ยนคีย์" className="key-probe" tabIndex={-1} aria-hidden="true" />;
}

/** The shared screen speaks for the room; a sing-along screen speaks only for the person in front of it. */
export type HelperPlace = "stage" | "device";

const STATUS_LINE: Record<HelperStatus, { text: string; device?: string; tone: string }> = {
  ready: { text: "พร้อมเปลี่ยนคีย์จากมือถือแล้ว", device: "เครื่องนี้เปลี่ยนคีย์เสียงได้แล้ว", tone: "is-ok" },
  checking: { text: "กำลังตรวจส่วนเสริมเปลี่ยนคีย์…", tone: "" },
  blocked: { text: "คลิกที่หน้านี้หนึ่งครั้งเพื่อปลดล็อกเสียง", tone: "is-error" },
  missing: {
    text: "ยังไม่ได้ติดตั้งส่วนเสริม เสียงจะยังไม่เปลี่ยนคีย์",
    device: "เครื่องนี้ยังไม่ได้ติดตั้งส่วนเสริม จะได้ยินคีย์ต้นฉบับ",
    tone: "is-error",
  },
  outdated: {
    text: "ส่วนเสริมเป็นรุ่นเก่า โหลดรุ่นใหม่ทับเพื่อใช้ลดเสียงร้อง",
    device: "ส่วนเสริมบนเครื่องนี้เป็นรุ่นเก่า โหลดรุ่นใหม่ทับเพื่อใช้ลดเสียงร้อง",
    tone: "is-warn",
  },
  unsupported: {
    text: "จอนี้เปลี่ยนคีย์ไม่ได้ ต้องใช้ Chrome, Edge, Opera หรือ Firefox บนคอมพิวเตอร์",
    device: "เครื่องนี้ติดตั้งส่วนเสริมไม่ได้ จะได้ยินคีย์ต้นฉบับ (ใช้ Chrome, Edge, Opera หรือ Firefox บนคอมถึงจะเปลี่ยนได้)",
    tone: "is-error",
  },
};

/** One line under the key buttons, with a way back into the setup steps. */
export function KeyHelperStatusLine({ status, onOpenSetup, place = "stage" }: {
  status: HelperStatus;
  onOpenSetup: () => void;
  place?: HelperPlace;
}) {
  const line = STATUS_LINE[status];
  const tone = line.tone;
  const text = place === "device" ? line.device ?? line.text : line.text;
  return (
    <p className={`helper-note ${tone}`}>
      {status === "ready" ? <Check size={16} aria-hidden="true" /> : status === "checking" ? <span className="spinner" aria-hidden="true" /> : <TriangleAlert size={16} aria-hidden="true" />}
      <span>{text}</span>
      {status !== "ready" && status !== "checking" && (
        <button type="button" className="text-btn" onClick={onOpenSetup}>วิธีทำให้เสียงเปลี่ยน</button>
      )}
    </p>
  );
}

/** Opens by itself the moment a host starts a karaoke room, so nobody wonders why the key does nothing. */
export function KaraokeSetupDialog({ status, onClose, place = "stage", version = "" }: {
  status: HelperStatus;
  onClose: () => void;
  place?: HelperPlace;
  /** What the extension on this screen answers with, so an old one can be named. */
  version?: string;
}) {
  const [copied, setCopied] = useState(false);
  // Read after hydration: the server cannot know which browser is asking.
  const browser = useSyncExternalStore(noSubscribe, helperBrowser, (): HelperBrowser => "chrome");
  const setup = BROWSER_SETUP[browser === "other" ? "chrome" : browser];

  useEffect(() => {
    if (!copied) return;
    const timeoutId = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  async function copyExtensionsPage() {
    try {
      await navigator.clipboard.writeText(setup.page);
      setCopied(true);
    } catch {
      // The address is on screen anyway.
    }
  }

  return (
    <Dialog labelledBy="karaoke-setup-title" onClose={onClose}>
      <Art name="karaokeKey" className="dialog-bear dialog-bear-mark" sizes="128px" />
      <h2 id="karaoke-setup-title" className="dialog-title">
        {status === "ready" ? "พร้อมร้องแล้ว!" : status === "outdated" ? "มีส่วนเสริมรุ่นใหม่" : "อีกขั้นเดียว ให้ปุ่มคีย์เปลี่ยนเสียงจริง"}
      </h2>

      {status === "checking" && (
        <p className="dialog-text"><span className="spinner" aria-hidden="true" /> กำลังตรวจว่าเครื่องนี้ติดตั้งส่วนเสริมไว้หรือยัง…</p>
      )}

      {status === "ready" && (
        <p className="dialog-text">
          {place === "device"
            ? "เครื่องนี้ปรับคีย์ได้แล้ว คีย์ที่ใครในห้องกด จะเปลี่ยนเสียงในจอของคุณด้วย"
            : "เครื่องนี้ปรับคีย์ได้แล้ว ให้เพื่อนสแกน QR แล้วกดเพิ่ม-ลดคีย์จากมือถือได้เลย"}
        </p>
      )}

      {status === "blocked" && (
        <p className="dialog-text">เบราว์เซอร์ยังล็อกเสียงอยู่ คลิกที่หน้าห้องหนึ่งครั้ง แล้วลองกดปุ่มคีย์ใหม่อีกที</p>
      )}

      {status === "unsupported" && (
        <>
          <p className="dialog-text">
            หน้าจอนี้เปลี่ยนคีย์ไม่ได้ เพราะทีวี มือถือ และแท็บเล็ตติดตั้งส่วนเสริมไม่ได้
            ห้องยังใช้ได้ครบทุกอย่าง ทั้งคิวเพลง QR และอีโมจิ เพียงแต่ปุ่มคีย์จะเปลี่ยนแค่ตัวเลขบนจอ
          </p>
          <p className="dialog-text">
            {place === "device"
              ? "ถ้าอยากได้ยินคีย์ใหม่ด้วย ให้เปิดห้องนี้บนคอมพิวเตอร์ด้วย Chrome, Edge, Opera หรือ Firefox แล้วติดตั้งส่วนเสริม คนอื่นในห้องที่ติดตั้งแล้วจะได้ยินคีย์ที่เปลี่ยนตามปกติ"
              : "ถ้าอยากให้เสียงเปลี่ยนคีย์จริง ให้เปิดห้องนี้บนคอมพิวเตอร์ที่ต่อกับทีวี แล้วใช้ Chrome, Edge, Opera หรือ Firefox"}
          </p>
        </>
      )}

      {status === "outdated" && (
        <p className="dialog-text">
          เครื่องนี้ใช้ส่วนเสริมรุ่น {version || "เก่า"} อยู่ ส่วนเสริมที่ติดตั้งแบบโหลดโฟลเดอร์จะไม่อัปเดตเองเลย
          (มีแต่ของที่มาจากสโตร์เท่านั้นที่อัปเดตอัตโนมัติ) ให้โหลดไฟล์ใหม่ทับโฟลเดอร์เดิม แล้วกดปุ่มรีโหลด
          ที่การ์ดของส่วนเสริมในหน้า {setup.page} — คีย์ยังใช้ได้ตามปกติระหว่างนี้ แต่จะยังลดเสียงร้องไม่ได้
        </p>
      )}

      {(status === "missing" || status === "outdated") && (
        <>
          {status === "missing" && <p className="dialog-text">
            {place === "device"
              ? "เสียงเพลงอยู่ในตัวเล่นของ YouTube เว็บแตะไม่ได้โดยตรง ติดตั้งส่วนเสริมครั้งเดียวบนเครื่องนี้ แล้วคีย์ที่ห้องตั้งไว้จะเปลี่ยนเสียงในจอของคุณทันที (แต่ละคนติดตั้งของตัวเอง)"
              : "เสียงเพลงอยู่ในตัวเล่นของ YouTube เว็บแตะไม่ได้โดยตรง ติดตั้งส่วนเสริมของเราครั้งเดียวบนเครื่องนี้ แล้วปุ่มคีย์บนมือถือทุกเครื่องจะเปลี่ยนเสียงเพลงได้ทันที"}
          </p>}
          {HELPER_STORE_URL ? (
            <a className="btn btn-honey btn-block" href={HELPER_STORE_URL} target="_blank" rel="noopener noreferrer">
              <Download size={18} aria-hidden="true" /> ติดตั้งส่วนเสริม (คลิกเดียว)
            </a>
          ) : (
            <>
              <a className="btn btn-honey btn-block" href={HELPER_ZIP_URL} download>
                <Download size={18} aria-hidden="true" /> {status === "outdated" ? "ดาวน์โหลดรุ่นใหม่ (.zip)" : "ดาวน์โหลดส่วนเสริม (.zip)"}
              </a>
              <ol className="helper-steps">
                {browser !== "firefox" && <li>ดับเบิลคลิกไฟล์ที่โหลดมา ให้แตกเป็นโฟลเดอร์ kuma-karaoke-key</li>}
                <li>
                  เปิดหน้า <code>{setup.page}</code>
                  <button type="button" className="text-btn" onClick={copyExtensionsPage}>
                    {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied ? "คัดลอกแล้ว" : "คัดลอกที่อยู่"}
                  </button>
                  ใน {setup.name}
                </li>
                {setup.steps.map((step) => <li key={step}>{step}</li>)}
              </ol>
              {setup.note && <p className="helper-caveat">{setup.note}</p>}
            </>
          )}
          <button type="button" className="btn btn-secondary btn-block" onClick={() => window.location.reload()}>
            <RefreshCw size={16} aria-hidden="true" /> {status === "outdated" ? "อัปเดตแล้ว รีเฟรชหน้า" : "ติดตั้งแล้ว รีเฟรชหน้า"}
          </button>
        </>
      )}

      <button type="button" className="text-btn dialog-skip" onClick={onClose}>
        {status === "ready" ? "เริ่มร้องเลย" : "ข้ามไปก่อน ใช้ห้องได้ตามปกติ"}
      </button>
    </Dialog>
  );
}

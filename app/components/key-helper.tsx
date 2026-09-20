"use client";

import { Check, Copy, Download, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { HELPER_PROBE_URL, HELPER_STORE_URL, HELPER_ZIP_URL, type HelperStatus } from "../../lib/karaoke-key";
import { Art, Dialog } from "./ui";

const EXTENSIONS_PAGE = "chrome://extensions";

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
  unsupported: {
    text: "จอนี้เปลี่ยนคีย์ไม่ได้ ต้องใช้ Chrome หรือ Edge บนคอมพิวเตอร์",
    device: "เครื่องนี้ติดตั้งส่วนเสริมไม่ได้ จะได้ยินคีย์ต้นฉบับ (ใช้ Chrome หรือ Edge บนคอมถึงจะเปลี่ยนได้)",
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
export function KaraokeSetupDialog({ status, onClose, place = "stage" }: {
  status: HelperStatus;
  onClose: () => void;
  place?: HelperPlace;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timeoutId = window.setTimeout(() => setCopied(false), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [copied]);

  async function copyExtensionsPage() {
    try {
      await navigator.clipboard.writeText(EXTENSIONS_PAGE);
      setCopied(true);
    } catch {
      // The address is on screen anyway.
    }
  }

  return (
    <Dialog labelledBy="karaoke-setup-title" onClose={onClose}>
      <Art name="karaokeKey" className="dialog-bear dialog-bear-mark" sizes="128px" />
      <h2 id="karaoke-setup-title" className="dialog-title">
        {status === "ready" ? "พร้อมร้องแล้ว!" : "อีกขั้นเดียว ให้ปุ่มคีย์เปลี่ยนเสียงจริง"}
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
              ? "ถ้าอยากได้ยินคีย์ใหม่ด้วย ให้เปิดห้องนี้บนคอมพิวเตอร์ด้วย Chrome หรือ Edge แล้วติดตั้งส่วนเสริม คนอื่นในห้องที่ติดตั้งแล้วจะได้ยินคีย์ที่เปลี่ยนตามปกติ"
              : "ถ้าอยากให้เสียงเปลี่ยนคีย์จริง ให้เปิดห้องนี้บนคอมพิวเตอร์ที่ต่อกับทีวี แล้วใช้ Chrome หรือ Edge"}
          </p>
        </>
      )}

      {status === "missing" && (
        <>
          <p className="dialog-text">
            {place === "device"
              ? "เสียงเพลงอยู่ในตัวเล่นของ YouTube เว็บแตะไม่ได้โดยตรง ติดตั้งส่วนเสริมครั้งเดียวบนเครื่องนี้ แล้วคีย์ที่ห้องตั้งไว้จะเปลี่ยนเสียงในจอของคุณทันที (แต่ละคนติดตั้งของตัวเอง)"
              : "เสียงเพลงอยู่ในตัวเล่นของ YouTube เว็บแตะไม่ได้โดยตรง ติดตั้งส่วนเสริมของเราครั้งเดียวบนเครื่องนี้ แล้วปุ่มคีย์บนมือถือทุกเครื่องจะเปลี่ยนเสียงเพลงได้ทันที"}
          </p>
          {HELPER_STORE_URL ? (
            <a className="btn btn-honey btn-block" href={HELPER_STORE_URL} target="_blank" rel="noopener noreferrer">
              <Download size={18} aria-hidden="true" /> ติดตั้งส่วนเสริม (คลิกเดียว)
            </a>
          ) : (
            <>
              <a className="btn btn-honey btn-block" href={HELPER_ZIP_URL} download>
                <Download size={18} aria-hidden="true" /> ดาวน์โหลดส่วนเสริม (.zip)
              </a>
              <ol className="helper-steps">
                <li>ดับเบิลคลิกไฟล์ที่โหลดมา ให้แตกเป็นโฟลเดอร์ kuma-karaoke-key</li>
                <li>
                  เปิดหน้า <code>{EXTENSIONS_PAGE}</code>
                  <button type="button" className="text-btn" onClick={copyExtensionsPage}>
                    {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />} {copied ? "คัดลอกแล้ว" : "คัดลอกที่อยู่"}
                  </button>
                  แล้วเปิด Developer mode ที่มุมขวาบน
                </li>
                <li>กด Load unpacked แล้วเลือกโฟลเดอร์ที่แตกไว้</li>
              </ol>
            </>
          )}
          <button type="button" className="btn btn-secondary btn-block" onClick={() => window.location.reload()}>
            <RefreshCw size={16} aria-hidden="true" /> ติดตั้งแล้ว รีเฟรชหน้า
          </button>
        </>
      )}

      <button type="button" className="text-btn dialog-skip" onClick={onClose}>
        {status === "ready" ? "เริ่มร้องเลย" : "ข้ามไปก่อน ใช้ห้องได้ตามปกติ"}
      </button>
    </Dialog>
  );
}

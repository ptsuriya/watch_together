"use client";

import { Check, Copy, Download, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { HELPER_PROBE_URL, HELPER_STORE_URL, HELPER_ZIP_URL, type HelperStatus } from "../../lib/karaoke-key";
import { Art } from "./ui";

const EXTENSIONS_PAGE = "chrome://extensions";

/** A hidden YouTube embed, loaded only so the extension can announce itself before the first song plays. */
export function KeyHelperProbe({ active }: { active: boolean }) {
  if (!active) return null;
  return <iframe src={HELPER_PROBE_URL} title="ตรวจส่วนเสริมเปลี่ยนคีย์" className="key-probe" tabIndex={-1} aria-hidden="true" />;
}

export function KeyHelperCard({ status }: { status: HelperStatus }) {
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

  if (status === "ready") {
    return (
      <p className="helper-note is-ok">
        <Check size={16} aria-hidden="true" /> ส่วนเสริมเปลี่ยนคีย์พร้อมแล้ว กดคีย์จากมือถือได้เลย
      </p>
    );
  }

  if (status === "checking") {
    return <p className="helper-note"><span className="spinner" aria-hidden="true" /> กำลังตรวจส่วนเสริมเปลี่ยนคีย์…</p>;
  }

  if (status === "blocked") {
    return <p className="helper-note is-error">คลิกที่หน้านี้หนึ่งครั้งเพื่อปลดล็อกเสียง แล้วลองกดคีย์ใหม่</p>;
  }

  if (status === "unsupported") {
    return (
      <p className="helper-note is-error">
        เปลี่ยนคีย์ได้เมื่อจอกลางเป็น Chrome หรือ Edge บนคอมพิวเตอร์ ตอนนี้ปุ่มคีย์จะเปลี่ยนแค่ตัวเลขบนจอ
      </p>
    );
  }

  return (
    <div className="helper-install">
      <Art name="karaokeKey" className="helper-icon" sizes="64px" />
      <strong>ติดตั้งส่วนเสริมเปลี่ยนคีย์ (ทำครั้งเดียว)</strong>
      <p>เครื่องนี้เป็นจอกลาง ต้องมีส่วนเสริมเพื่อให้ปุ่มคีย์บนมือถือเปลี่ยนเสียงเพลงได้จริง</p>
      {HELPER_STORE_URL ? (
        <a className="btn btn-honey btn-block" href={HELPER_STORE_URL} target="_blank" rel="noopener noreferrer">
          <Download size={18} aria-hidden="true" /> ติดตั้งจาก Chrome Web Store
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
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.location.reload()}>
        <RefreshCw size={16} aria-hidden="true" /> ติดตั้งแล้ว รีเฟรชหน้า
      </button>
    </div>
  );
}

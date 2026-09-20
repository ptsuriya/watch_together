"use client";

import { Camera } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Dialog } from "./ui";

/** Chrome and Edge decode QR in the browser itself; elsewhere a small decoder is fetched on demand. */
type BarcodeReader = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => BarcodeReader;
  }
}

const SCAN_INTERVAL_MS = 220;

async function makeDecoder(): Promise<(video: HTMLVideoElement) => Promise<string | null>> {
  if (window.BarcodeDetector) {
    const reader = new window.BarcodeDetector({ formats: ["qr_code"] });
    return async (video) => (await reader.detect(video))[0]?.rawValue ?? null;
  }
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  return async (video) => {
    if (!context || !video.videoWidth) return null;
    // Quarter resolution is plenty for a QR code and keeps the loop cheap on a phone.
    canvas.width = Math.round(video.videoWidth / 2);
    canvas.height = Math.round(video.videoHeight / 2);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" })?.data ?? null;
  };
}

export function QrScanDialog({ onResult, onClose }: { onResult: (value: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onResultRef = useRef(onResult);
  const [error, setError] = useState("");

  useEffect(() => {
    onResultRef.current = onResult;
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;

    async function run() {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
        const video = videoRef.current;
        if (stopped || !video) return;
        video.srcObject = stream;
        await video.play();
        const decode = await makeDecoder();
        const tick = async () => {
          if (stopped) return;
          let value: string | null = null;
          try {
            value = await decode(video);
          } catch {
            // A frame that cannot be read is not worth stopping for.
          }
          if (value) {
            onResultRef.current(value);
            return;
          }
          timer = window.setTimeout(tick, SCAN_INTERVAL_MS);
        };
        void tick();
      } catch {
        if (!stopped) setError("เปิดกล้องไม่ได้ ตรวจว่าอนุญาตกล้องให้เว็บนี้แล้ว หรือใช้แอปกล้องสแกน QR แทนก็ได้");
      }
    }

    void run();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <Dialog labelledBy="scan-title" onClose={onClose}>
      <h2 id="scan-title" className="dialog-title">สแกน QR ของห้อง</h2>
      <p className="dialog-text">หันกล้องไปที่ QR บนจอกลาง ระบบจะพาเข้าห้องให้เอง</p>
      <div className="scan-frame">
        <video ref={videoRef} playsInline muted aria-label="ภาพจากกล้อง" />
        <span className="scan-target" aria-hidden="true" />
      </div>
      {error && <p className="form-note is-error">{error}</p>}
      <p className="dialog-text scan-hint"><Camera size={15} aria-hidden="true" /> ภาพจากกล้องอยู่ในเครื่องคุณเท่านั้น ไม่ได้ส่งไปไหน</p>
    </Dialog>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { thumbnailUrl } from "../../lib/room-state";
import type { Toast } from "./room-model";

export const APP_NAME = "KUMA Listening Party";

export function Brand({ onClick }: { onClick?: () => void }) {
  const content = (
    <>
      <Image src="/brand/kuma-party-mark.png" alt="" width={96} height={96} className="brand-mark" priority />
      <span className="brand-name">
        <strong>KUMA</strong>
        <small>Listening Party</small>
      </span>
    </>
  );
  if (onClick) {
    return <button type="button" className="brand" onClick={onClick} aria-label={`${APP_NAME} กลับหน้าแรก`}>{content}</button>;
  }
  return <Link className="brand" href="/" aria-label={`${APP_NAME} หน้าแรก`}>{content}</Link>;
}

// KUMA bear illustrations and sticker snacks shared with kumadesign.dev.
const ART = {
  waving: { src: "/illustrations/hero-bear.webp", width: 741, height: 900 },
  hello: { src: "/illustrations/page-about.webp", width: 900, height: 888 },
  sleeping: { src: "/illustrations/footer-sleeping.webp", width: 900, height: 599 },
  laptop: { src: "/illustrations/page-work.webp", width: 747, height: 900 },
  phone: { src: "/illustrations/page-contact.webp", width: 762, height: 900 },
  party: { src: "/illustrations/process-4-launch.webp", width: 853, height: 900 },
  envelope: { src: "/illustrations/cta-envelope.webp", width: 766, height: 900 },
  board: { src: "/illustrations/page-services.webp", width: 677, height: 900 },
  clipboard: { src: "/illustrations/process-1-brief.webp", width: 900, height: 870 },
  notebook: { src: "/illustrations/process-2-design.webp", width: 865, height: 900 },
  boba: { src: "/stickers/boba.png", width: 500, height: 500 },
  star: { src: "/stickers/star.png", width: 500, height: 500 },
  heart: { src: "/stickers/heart.png", width: 500, height: 500 },
  pudding: { src: "/stickers/pudding.png", width: 500, height: 500 },
} as const;

export type ArtName = keyof typeof ART;

/** A decorative bear or sticker; hidden from screen readers. */
export function Art({ name, className, sizes = "200px", priority = false }: {
  name: ArtName;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  const art = ART[name];
  return <Image src={art.src} alt="" width={art.width} height={art.height} sizes={sizes} className={className} priority={priority} />;
}

/** Empty-state message with a small bear beside it. */
export function EmptyNote({ art, children }: { art?: ArtName; children: ReactNode }) {
  return (
    <div className={`empty-note${art ? " has-art" : ""}`}>
      {art && <Art name={art} className="empty-art" sizes="72px" />}
      <p>{children}</p>
    </div>
  );
}

export function VideoThumb({ videoId, className = "thumb" }: { videoId: string; className?: string }) {
  return <Image className={className} src={thumbnailUrl(videoId)} alt="" width={320} height={180} unoptimized />;
}

export function Avatar({ name, tone = "honey" }: { name: string; tone?: "honey" | "gold" | "sand" }) {
  // Thai leading vowels are written before the consonant they follow in speech; the consonant reads better alone.
  const letter = Array.from(name.trim()).find((char) => !/[เแโใไ]/.test(char))?.toUpperCase() ?? "?";
  return <span className={`avatar avatar-${tone}`} aria-hidden="true">{letter}</span>;
}

export function Dialog({
  labelledBy,
  onClose,
  className = "",
  children,
}: {
  labelledBy: string;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Closing always goes through the parent, which unmounts the dialog. The native "close" event is not used: it fires
  // after a delay, so a StrictMode remount would receive the close from the first mount.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className={`dialog ${className}`}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onCloseRef.current();
      }}
      onMouseDown={(event) => {
        // A press on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) onCloseRef.current();
      }}
    >
      <div className="dialog-body">
        {children}
        {/* Last in the DOM so opening the dialog focuses its first field, not the close button. */}
        <button type="button" className="icon-btn dialog-close" onClick={() => onCloseRef.current()} aria-label="ปิด">
          <X size={18} aria-hidden="true" />
        </button>
      </div>
    </dialog>
  );
}

export function ToastStack({ toasts, placement }: { toasts: Toast[]; placement: "stage" | "corner" | "bottom" }) {
  return (
    <div className={`toast-stack toast-${placement}`} role="status" aria-live="polite">
      {toasts.map((toast) => <p key={toast.id} className="toast">{toast.text}</p>)}
    </div>
  );
}

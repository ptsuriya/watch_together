"use client";

import { useEffect, useState } from "react";

/**
 * Talks to the KUMA Karaoke Key browser extension (see /extension). The extension runs inside the YouTube embed,
 * because only code in that frame can reach the video's audio, and shifts its pitch when the room asks.
 */
export const EMBED_ORIGIN = "https://www.youtube-nocookie.com";
export const HELPER_ZIP_URL = "/kuma-karaoke-key.zip";
/** Set once the extension is on the Chrome Web Store; the install button then becomes one click. */
export const HELPER_STORE_URL = process.env.NEXT_PUBLIC_KARAOKE_EXTENSION_URL || "";
/** A bare embed page, loaded hidden only to find out whether the extension is installed before any song plays. */
export const HELPER_PROBE_URL = `${EMBED_ORIGIN}/embed/?controls=0&autoplay=0`;

const ROOM_SOURCE = "kuma-listening-party";
const HELPER_SOURCE = "kuma-karaoke-key";
const DETECT_TIMEOUT_MS = 6000;

export type HelperMessage = {
  type: "ready" | "status" | "error" | "probe";
  version?: string;
  semitones?: number;
  processing?: boolean;
  message?: string;
};

export function readHelperMessage(event: MessageEvent): HelperMessage | null {
  if (event.origin !== EMBED_ORIGIN) return null;
  const data: unknown = event.data;
  if (!data || typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  if (record.source !== HELPER_SOURCE || typeof record.type !== "string") return null;
  return record as HelperMessage;
}

export function sendToHelper(
  frame: HTMLIFrameElement | null | undefined,
  message: { type: "hello" } | { type: "key"; semitones: number } | { type: "vocals"; amount: number },
) {
  frame?.contentWindow?.postMessage({ source: ROOM_SOURCE, ...message }, EMBED_ORIGIN);
}

export type HelperStatus = "checking" | "ready" | "missing" | "unsupported" | "blocked" | "outdated";

/**
 * The version the room needs. An extension loaded from a folder never updates itself — only a store can do that —
 * so the room watches the version it hears and asks the person to load the new zip over it.
 */
export const HELPER_MIN_VERSION = "1.2.0";

function olderThan(version: string, want: string) {
  const left = version.split(".").map(Number);
  const right = want.split(".").map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    if (!Number.isFinite(a)) return true;
    if (a !== b) return a < b;
  }
  return false;
}

/** Which browser this is, as far as the install steps care. "other" cannot load the extension at all. */
export type HelperBrowser = "chrome" | "edge" | "opera" | "firefox" | "other";

export function helperBrowser(): HelperBrowser {
  if (typeof navigator === "undefined") return "other";
  const agent = navigator.userAgent;
  // A phone, a tablet or a TV cannot install an extension whatever engine it runs.
  if (/Mobile|Android|CriOS|EdgiOS|FxiOS|iPhone|iPad|iPod|SMART-TV|Tizen|Web0S/i.test(agent)) return "other";
  if (/OPR\/|Opera/.test(agent)) return "opera";
  if (/Edg\//.test(agent)) return "edge";
  if (/Firefox\//.test(agent)) return "firefox";
  // Brave and Vivaldi say Chrome and take Chrome's steps.
  if (/Chrome\//.test(agent)) return "chrome";
  return "other";
}

function canInstallHelper() {
  return helperBrowser() !== "other";
}

/** Whether the extension answers from any YouTube embed on this page. */
export function useKeyHelperStatus(enabled: boolean) {
  const [answered, setAnswered] = useState<"ready" | "blocked" | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [supported, setSupported] = useState(true);
  const [version, setVersion] = useState("");

  useEffect(() => {
    if (!enabled) return;
    const handleMessage = (event: MessageEvent) => {
      const message = readHelperMessage(event);
      if (!message) return;
      if (typeof message.version === "string") setVersion(message.version);
      if (message.type === "error" && message.message === "audio-blocked") setAnswered("blocked");
      else setAnswered("ready");
    };
    window.addEventListener("message", handleMessage);
    const supportId = window.setTimeout(() => setSupported(canInstallHelper()), 0);
    const timeoutId = window.setTimeout(() => setTimedOut(true), DETECT_TIMEOUT_MS);
    return () => {
      window.removeEventListener("message", handleMessage);
      window.clearTimeout(supportId);
      window.clearTimeout(timeoutId);
    };
  }, [enabled]);

  let status: HelperStatus;
  if (answered === "ready" && version && olderThan(version, HELPER_MIN_VERSION)) status = "outdated";
  else if (answered) status = answered;
  else if (!supported) status = "unsupported";
  else status = timedOut ? "missing" : "checking";
  return { status, version };
}

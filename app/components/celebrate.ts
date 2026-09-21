"use client";

import confetti from "canvas-confetti";

/** Honey, gold, amber, terracotta and leaf: the KUMA palette, so the paper matches the page. */
const HONEY = ["#EEC65D", "#FFF0CC", "#C07B2A", "#C86858", "#7AA36F"];

/**
 * A little paper for the room's good moments. canvas-confetti draws on its own full-screen canvas and skips itself for
 * anyone who asked their system for less motion.
 */
export function celebrate(kind: "pop" | "cheer" | "champion", origin?: { x: number; y: number }) {
  if (typeof window === "undefined") return;
  const base = { colors: HONEY, disableForReducedMotion: true, zIndex: 60 };
  if (kind === "pop") {
    void confetti({ ...base, particleCount: 36, spread: 60, startVelocity: 26, scalar: 0.8, origin: origin ?? { x: 0.5, y: 0.6 } });
    return;
  }
  if (kind === "cheer") {
    void confetti({ ...base, particleCount: 90, spread: 80, startVelocity: 38, origin: origin ?? { x: 0.5, y: 0.55 } });
    return;
  }
  // A champion gets it from both sides, twice.
  const fire = (x: number, angle: number) =>
    void confetti({ ...base, particleCount: 110, angle, spread: 70, startVelocity: 55, origin: { x, y: 0.7 } });
  fire(0.1, 60);
  fire(0.9, 120);
  window.setTimeout(() => {
    fire(0.2, 70);
    fire(0.8, 110);
  }, 450);
}

/** Where on the screen an element is, as the fractions canvas-confetti wants. */
export function originOf(element: Element | null) {
  if (!element) return undefined;
  const rect = element.getBoundingClientRect();
  return { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight };
}

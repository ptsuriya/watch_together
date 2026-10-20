"use client";

/**
 * Little sounds for the room's tools, made on the spot with Web Audio so there is nothing to download.
 *
 * Browsers keep audio locked until the person has touched the page, and a context made later, by a state change from
 * the host, would stay silent. So one context is made and unlocked on this screen's first tap or key press, and every
 * sound after that plays through it.
 */
let context: AudioContext | null = null;

function makeContext() {
  if (context) return context;
  const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    context = new AudioCtx();
  } catch {
    return null;
  }
  return context;
}

function unlock() {
  const audio = makeContext();
  if (audio?.state === "suspended") void audio.resume();
}

if (typeof window !== "undefined") {
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

function ready() {
  const audio = makeContext();
  if (!audio) return null;
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

function tone(audio: AudioContext, at: number, frequency: number, length: number, volume: number, type: OscillatorType = "sine") {
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(at);
  oscillator.stop(at + length + 0.02);
}

/**
 * The clicks of a wheel slowing down: one each time a slice passes the pointer. The disc eases out roughly like
 * 1 − (1 − t)³, so the moment it has turned a given share of the way is 1 − ∛(1 − share).
 */
export function playSpinTicks(degrees: number, slice: number, ms: number) {
  try {
    const audio = ready();
    if (!audio || degrees <= 0 || slice <= 0) return;
    const start = audio.currentTime + 0.03;
    let last = -1;
    for (let passed = slice; passed < degrees; passed += slice) {
      const at = (1 - Math.cbrt(1 - passed / degrees)) * (ms / 1000);
      // Faster than this and the clicks smear into a buzz.
      if (at - last < 0.045) continue;
      last = at;
      tone(audio, start + at, 1400, 0.03, 0.12, "triangle");
    }
  } catch {
    // No sound on this screen.
  }
}

/** A rising three-note chime when the wheel lands. */
export function playChime() {
  try {
    const audio = ready();
    if (!audio) return;
    const start = audio.currentTime + 0.02;
    [523.25, 659.25, 783.99].forEach((frequency, step) => tone(audio, start + step * 0.11, frequency, 0.5, 0.22));
  } catch {
    // No sound on this screen.
  }
}

/** The countdown ran out: three bursts of an alarm, loud enough to hear over the video. */
export function playAlarm() {
  try {
    const audio = ready();
    if (!audio) return;
    const start = audio.currentTime + 0.02;
    for (let burst = 0; burst < 3; burst += 1) {
      for (let beep = 0; beep < 4; beep += 1) {
        tone(audio, start + burst * 0.9 + beep * 0.13, 988, 0.09, 0.35, "square");
      }
    }
  } catch {
    // No sound on this screen; the clock still says it.
  }
}

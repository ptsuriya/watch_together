"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * Sends karaoke key changes to a virtual MIDI port (IAC Driver on macOS, loopMIDI on Windows). The Transpose browser
 * extension has no API for web pages, but it can learn MIDI buttons, so it listens on the same port and maps these
 * notes to its Transpose −/+ actions.
 */
export const KEY_DOWN_NOTE = 60; // C4
export const KEY_UP_NOTE = 62; // D4

const STEP_GAP_MS = 90;
const NOTE_LENGTH_MS = 40;
const SAVED_PORT_KEY = "sidewave-midi-port";
const VIRTUAL_PORT = /iac|loopmidi|virtual|bus/i;

export type MidiPort = { id: string; name: string };
export type MidiStatus = "unsupported" | "idle" | "requesting" | "denied" | "no-port" | "ready";

const subscribeNever = () => () => undefined;
const hasWebMidi = () => typeof navigator.requestMIDIAccess === "function";

function readSavedPort() {
  try {
    return window.localStorage.getItem(SAVED_PORT_KEY);
  } catch {
    return null;
  }
}

function listOutputs(access: MIDIAccess): MidiPort[] {
  return Array.from(access.outputs.values(), (output) => ({ id: output.id, name: output.name || output.id }));
}

function pickPort(ports: MidiPort[], current: string | null) {
  if (current && ports.some((port) => port.id === current)) return current;
  const saved = readSavedPort();
  return (ports.find((port) => port.name === saved) ?? ports.find((port) => VIRTUAL_PORT.test(port.name)) ?? ports[0])?.id ?? null;
}

export function useMidiBridge() {
  const supported = useSyncExternalStore(subscribeNever, hasWebMidi, () => false);
  const [access, setAccess] = useState<MIDIAccess | null>(null);
  const [request, setRequest] = useState<"idle" | "requesting" | "denied">("idle");
  const [ports, setPorts] = useState<MidiPort[]>([]);
  const [portId, setPortId] = useState<string | null>(null);
  const outputRef = useRef<MIDIOutput | null>(null);

  const refreshPorts = useCallback((midi: MIDIAccess) => {
    const next = listOutputs(midi);
    setPorts(next);
    setPortId((current) => pickPort(next, current));
  }, []);

  const connect = useCallback(async () => {
    setRequest("requesting");
    try {
      const midi = await navigator.requestMIDIAccess({ sysex: false });
      refreshPorts(midi);
      setAccess(midi);
      setRequest("idle");
    } catch {
      setRequest("denied");
    }
  }, [refreshPorts]);

  useEffect(() => {
    if (!access) return;
    const handleChange = () => refreshPorts(access);
    access.addEventListener("statechange", handleChange);
    return () => access.removeEventListener("statechange", handleChange);
  }, [access, refreshPorts]);

  useEffect(() => {
    outputRef.current = (portId && access?.outputs.get(portId)) || null;
  }, [access, portId, ports]);

  const selectPort = useCallback((id: string) => {
    setPortId(id);
    const name = ports.find((port) => port.id === id)?.name;
    try {
      if (name) window.localStorage.setItem(SAVED_PORT_KEY, name);
    } catch {
      // Remembering the port is a convenience only.
    }
  }, [ports]);

  /** Sends one Transpose step per semitone, spaced out so none is dropped. Returns false when no port is ready. */
  const sendSteps = useCallback((steps: number) => {
    const output = outputRef.current;
    if (!output || steps === 0) return false;
    const note = steps > 0 ? KEY_UP_NOTE : KEY_DOWN_NOTE;
    const start = performance.now();
    for (let step = 0; step < Math.abs(steps); step += 1) {
      const at = start + step * STEP_GAP_MS;
      output.send([0x90, note, 100], at);
      output.send([0x80, note, 0], at + NOTE_LENGTH_MS);
    }
    return true;
  }, []);

  let status: MidiStatus;
  if (!supported) status = "unsupported";
  else if (!access) status = request;
  else status = portId ? "ready" : "no-port";

  return { status, ports, portId, selectPort, connect, sendSteps };
}

export type MidiBridge = ReturnType<typeof useMidiBridge>;

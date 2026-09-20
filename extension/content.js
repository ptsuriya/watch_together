// KUMA Karaoke Key: runs inside the YouTube embed on a KUMA Listening Party host screen and shifts the pitch of the
// video's audio when the room asks for a different key. The room page talks to it with window.postMessage.
//
//   room -> embed: { source: "kuma-listening-party", type: "hello" }
//   room -> embed: { source: "kuma-listening-party", type: "key", semitones: -12..12 }
//   room -> embed: { source: "kuma-listening-party", type: "probe" }   (measures the output level, for diagnostics)
//   embed -> room: { source: "kuma-karaoke-key", type: "ready" | "status" | "error" | "probe", ... }
//
// The audio only goes through Web Audio once a key other than 0 is asked for; until then YouTube plays it untouched.
(() => {
  if (window === window.top) return;

  const ROOM = "kuma-listening-party";
  const EXTENSION = "kuma-karaoke-key";
  const VERSION = chrome.runtime.getManifest().version;
  const KEY_RANGE = 12;
  const RESUME_TIMEOUT_MS = 1500;

  let semitones = 0;
  let context = null;
  let source = null;
  let sourceElement = null;
  let stretchRequest = null;
  let stretch = null;
  let meter = null;

  function post(type, extra = {}) {
    // The payload carries nothing private, and the room checks that it comes from the YouTube embed origin.
    window.parent.postMessage({ source: EXTENSION, type, version: VERSION, ...extra }, "*");
  }

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function ensureAudioGraph() {
    const video = document.querySelector("video");
    if (!video) throw new Error("no-video");

    context ??= new AudioContext({ latencyHint: "interactive" });
    if (context.state !== "running") await Promise.race([context.resume(), wait(RESUME_TIMEOUT_MS)]);
    // Routing a playing video into a context that cannot start would silence it, so stop here instead.
    if (context.state !== "running") throw new Error("audio-blocked");

    if (!meter) {
      meter = context.createAnalyser();
      meter.fftSize = 8192;
    }

    if (sourceElement !== video) {
      source?.disconnect();
      source = context.createMediaElementSource(video);
      sourceElement = video;
    }

    if (!stretch) {
      stretchRequest ??= (async () => {
        // Load the AudioWorklet from the extension package rather than a blob: URL, which YouTube's CSP may refuse.
        SignalsmithStretch.moduleUrl = chrome.runtime.getURL("vendor/signalsmith-stretch.js");
        const node = await SignalsmithStretch(context);
        await node.configure({ blockMs: 70 });
        await node.start();
        return node;
      })();
      stretch = await stretchRequest;
    }
  }

  function route() {
    source.disconnect();
    stretch.disconnect();
    // Straight through while the song is in its original key: no processing delay.
    const output = semitones === 0 ? source : stretch;
    if (semitones !== 0) {
      stretch.schedule({ active: true, semitones });
      source.connect(stretch);
    }
    output.connect(context.destination);
    output.connect(meter);
  }

  async function probe() {
    if (!meter) return post("probe", { rms: null });
    const samples = new Float32Array(meter.fftSize);
    const spectrum = new Float32Array(meter.frequencyBinCount);
    let rms = 0;
    for (let i = 0; i < 6; i += 1) {
      meter.getFloatTimeDomainData(samples);
      rms = Math.max(rms, Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length));
      await wait(50);
    }
    meter.getFloatFrequencyData(spectrum);
    let loudest = 0;
    for (let bin = 1; bin < spectrum.length; bin += 1) if (spectrum[bin] > spectrum[loudest]) loudest = bin;
    const peakHz = Math.round((loudest * context.sampleRate) / meter.fftSize);
    post("probe", { rms, peakHz, semitones, contextState: context.state });
  }

  async function setKey(value) {
    semitones = Math.max(-KEY_RANGE, Math.min(KEY_RANGE, Math.round(value)));
    if (semitones === 0 && !source) {
      post("status", { semitones, processing: false });
      return;
    }
    try {
      await ensureAudioGraph();
      route();
      const latency = semitones === 0 ? 0 : await stretch.latency();
      post("status", { semitones, processing: semitones !== 0, latencyMs: Math.round(latency * 1000) });
    } catch (error) {
      post("error", { semitones, message: error instanceof Error ? error.message : String(error) });
    }
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== "object" || data.source !== ROOM) return;
    if (data.type === "hello") post("ready");
    else if (data.type === "key" && Number.isFinite(data.semitones)) void setKey(data.semitones);
    else if (data.type === "probe") void probe();
  });

  post("ready");
})();

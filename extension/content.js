// KUMA Karaoke Key: runs inside the YouTube embed on a KUMA Listening Party host screen and shifts the pitch of the
// video's audio when the room asks for a different key. The room page talks to it with window.postMessage.
//
//   room -> embed: { source: "kuma-listening-party", type: "hello" }
//   room -> embed: { source: "kuma-listening-party", type: "key", semitones: -12..12 }
//   room -> embed: { source: "kuma-listening-party", type: "vocals", amount: 0..1 }   (centre-channel removal)
//   room -> embed: { source: "kuma-listening-party", type: "probe" }   (measures the output level, for diagnostics)
//   embed -> room: { source: "kuma-karaoke-key", type: "ready" | "status" | "error" | "probe", ... }
//
// Vocal removal is the old karaoke trick: most singers are mixed dead centre, so L−R cancels them — along with
// anything else in the middle, which is why the room can ask for half of it instead of all of it.
//
// The audio only goes through Web Audio once a key or a vocal cut is asked for; until then YouTube plays it untouched,
// and YouTube's own ads always play untouched: the pitch shift steps aside while an ad is on screen.
(() => {
  if (window === window.top) return;

  const ROOM = "kuma-listening-party";
  const EXTENSION = "kuma-karaoke-key";
  const VERSION = chrome.runtime.getManifest().version;
  const KEY_RANGE = 12;
  const RESUME_TIMEOUT_MS = 1500;

  let semitones = 0;
  /** 0 keeps the mix as it is, 1 subtracts the whole centre channel, and anything between mixes the two. */
  let vocalCut = 0;
  let context = null;
  let source = null;
  let sourceElement = null;
  let stretchRequest = null;
  let stretch = null;
  let meter = null;
  let killer = null;
  let adPlaying = false;
  let adObserver = null;

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

    if (!killer) killer = buildKiller();

    if (sourceElement !== video) {
      source?.disconnect();
      source = context.createMediaElementSource(video);
      sourceElement = video;
    }

    watchAds();

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

  /**
   * L−R in Web Audio: the left channel plus an inverted right channel, mixed back against the untouched sound so the
   * room can take half of it. The result is mono, which is what this trick costs.
   */
  function buildKiller() {
    const splitter = context.createChannelSplitter(2);
    const invert = context.createGain();
    invert.gain.value = -1;
    const side = context.createGain();
    // L − R is quieter than the mix it came from on most songs; bring it back up a little.
    side.gain.value = 1.4;
    const dry = context.createGain();
    const out = context.createGain();
    // Wired once and left alone; only what goes in and what comes out changes.
    splitter.connect(side, 0);
    splitter.connect(invert, 1);
    invert.connect(side);
    side.connect(out);
    dry.connect(out);
    return { splitter, dry, side, out };
  }

  /** YouTube marks its player while an ad plays; the ad must reach the speakers exactly as YouTube sent it. */
  function watchAds() {
    if (adObserver) return;
    const player = document.querySelector(".html5-video-player");
    if (!player) return;
    const update = () => {
      const showing = player.classList.contains("ad-showing") || player.classList.contains("ad-interrupting");
      if (showing === adPlaying) return;
      adPlaying = showing;
      if (source && killer) route();
    };
    adObserver = new MutationObserver(update);
    adObserver.observe(player, { attributes: true, attributeFilter: ["class"] });
    update();
  }

  function route() {
    source.disconnect();
    stretch?.disconnect();
    killer.out.disconnect();

    // Straight through while the song is in its original key with every voice in it, or while an ad is playing.
    const shifted = semitones !== 0 && !adPlaying;
    const cutting = vocalCut > 0 && !adPlaying;
    let node = source;
    if (cutting) {
      killer.dry.gain.value = 1 - vocalCut;
      killer.side.gain.value = 1.4 * vocalCut;
      source.connect(killer.splitter);
      source.connect(killer.dry);
      node = killer.out;
    }
    if (shifted) {
      stretch.schedule({ active: true, semitones });
      node.connect(stretch);
      node = stretch;
    }
    node.connect(context.destination);
    node.connect(meter);
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

  async function apply() {
    // Nothing is asked of the audio yet and it has never been routed: leave YouTube's own path alone.
    if (semitones === 0 && vocalCut === 0 && !source) {
      post("status", { semitones, vocalCut, processing: false });
      return;
    }
    try {
      await ensureAudioGraph();
      route();
      const shifted = semitones !== 0 && !adPlaying;
      const latency = shifted ? await stretch.latency() : 0;
      post("status", {
        semitones, vocalCut, adPlaying,
        processing: shifted || (vocalCut > 0 && !adPlaying),
        latencyMs: Math.round(latency * 1000),
      });
    } catch (error) {
      post("error", { semitones, vocalCut, message: error instanceof Error ? error.message : String(error) });
    }
  }

  function setKey(value) {
    // Keys move in half semitones; the pitch shifter takes fractions happily.
    semitones = Math.max(-KEY_RANGE, Math.min(KEY_RANGE, Math.round(value * 2) / 2));
    return apply();
  }

  function setVocals(value) {
    vocalCut = Math.max(0, Math.min(1, Math.round(value * 100) / 100));
    return apply();
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== "object" || data.source !== ROOM) return;
    if (data.type === "hello") post("ready");
    else if (data.type === "key" && Number.isFinite(data.semitones)) void setKey(data.semitones);
    else if (data.type === "vocals" && Number.isFinite(data.amount)) void setVocals(data.amount);
    else if (data.type === "probe") void probe();
  });

  post("ready");
})();

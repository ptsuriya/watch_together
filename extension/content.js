// KUMA Karaoke Key: runs inside the YouTube embed on a KUMA Listening Party host screen and shifts the pitch of the
// video's audio when the room asks for a different key. The room page talks to it with window.postMessage.
//
//   room -> embed: { source: "kuma-listening-party", type: "hello" }
//   room -> embed: { source: "kuma-listening-party", type: "key", semitones: -12..12 }
//   room -> embed: { source: "kuma-listening-party", type: "vocals", amount: 0..1 }   (centre-channel removal)
//   room -> embed: { source: "kuma-listening-party", type: "eq", low, lowMid, mid, highMid, high: -8..8 }  (dB)
//   room -> embed: { source: "kuma-listening-party", type: "probe" }   (measures the output level, for diagnostics)
//   embed -> room: { source: "kuma-karaoke-key", type: "ready" | "status" | "error" | "probe", ... }
//
// Vocal removal is the old karaoke trick: most singers are mixed dead centre, so L−R cancels them — along with
// anything else in the middle, which is why the room can ask for half of it instead of all of it. Only the band a
// voice actually lives in is cancelled: under 180 Hz the untouched mix comes through, so the kick and the bass stay,
// and above 5.5 kHz it comes through too, so hats, cymbals and the crack of a clap stay. What a clap or a snare has
// inside the vocal band still goes with the voice — that part is the trick, not a bug. A five-band EQ sits at the
// end for whatever the room still wants to fix, and a limiter after everything, so a boosted band or a loud L−R never
// reaches the speakers as crackle.
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
  /** Voices rarely live below this; kick drums always do. */
  const LOW_CROSSOVER_HZ = 180;
  /** Above this it is hats, cymbals and the snap of a clap — and only the hiss of a voice. */
  const HIGH_CROSSOVER_HZ = 5500;
  const EQ_RANGE_DB = 8;
  /** Boost up to this much is left to the limiter; anything beyond it lowers the whole EQ by the difference. */
  const EQ_FREE_BOOST_DB = 4;
  /** Bass to air; a room on 1.2 sends only low, mid and high, and the other two stay flat. */
  const EQ_BANDS = [
    { key: "low", type: "lowshelf", hz: 90 },
    { key: "lowMid", type: "peaking", hz: 250, q: 1 },
    { key: "mid", type: "peaking", hz: 1000, q: 0.9 },
    { key: "highMid", type: "peaking", hz: 3000, q: 1 },
    { key: "high", type: "highshelf", hz: 8000 },
  ];

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
  let eq = null;
  let eqGains = { low: 0, lowMid: 0, mid: 0, highMid: 0, high: 0 };
  let limiter = null;
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
    if (!eq) eq = buildEq();
    if (!limiter) limiter = buildLimiter();

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
    // The cancellation is kept to the band a voice sings in.
    const sideHigh = context.createBiquadFilter();
    sideHigh.type = "highpass";
    sideHigh.frequency.value = LOW_CROSSOVER_HZ;
    const sideLow = context.createBiquadFilter();
    sideLow.type = "lowpass";
    sideLow.frequency.value = HIGH_CROSSOVER_HZ;
    // Everything outside that band comes back from the untouched mix: kick and bass below, hats and air above.
    const keep = context.createGain();
    const keepLow = context.createBiquadFilter();
    keepLow.type = "lowpass";
    keepLow.frequency.value = LOW_CROSSOVER_HZ;
    const keepHigh = context.createBiquadFilter();
    keepHigh.type = "highpass";
    keepHigh.frequency.value = HIGH_CROSSOVER_HZ;
    const dry = context.createGain();
    const out = context.createGain();
    // Wired once and left alone; only what goes in and what comes out changes.
    splitter.connect(side, 0);
    splitter.connect(invert, 1);
    invert.connect(side);
    side.connect(sideHigh);
    sideHigh.connect(sideLow);
    sideLow.connect(out);
    keep.connect(keepLow);
    keep.connect(keepHigh);
    keepLow.connect(out);
    keepHigh.connect(out);
    dry.connect(out);
    return { splitter, dry, side, keep, out };
  }

  /** Five plain bands at the end of the chain, so a thin karaoke mix can be pushed back into shape. */
  function buildEq() {
    const filters = {};
    // Past a few dB of boost the limiter alone would be working hard on every beat; the trim takes the rest back first.
    const trim = context.createGain();
    let previous = trim;
    for (const band of EQ_BANDS) {
      const filter = context.createBiquadFilter();
      filter.type = band.type;
      filter.frequency.value = band.hz;
      if (band.q) filter.Q.value = band.q;
      previous.connect(filter);
      filters[band.key] = filter;
      previous = filter;
    }
    return { trim, filters, input: trim, out: previous };
  }

  function applyEq() {
    if (!eq) return;
    for (const band of EQ_BANDS) eq.filters[band.key].gain.value = eqGains[band.key];
    const boost = Math.max(0, ...EQ_BANDS.map((band) => eqGains[band.key]));
    eq.trim.gain.value = 10 ** (-Math.max(0, boost - EQ_FREE_BOOST_DB) / 20);
  }

  function toning() {
    return EQ_BANDS.some((band) => eqGains[band.key] !== 0);
  }

  /**
   * A brick wall just under full scale. Anything the room adds — a bass shelf, the 1.4× lift on L−R — can push a
   * mastered song past 0 dBFS, and Web Audio clips that hard; this bends the peaks down instead. Quiet passages pass
   * through untouched.
   */
  function buildLimiter() {
    const node = context.createDynamicsCompressor();
    node.threshold.value = -1.5;
    node.knee.value = 0;
    node.ratio.value = 20;
    node.attack.value = 0.002;
    node.release.value = 0.15;
    return node;
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
    eq.out.disconnect();
    limiter.disconnect();

    // Straight through while the song is in its original key with every voice in it, or while an ad is playing.
    const shifted = semitones !== 0 && !adPlaying;
    const cutting = vocalCut > 0 && !adPlaying;
    const toned = !adPlaying && toning();
    let node = source;
    if (cutting) {
      killer.dry.gain.value = 1 - vocalCut;
      killer.side.gain.value = 1.4 * vocalCut;
      killer.keep.gain.value = vocalCut;
      source.connect(killer.splitter);
      source.connect(killer.keep);
      source.connect(killer.dry);
      node = killer.out;
    }
    if (shifted) {
      stretch.schedule({ active: true, semitones });
      node.connect(stretch);
      node = stretch;
    }
    if (toned) {
      applyEq();
      node.connect(eq.input);
      node = eq.out;
    }
    if (node !== source) {
      node.connect(limiter);
      node = limiter;
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
    const quiet = semitones === 0 && vocalCut === 0 && !toning();
    if (quiet && !source) {
      post("status", { semitones, vocalCut, eq: eqGains, processing: false });
      return;
    }
    try {
      await ensureAudioGraph();
      route();
      const shifted = semitones !== 0 && !adPlaying;
      const latency = shifted ? await stretch.latency() : 0;
      post("status", {
        semitones, vocalCut, adPlaying, eq: eqGains,
        processing: !adPlaying && (shifted || vocalCut > 0 || toning()),
        latencyMs: Math.round(latency * 1000),
      });
    } catch (error) {
      post("error", { semitones, vocalCut, eq: eqGains, message: error instanceof Error ? error.message : String(error) });
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

  function setEq(bands) {
    const band = (value) => Math.max(-EQ_RANGE_DB, Math.min(EQ_RANGE_DB, Number.isFinite(value) ? Math.round(value) : 0));
    eqGains = Object.fromEntries(EQ_BANDS.map(({ key }) => [key, band(bands[key])]));
    applyEq();
    return apply();
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || typeof data !== "object" || data.source !== ROOM) return;
    if (data.type === "hello") post("ready");
    else if (data.type === "key" && Number.isFinite(data.semitones)) void setKey(data.semitones);
    else if (data.type === "vocals" && Number.isFinite(data.amount)) void setVocals(data.amount);
    else if (data.type === "eq") void setEq(data);
    else if (data.type === "probe") void probe();
  });

  post("ready");
})();

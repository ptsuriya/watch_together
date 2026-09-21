// KUMA Karaoke Key: runs inside the YouTube embed on a KUMA Listening Party host screen and shifts the pitch of the
// video's audio when the room asks for a different key. The room page talks to it with window.postMessage.
//
//   room -> embed: { source: "kuma-listening-party", type: "hello" }
//   room -> embed: { source: "kuma-listening-party", type: "key", semitones: -12..12 }
//   room -> embed: { source: "kuma-listening-party", type: "vocals", amount: 0..1, engine?: "ai" | "classic" }
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
// With engine "ai" the voice is taken out by a neural network instead (tsurumeso/vocal-remover v4, MIT) running on the
// GPU in a worker (see ai/). It keeps the stereo and the band, and it needs about half a second of the song ahead of
// what it decides, so the audio plays that much late — and the video is held back by exactly the same amount with a
// canvas laid over it, so the lyrics on screen still land on the beat. Until the model is loaded, or on a machine
// without WebGPU or fast enough GPU, the L−R trick stands in.
//
// The audio only goes through Web Audio once a key or a vocal cut is asked for; until then YouTube plays it untouched,
// and YouTube's own ads always play untouched: every effect, the delay included, steps aside while an ad is on screen.
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
  /** The rate the vocal model was trained at; the whole graph runs at it and the browser resamples to the speakers. */
  const SAMPLE_RATE = 44100;
  /** Loading the model and building its GPU pipelines; past this the L−R trick carries on alone. */
  const AI_BOOT_TIMEOUT_MS = 45000;
  /** How long the held-back video may queue, in frames, whatever the delay. */
  const MAX_HELD_FRAMES = 90;
  /** Frames are kept at most this wide; lyrics stay sharp and a big screen does not fill the GPU with pictures. */
  const MAX_FRAME_WIDTH = 1600;
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
  /** "classic" is L−R; "ai" asks for the network and falls back to L−R until it is ready, or for good if it cannot be. */
  let vocalEngine = "classic";
  const ai = {
    state: "off", // off | loading | ready | unsupported | slow | error
    reason: "",
    frame: null,
    control: null,
    audioPort: null,
    node: null,
    engaged: false,
    chunk: 0,
    shift: 0,
    delay: 0,
    msPerRun: 0,
    gpu: "",
    slowReports: 0,
    timer: 0,
  };
  const held = { active: false, video: null, canvas: null, paint: null, frames: [], delay: 0, raf: 0, callback: 0, shown: -1 };

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

    context ??= new AudioContext({ latencyHint: "interactive", sampleRate: SAMPLE_RATE });
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

  /**
   * Starts the network once per embed: a hidden extension page hosts the worker (only the extension's own origin may
   * load the model and the GPU runtime), and two ports reach it — one for audio, handed to the AudioWorklet once the
   * worker says how big its chunks are, and one for everything else.
   */
  function startAi() {
    if (ai.state !== "off") return;
    ai.state = "loading";
    ai.reason = "";
    const audioChannel = new MessageChannel();
    const controlChannel = new MessageChannel();
    ai.audioPort = audioChannel.port1;
    ai.control = controlChannel.port1;
    ai.control.onmessage = (event) => void onAiMessage(event.data);
    const frame = document.createElement("iframe");
    frame.src = chrome.runtime.getURL("ai/frame.html");
    frame.tabIndex = -1;
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;left:-8px;top:-8px;width:1px;height:1px;opacity:0;pointer-events:none;border:0";
    frame.addEventListener("load", () => {
      frame.contentWindow.postMessage(
        { source: EXTENSION, type: "start", amount: vocalCut },
        new URL(chrome.runtime.getURL("")).origin,
        [audioChannel.port2, controlChannel.port2],
      );
    }, { once: true });
    document.documentElement.appendChild(frame);
    ai.frame = frame;
    ai.timer = setTimeout(() => {
      if (ai.state === "loading") aiFailed("error", "timeout");
    }, AI_BOOT_TIMEOUT_MS);
    report();
  }

  async function onAiMessage(message) {
    if (!message || typeof message !== "object") return;
    if (message.type === "ready" && ai.state === "loading") {
      clearTimeout(ai.timer);
      try {
        await ensureAudioGraph();
        await context.audioWorklet.addModule(chrome.runtime.getURL("ai/worklet.js"));
        ai.chunk = message.chunk;
        ai.shift = message.shift;
        // The worker has one chunk's time to answer: a chunk is complete one chunk after it starts, and is due another
        // chunk later.
        ai.delay = message.shift + 2 * message.chunk;
        ai.msPerRun = message.msPerRun;
        ai.gpu = message.gpu || "";
        ai.node = new AudioWorkletNode(context, "kuma-ai-vocal", {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          channelCount: 2,
          channelCountMode: "explicit",
          channelInterpretation: "speakers",
          processorOptions: { chunk: ai.chunk, shift: ai.shift, delay: ai.delay },
        });
        ai.node.port.postMessage({ type: "worker" }, [ai.audioPort]);
        ai.state = "ready";
      } catch (error) {
        aiFailed("error", error instanceof Error ? error.message : String(error));
        return;
      }
      void apply();
    } else if (message.type === "failed") {
      aiFailed(message.reason === "no-webgpu" ? "unsupported" : message.reason === "slow" ? "slow" : "error", message.detail || message.reason);
    } else if (message.type === "stats" && ai.state === "ready") {
      ai.msPerRun = message.msPerRun;
      // Three reports in a row with more chunks skipped than run: this machine cannot keep up while the song plays.
      ai.slowReports = message.skipped > message.runs ? ai.slowReports + 1 : 0;
      if (ai.slowReports >= 3) aiFailed("slow", `${message.msPerRun} ms per run`);
      else report();
    }
  }

  function aiFailed(state, reason) {
    clearTimeout(ai.timer);
    ai.state = state;
    ai.reason = String(reason || "").slice(0, 200);
    ai.node?.disconnect();
    ai.node = null;
    ai.engaged = false;
    ai.frame?.remove();
    ai.frame = null;
    ai.control?.close();
    ai.control = null;
    releaseVideo();
    if (source && killer) void apply();
    else report();
  }

  /**
   * Holds the video back by `delayMs` so the picture — and the lyrics burned into it — keeps time with audio that now
   * plays that much late. Each new frame is copied as it is decoded and drawn on a canvas over the video once its moment
   * comes round again. The video itself is left alone underneath and keeps playing as YouTube runs it.
   */
  function holdVideo(delayMs) {
    const video = sourceElement;
    if (!video || typeof video.requestVideoFrameCallback !== "function") return;
    held.delay = delayMs;
    if (held.active && held.video === video) return;
    releaseVideo();
    held.active = true;
    held.video = video;
    const canvas = document.createElement("canvas");
    canvas.className = "kuma-key-held-video";
    canvas.style.cssText = "position:absolute;pointer-events:none;background:#000;margin:0;padding:0;border:0";
    video.insertAdjacentElement("afterend", canvas);
    held.canvas = canvas;
    held.paint = canvas.getContext("2d", { alpha: false });
    place(video, canvas);
    // Freeze on the current frame rather than flash black while the first held frame comes due.
    try {
      held.paint.drawImage(video, 0, 0, canvas.width, canvas.height);
    } catch {
      // Nothing decoded yet.
    }

    const capture = (_now, meta) => {
      if (!held.active || held.video !== video) return;
      const { width, height } = canvas;
      if (width > 0 && height > 0) {
        const due = meta.expectedDisplayTime + held.delay;
        const mediaTime = meta.mediaTime;
        createImageBitmap(video, { resizeWidth: width, resizeHeight: height, resizeQuality: "low" })
          .then((bitmap) => {
            if (!held.active || held.video !== video) return bitmap.close();
            held.frames.push({ bitmap, due, mediaTime });
            while (held.frames.length > MAX_HELD_FRAMES) held.frames.shift().bitmap.close();
          })
          .catch(() => {});
      }
      held.callback = video.requestVideoFrameCallback(capture);
    };
    held.callback = video.requestVideoFrameCallback(capture);

    const draw = (now) => {
      if (!held.active) return;
      place(video, canvas);
      let shown = null;
      while (held.frames.length > 0 && held.frames[0].due <= now) {
        shown?.bitmap.close();
        shown = held.frames.shift();
      }
      if (shown) {
        held.paint.drawImage(shown.bitmap, 0, 0, canvas.width, canvas.height);
        shown.bitmap.close();
        held.shown = shown.mediaTime;
      }
      held.raf = requestAnimationFrame(draw);
    };
    held.raf = requestAnimationFrame(draw);
  }

  /** Lays the canvas exactly over the video element, at the screen's pixel density up to MAX_FRAME_WIDTH. */
  function place(video, canvas) {
    const box = `${video.offsetLeft},${video.offsetTop},${video.offsetWidth},${video.offsetHeight}`;
    if (canvas.dataset.box === box || video.offsetWidth === 0 || video.offsetHeight === 0) return;
    canvas.dataset.box = box;
    canvas.style.left = `${video.offsetLeft}px`;
    canvas.style.top = `${video.offsetTop}px`;
    canvas.style.width = `${video.offsetWidth}px`;
    canvas.style.height = `${video.offsetHeight}px`;
    const scale = Math.min(window.devicePixelRatio || 1, MAX_FRAME_WIDTH / video.offsetWidth);
    canvas.width = Math.max(1, Math.round(video.offsetWidth * scale));
    canvas.height = Math.max(1, Math.round(video.offsetHeight * scale));
  }

  function releaseVideo() {
    if (!held.active && !held.canvas) return;
    held.active = false;
    cancelAnimationFrame(held.raf);
    if (held.video && held.callback) held.video.cancelVideoFrameCallback?.(held.callback);
    for (const frame of held.frames) frame.bitmap.close();
    held.frames = [];
    held.canvas?.remove();
    held.canvas = null;
    held.paint = null;
    held.video = null;
    held.shown = -1;
  }

  /** What the room shows about the AI on this screen. */
  function aiStatus() {
    return {
      vocalEngine,
      ai: ai.state,
      aiReason: ai.reason || undefined,
      aiMs: ai.msPerRun || undefined,
      gpu: ai.gpu || undefined,
      delayMs: held.active ? Math.round(held.delay) : 0,
      // What other screens should allow for: the network's delay whenever the room has it on here, ads or not, so an
      // ad does not make every screen jump twice.
      syncDelayMs: vocalCut > 0 && vocalEngine === "ai" && ai.state === "ready" ? Math.round((ai.delay / SAMPLE_RATE) * 1000) : 0,
    };
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
      if (source && killer) void apply();
    };
    adObserver = new MutationObserver(update);
    adObserver.observe(player, { attributes: true, attributeFilter: ["class"] });
    update();
  }

  function route() {
    source.disconnect();
    stretch?.disconnect();
    killer.out.disconnect();
    ai.node?.disconnect();
    eq.out.disconnect();
    limiter.disconnect();

    // Straight through while the song is in its original key with every voice in it, or while an ad is playing.
    const shifted = semitones !== 0 && !adPlaying;
    const cutting = vocalCut > 0 && !adPlaying;
    const toned = !adPlaying && toning();
    const useAi = cutting && vocalEngine === "ai" && ai.state === "ready";
    let node = source;
    if (useAi) {
      // Coming back after an ad or an L−R stretch: start the delay line clean rather than replay what it held.
      if (!ai.engaged) ai.node.port.postMessage({ type: "reset" });
      ai.engaged = true;
      source.connect(ai.node);
      node = ai.node;
    } else if (cutting) {
      ai.engaged = false;
      killer.dry.gain.value = 1 - vocalCut;
      killer.side.gain.value = 1.4 * vocalCut;
      killer.keep.gain.value = vocalCut;
      source.connect(killer.splitter);
      source.connect(killer.keep);
      source.connect(killer.dry);
      node = killer.out;
    } else {
      ai.engaged = false;
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
    // How far the picture on screen trails the video underneath, for checking the hold against the audio delay.
    const pictureLagMs = held.active && held.shown >= 0 && sourceElement ? Math.round((sourceElement.currentTime - held.shown) * 1000) : null;
    post("probe", { rms, peakHz, semitones, contextState: context.state, sampleRate: context.sampleRate, pictureLagMs, ...aiStatus() });
  }

  let latencyMs = 0;

  function report() {
    post("status", {
      semitones, vocalCut, adPlaying, eq: eqGains,
      processing: Boolean(source) && !adPlaying && (semitones !== 0 || vocalCut > 0 || toning()),
      latencyMs,
      ...aiStatus(),
    });
  }

  async function apply() {
    // Nothing is asked of the audio yet and it has never been routed: leave YouTube's own path alone.
    const quiet = semitones === 0 && vocalCut === 0 && !toning();
    if (quiet && !source) {
      report();
      return;
    }
    try {
      await ensureAudioGraph();
      route();
      const shifted = semitones !== 0 && !adPlaying;
      const latency = shifted ? await stretch.latency() : 0;
      latencyMs = Math.round(latency * 1000);
      // While the network is in the chain the picture waits for the sound: its own delay, plus the pitch shifter's.
      if (ai.engaged) holdVideo((ai.delay / context.sampleRate) * 1000 + latency * 1000);
      else releaseVideo();
      report();
    } catch (error) {
      post("error", { semitones, vocalCut, eq: eqGains, message: error instanceof Error ? error.message : String(error) });
    }
  }

  function setKey(value) {
    // Keys move in half semitones; the pitch shifter takes fractions happily.
    semitones = Math.max(-KEY_RANGE, Math.min(KEY_RANGE, Math.round(value * 2) / 2));
    return apply();
  }

  function setVocals(value, engine) {
    vocalCut = Math.max(0, Math.min(1, Math.round(value * 100) / 100));
    vocalEngine = engine === "ai" ? "ai" : "classic";
    if (vocalEngine === "ai" && vocalCut > 0) startAi();
    ai.control?.postMessage({ type: "amount", value: vocalCut });
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
    else if (data.type === "vocals" && Number.isFinite(data.amount)) void setVocals(data.amount, data.engine);
    else if (data.type === "eq") void setEq(data);
    else if (data.type === "probe") void probe();
  });

  post("ready");
})();

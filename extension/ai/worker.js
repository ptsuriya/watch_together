// Runs the vocal-removal network on the GPU, one chunk at a time. Started by ai/frame.js with two ports: `audio` talks to
// the AudioWorklet in the YouTube embed (chunks in, processed chunks out, transferred rather than copied) and
// `control` talks to the content script (ready, amount, stats, failure).
import * as ort from "../vendor/ort/ort.webgpu.min.mjs";
import { MODEL_BINS, VocalStream } from "./stream.js";

ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = new URL("../vendor/ort/", import.meta.url).href;
ort.env.logLevel = "error";

const WINDOW = 64;
const LOOKAHEAD = 8;
/** Fast GPUs get short chunks and less delay; slower ones get twice the time per chunk. Slower still is not real time. */
const TIERS = [
  { chunkFrames: 8, maxMs: 110 },
  { chunkFrames: 16, maxMs: 240 },
];
/** More chunks waiting than this and the GPU has fallen behind: the oldest go through untouched until it catches up. */
const MAX_BACKLOG = 2;
const STATS_EVERY_MS = 2000;

let audio = null;
let control = null;
let session = null;
let stream = null;
let chunkFrames = 0;
let generation = 0;
let amount = 1;
let busy = false;
const queue = [];
const stats = { runs: 0, ms: 0, skipped: 0, since: 0 };

function fail(reason, detail) {
  control?.postMessage({ type: "failed", reason, detail: detail ? String(detail).slice(0, 300) : undefined });
}

async function run(input) {
  const result = await session.run({ mag: new ort.Tensor("float32", input, [1, 2, MODEL_BINS, WINDOW]) });
  return result.mask.data;
}

async function boot() {
  const adapter = await navigator.gpu?.requestAdapter?.().catch(() => null);
  if (!adapter) return fail("no-webgpu");
  try {
    session = await ort.InferenceSession.create(new URL("./vocal-remover-v4.onnx", import.meta.url).href, {
      executionProviders: ["webgpu"],
      graphOptimizationLevel: "all",
    });
  } catch (error) {
    return fail("load", error);
  }

  // Time the network on this machine before promising real time: two warm-up runs build the GPU pipelines, the median
  // of five decides the chunk size.
  const probe = new Float32Array(2 * MODEL_BINS * WINDOW).map(() => Math.random() * 0.2);
  const times = [];
  try {
    for (let i = 0; i < 7; i += 1) {
      const started = performance.now();
      await run(probe);
      if (i >= 2) times.push(performance.now() - started);
    }
  } catch (error) {
    return fail("run", error);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const tier = TIERS.find((option) => median <= option.maxMs);
  if (!tier) return fail("slow", Math.round(median));

  chunkFrames = tier.chunkFrames;
  stream = new VocalStream({ window: WINDOW, lookahead: LOOKAHEAD, chunkFrames });
  stats.since = performance.now();
  control.postMessage({
    type: "ready",
    chunk: stream.chunk,
    shift: stream.shift,
    msPerRun: Math.round(median),
    gpu: [adapter.info?.vendor, adapter.info?.architecture].filter(Boolean).join(" "),
  });
}

async function drain() {
  busy = true;
  while (queue.length > 0) {
    const chunk = queue.shift();
    // The worklet started over: so does the spectrogram, or the first chunks would be read against the old song.
    if (chunk.generation !== generation) {
      generation = chunk.generation;
      stream = new VocalStream({ window: WINDOW, lookahead: LOOKAHEAD, chunkFrames });
    }
    const job = stream.push(chunk.left, chunk.right);
    let mask = null;
    if (!job.silent && amount > 0) {
      if (queue.length >= MAX_BACKLOG) {
        stats.skipped += 1;
      } else {
        const started = performance.now();
        try {
          mask = await run(job.input);
        } catch (error) {
          fail("run", error);
          busy = false;
          return;
        }
        stats.runs += 1;
        stats.ms += performance.now() - started;
      }
    }
    const [left, right] = stream.finish(mask, amount);
    audio.postMessage({ type: "out", index: chunk.index, generation, left, right }, [left.buffer, right.buffer]);
  }
  busy = false;
  const now = performance.now();
  if (now - stats.since >= STATS_EVERY_MS) {
    control.postMessage({ type: "stats", msPerRun: stats.runs ? Math.round(stats.ms / stats.runs) : 0, skipped: stats.skipped, runs: stats.runs });
    stats.runs = 0; stats.ms = 0; stats.skipped = 0; stats.since = now;
  }
}

function onAudio(event) {
  const message = event.data;
  if (!stream || message?.type !== "chunk") return;
  if (!(message.left instanceof Float32Array) || message.left.length !== stream.chunk) return;
  // Chunks from before a reset are no use to anyone.
  if (queue.length > 0 && queue[0].generation !== message.generation) queue.length = 0;
  queue.push(message);
  if (!busy) void drain();
}

function onControl(event) {
  const message = event.data;
  if (message?.type === "amount" && Number.isFinite(message.value)) amount = Math.max(0, Math.min(1, message.value));
}

self.addEventListener("message", (event) => {
  if (event.data?.type !== "ports" || event.ports.length !== 2 || audio) return;
  [audio, control] = event.ports;
  audio.onmessage = onAudio;
  control.onmessage = onControl;
  if (Number.isFinite(event.data.amount)) amount = event.data.amount;
  void boot().catch((error) => fail("boot", error));
});

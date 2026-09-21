// The audio side of AI vocal removal. It cuts the embed's audio into chunks for the worker and plays back what the
// worker returns, a fixed `delay` samples after it came in — fixed, so the video can be held back by exactly the same
// amount. A chunk that is not back in time is covered by the untouched audio from the same moment, faded across, so a
// busy GPU costs a moment of the original voice and never a gap or a drift.
const FADE = 256;

class KumaAiVocal extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const { chunk, shift, delay } = options.processorOptions;
    this.chunk = chunk;
    this.shift = shift;
    this.delay = delay;
    let size = 1;
    while (size < delay + chunk * 4) size *= 2;
    this.size = size;
    this.mask = size - 1;
    this.dry = [new Float32Array(size), new Float32Array(size)];
    this.wet = [new Float32Array(size), new Float32Array(size)];
    // Which output chunk each slot of the wet ring currently holds; a slot is good only for the chunk it was filled by.
    this.slots = Math.ceil(size / chunk) + 2;
    this.stamps = new Float64Array(this.slots).fill(-1);
    this.pos = 0;
    this.mix = 0;
    this.index = 0;
    this.fill = 0;
    this.pending = [new Float32Array(chunk), new Float32Array(chunk)];
    this.worker = null;
    /** Bumped on every reset; anything the worker sends back from before it is dropped. */
    this.generation = 0;
    this.port.onmessage = (event) => {
      if (event.data?.type === "worker" && event.ports[0]) {
        this.worker = event.ports[0];
        this.worker.onmessage = (message) => this.receive(message.data);
      } else if (event.data?.type === "reset") {
        this.reset();
      }
    };
  }

  reset() {
    this.generation += 1;
    for (const ring of [...this.dry, ...this.wet]) ring.fill(0);
    this.stamps.fill(-1);
    this.pos = 0;
    this.index = 0;
    this.fill = 0;
    this.mix = 0;
  }

  receive(message) {
    if (message?.type !== "out" || message.generation !== this.generation || !(message.left instanceof Float32Array)) return;
    const { index, left, right } = message;
    const start = index * this.chunk - this.shift;
    for (let i = 0; i < left.length; i += 1) {
      const p = start + i;
      if (p < 0) continue;
      this.wet[0][p & this.mask] = left[i];
      this.wet[1][p & this.mask] = right[i];
    }
    this.stamps[index % this.slots] = index;
  }

  /** Whether the worker's result for absolute sample p has arrived. */
  ready(p) {
    if (p < 0) return false;
    const index = Math.floor((p + this.shift) / this.chunk);
    return this.stamps[index % this.slots] === index;
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    const inL = input?.[0];
    const inR = input?.[1] ?? inL;
    const outL = output[0];
    const outR = output[1] ?? output[0];
    const frames = outL.length;
    for (let i = 0; i < frames; i += 1) {
      const l = inL ? inL[i] : 0;
      const r = inR ? inR[i] : 0;
      const at = this.pos & this.mask;
      this.dry[0][at] = l;
      this.dry[1][at] = r;
      this.pending[0][this.fill] = l;
      this.pending[1][this.fill] = r;
      this.fill += 1;
      if (this.fill === this.chunk) {
        const [left, right] = this.pending;
        this.worker?.postMessage(
          { type: "chunk", index: this.index, generation: this.generation, left, right },
          [left.buffer, right.buffer],
        );
        this.pending = [new Float32Array(this.chunk), new Float32Array(this.chunk)];
        this.index += 1;
        this.fill = 0;
      }

      const p = this.pos - this.delay;
      let left = 0;
      let right = 0;
      if (p >= 0) {
        const slot = p & this.mask;
        // Fade out before a chunk that has not arrived, and back in only once the next FADE samples are all here.
        const now = this.ready(p);
        const target = now && this.ready(p + FADE) ? 1 : 0;
        if (!now) this.mix = 0;
        else if (this.mix < target) this.mix = Math.min(target, this.mix + 1 / FADE);
        else if (this.mix > target) this.mix = Math.max(target, this.mix - 1 / FADE);
        const dryL = this.dry[0][slot];
        const dryR = this.dry[1][slot];
        left = this.mix > 0 ? dryL + (this.wet[0][slot] - dryL) * this.mix : dryL;
        right = this.mix > 0 ? dryR + (this.wet[1][slot] - dryR) * this.mix : dryR;
      }
      outL[i] = left;
      if (outR !== outL) outR[i] = right;
      this.pos += 1;
    }
    return true;
  }
}

registerProcessor("kuma-ai-vocal", KumaAiVocal);

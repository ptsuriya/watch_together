// The signal side of AI vocal removal, with no model in it: a streaming STFT that turns fixed chunks of stereo audio
// into the window the network wants, and turns the network's mask back into audio by overlap-add. Kept free of any
// browser API so the same file runs in the extension's worker and under Node for the parity tests.
//
// The numbers follow tsurumeso/vocal-remover v4, which the model was trained with: 44.1 kHz, a 2048-point periodic
// Hann window, hop 1024, the first 1024 bins in and a sigmoid mask out (the Nyquist bin reuses the mask below it).
//
// Timing, in frames of one hop each. A chunk brings C new frames. The network looks at the last W frames, and the mask
// is taken F frames short of the newest one, so every frame it decides on has F frames of what comes after it — the
// lookahead is what the added delay buys. A frame j spans samples [(j−1)·hop, (j+1)·hop), so once frames up to J are
// known the samples before (J−F)·hop are final: each chunk hands back C·hop samples that end (1+F)·hop before the
// newest input sample.

export const SAMPLE_RATE = 44100;
export const FFT_SIZE = 2048;
export const HOP = 1024;
export const MODEL_BINS = 1024;
const BINS = FFT_SIZE / 2 + 1;

/** In-place radix-2 complex FFT; `inverse` conjugates the twiddles and leaves the 1/N to the caller. */
class Fft {
  constructor(size) {
    this.size = size;
    this.cos = new Float32Array(size / 2);
    this.sin = new Float32Array(size / 2);
    for (let i = 0; i < size / 2; i += 1) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size);
      this.sin[i] = Math.sin((2 * Math.PI * i) / size);
    }
    this.reverse = new Uint32Array(size);
    const bits = Math.log2(size);
    for (let i = 0; i < size; i += 1) {
      let r = 0;
      for (let b = 0; b < bits; b += 1) r |= ((i >> b) & 1) << (bits - 1 - b);
      this.reverse[i] = r;
    }
  }

  run(re, im, inverse) {
    const n = this.size;
    for (let i = 0; i < n; i += 1) {
      const j = this.reverse[i];
      if (j > i) {
        let t = re[i]; re[i] = re[j]; re[j] = t;
        t = im[i]; im[i] = im[j]; im[j] = t;
      }
    }
    const sign = inverse ? 1 : -1;
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k += 1) {
          const wr = this.cos[k * step];
          const wi = sign * this.sin[k * step];
          const a = start + k;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr; im[b] = im[a] - xi;
          re[a] += xr; im[a] += xi;
        }
      }
    }
  }
}

export class VocalStream {
  /**
   * @param {{ window?: number, lookahead?: number, chunkFrames?: number, peakDecay?: number }} options
   *   window: frames the network sees (a multiple of 16); lookahead: frames after the newest decided one;
   *   chunkFrames: frames per chunk; peakDecay: how fast the loudness reference forgets a loud moment, per chunk.
   */
  constructor({ window = 64, lookahead = 8, chunkFrames = 8, peakDecay = 0.97 } = {}) {
    if (window % 16 !== 0) throw new Error("window must be a multiple of 16");
    if (window < lookahead + chunkFrames) throw new Error("window too small for the lookahead");
    this.W = window;
    this.F = lookahead;
    this.C = chunkFrames;
    this.chunk = chunkFrames * HOP;
    /** How far the output runs behind the input, in samples, before any compute time. */
    this.shift = (1 + lookahead) * HOP;
    this.peakDecay = peakDecay;
    this.peak = 0;
    this.fft = new Fft(FFT_SIZE);
    this.window = new Float32Array(FFT_SIZE);
    for (let n = 0; n < FFT_SIZE; n += 1) this.window[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / FFT_SIZE);
    // Overlap-add normaliser: with a 50% hop every sample sits under exactly two frames.
    this.norm = new Float32Array(HOP);
    for (let n = 0; n < HOP; n += 1) {
      const sum = this.window[n] ** 2 + this.window[n + HOP] ** 2;
      this.norm[n] = sum > 1e-8 ? 1 / sum : 0;
    }
    // The last hop of input from the previous chunk: the first new frame reaches back that far.
    this.tail = [new Float32Array(HOP), new Float32Array(HOP)];
    // Rings of the last W frames: magnitudes for the network and complex spectra for the resynthesis.
    this.mag = new Float32Array(window * 2 * BINS);
    this.re = new Float32Array(window * 2 * BINS);
    this.im = new Float32Array(window * 2 * BINS);
    this.frames = 0;
    this.carry = [new Float32Array(HOP), new Float32Array(HOP)];
    this.input = new Float32Array(2 * MODEL_BINS * window);
    this.scratchRe = new Float32Array(FFT_SIZE);
    this.scratchIm = new Float32Array(FFT_SIZE);
    this.pending = null;
  }

  slot(frame) {
    return ((frame % this.W) + this.W) % this.W;
  }

  /** Both channels at once: L in the real part, R in the imaginary part, pulled apart by symmetry after the FFT. */
  analyse(frame, left, right, offset) {
    const re = this.scratchRe;
    const im = this.scratchIm;
    for (let n = 0; n < FFT_SIZE; n += 1) {
      re[n] = left[offset + n] * this.window[n];
      im[n] = right[offset + n] * this.window[n];
    }
    this.fft.run(re, im, false);
    const base = this.slot(frame) * 2 * BINS;
    for (let k = 0; k < BINS; k += 1) {
      const m = (FFT_SIZE - k) % FFT_SIZE;
      const lr = 0.5 * (re[k] + re[m]);
      const li = 0.5 * (im[k] - im[m]);
      const rr = 0.5 * (im[k] + im[m]);
      const ri = -0.5 * (re[k] - re[m]);
      this.re[base + k] = lr; this.im[base + k] = li;
      this.re[base + BINS + k] = rr; this.im[base + BINS + k] = ri;
      this.mag[base + k] = Math.hypot(lr, li);
      this.mag[base + BINS + k] = Math.hypot(rr, ri);
    }
  }

  /**
   * Takes one chunk (chunkFrames·hop samples per channel) and returns what the network should look at, already scaled,
   * as a [1, 2, 1024, W] tensor laid out row-major — or `silent: true` when there is nothing worth separating.
   */
  push(left, right) {
    if (left.length !== this.chunk || right.length !== this.chunk) throw new Error("wrong chunk size");
    const span = HOP + this.chunk;
    const l = new Float32Array(span);
    const r = new Float32Array(span);
    l.set(this.tail[0]); l.set(left, HOP);
    r.set(this.tail[1]); r.set(right, HOP);
    this.tail[0].set(left.subarray(this.chunk - HOP));
    this.tail[1].set(right.subarray(this.chunk - HOP));
    // Frame j spans [(j−1)·hop, (j+1)·hop); the buffer starts one hop before this chunk.
    for (let i = 0; i < this.C; i += 1) this.analyse(this.frames + i, l, r, i * HOP);
    this.frames += this.C;

    const newest = this.frames - 1;
    let loudest = 0;
    for (let t = 0; t < this.W; t += 1) {
      const frame = newest - this.W + 1 + t;
      if (frame < 0) continue;
      const base = this.slot(frame) * 2 * BINS;
      for (let c = 0; c < 2; c += 1) {
        for (let k = 0; k < MODEL_BINS; k += 1) {
          const v = this.mag[base + c * BINS + k];
          if (v > loudest) loudest = v;
        }
      }
    }
    // The model was trained on songs scaled so their loudest bin is 1. Live, the loudest bin so far stands in for it,
    // forgetting slowly so a quiet verse after a loud chorus is not read as near-silence.
    this.peak = Math.max(this.peak * this.peakDecay, loudest);
    const silent = loudest < 1e-3;
    this.pending = { newest, silent };
    if (silent) return { silent: true, input: null };

    const scale = 1 / Math.max(this.peak, 1e-3);
    const input = this.input;
    for (let t = 0; t < this.W; t += 1) {
      const frame = newest - this.W + 1 + t;
      const base = frame < 0 ? -1 : this.slot(frame) * 2 * BINS;
      for (let c = 0; c < 2; c += 1) {
        for (let k = 0; k < MODEL_BINS; k += 1) {
          input[(c * MODEL_BINS + k) * this.W + t] = base < 0 ? 0 : this.mag[base + c * BINS + k] * scale;
        }
      }
    }
    return { silent: false, input };
  }

  /**
   * Applies the network's mask (same layout as the input; null keeps everything) to the frames this chunk decides,
   * and returns chunkFrames·hop samples per channel. `amount` is how much of the voice to take: 1 all of it, 0.5 half.
   */
  finish(mask, amount = 1) {
    const { newest } = this.pending ?? { newest: this.frames - 1 };
    this.pending = null;
    const out = [new Float32Array(this.chunk), new Float32Array(this.chunk)];
    const first = newest - this.F - this.C + 1;
    const re = this.scratchRe;
    const im = this.scratchIm;
    for (let i = 0; i < this.C; i += 1) {
      const frame = first + i;
      if (frame < 0) continue;
      const t = this.W - 1 - (newest - frame);
      const base = this.slot(frame) * 2 * BINS;
      // Y = X · (1 − amount·(1 − mask)) for each channel; L goes in real, R in imaginary, and one inverse FFT does both.
      for (let k = 0; k < BINS; k += 1) {
        const bin = Math.min(k, MODEL_BINS - 1);
        const gl = mask ? 1 - amount * (1 - mask[bin * this.W + t]) : 1;
        const gr = mask ? 1 - amount * (1 - mask[(MODEL_BINS + bin) * this.W + t]) : 1;
        const lr = this.re[base + k] * gl;
        const li = this.im[base + k] * gl;
        const rr = this.re[base + BINS + k] * gr;
        const ri = this.im[base + BINS + k] * gr;
        // Z = L + iR at k, and its mirror at N−k from the conjugates, which keeps both outputs real.
        re[k] = lr - ri;
        im[k] = li + rr;
        if (k > 0 && k < FFT_SIZE / 2) {
          re[FFT_SIZE - k] = lr + ri;
          im[FFT_SIZE - k] = -li + rr;
        }
      }
      this.fft.run(re, im, true);
      // First half of this frame lands on [i·hop, (i+1)·hop) with the carried second half of the frame before it.
      for (let c = 0; c < 2; c += 1) {
        const part = c === 0 ? re : im;
        const target = out[c];
        const carry = this.carry[c];
        const startSample = i * HOP;
        for (let n = 0; n < HOP; n += 1) {
          const value = (part[n] / FFT_SIZE) * this.window[n];
          target[startSample + n] = (carry[n] + value) * this.norm[n];
        }
        for (let n = 0; n < HOP; n += 1) carry[n] = (part[HOP + n] / FFT_SIZE) * this.window[HOP + n];
      }
    }
    return out;
  }
}

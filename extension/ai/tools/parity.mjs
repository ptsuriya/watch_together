import fs from "node:fs";
import * as ort from "onnxruntime-node";
import { VocalStream } from "../stream.js";
const AI = process.argv[2];
const raw = new Float32Array(fs.readFileSync(`${AI}/parity_in.f32`).buffer.slice(0));
const ref = new Float32Array(fs.readFileSync(`${AI}/parity_ref.f32`).buffer.slice(0));
const L = raw.length / 2;
const left = raw.subarray(0, L), right = raw.subarray(L);
const session = await ort.InferenceSession.create(`${AI}/vocal-remover-v4.onnx`);
const stream = new VocalStream({ window: 64, lookahead: 8, chunkFrames: 8 });
const outL = new Float32Array(L), outR = new Float32Array(L);
const CH = stream.chunk;
let t = 0;
for (let k = 0; k * CH < L + stream.shift + CH; k += 1) {
  const l = new Float32Array(CH), r = new Float32Array(CH);
  l.set(left.subarray(k * CH, Math.min(L, (k + 1) * CH))); r.set(right.subarray(k * CH, Math.min(L, (k + 1) * CH)));
  const job = stream.push(l, r);
  let mask = null;
  if (!job.silent) {
    const s = performance.now();
    const res = await session.run({ mag: new ort.Tensor("float32", job.input, [1, 2, 1024, 64]) });
    t += performance.now() - s;
    mask = res.mask.data;
  }
  const [a, b] = stream.finish(mask, 1);
  const start = k * CH - stream.shift;
  for (let i = 0; i < CH; i += 1) { const p = start + i; if (p >= 0 && p < L) { outL[p] = a[i]; outR[p] = b[i]; } }
}
let err = 0, energy = 0;
for (let p = 0; p < L; p += 1) { err += (outL[p] - ref[p]) ** 2 + (outR[p] - ref[L + p]) ** 2; energy += ref[p] ** 2 + ref[L + p] ** 2; }
console.log(`JS stream vs Python reference: error ${(10 * Math.log10(err / energy)).toFixed(1)} dB below the signal; model time ${Math.round(t)} ms`);
// Identity check: with no mask the stream must hand back the input, one shift late.
const id = new VocalStream({ window: 64, lookahead: 8, chunkFrames: 8 });
let e2 = 0, s2 = 0;
for (let k = 0; k * CH < L; k += 1) {
  const l = new Float32Array(CH), r = new Float32Array(CH);
  l.set(left.subarray(k * CH, Math.min(L, (k + 1) * CH))); r.set(right.subarray(k * CH, Math.min(L, (k + 1) * CH)));
  id.push(l, r); const [a, b] = id.finish(null);
  const start = k * CH - id.shift;
  for (let i = 0; i < CH; i += 1) { const p = start + i; if (p >= 0 && p < L - CH) { e2 += (a[i] - left[p]) ** 2 + (b[i] - right[p]) ** 2; s2 += left[p] ** 2 + right[p] ** 2; } }
}
console.log(`identity round trip: error ${(10 * Math.log10(e2 / s2)).toFixed(1)} dB below the signal`);

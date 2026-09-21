# Model tools

How `../vocal-remover-v4.onnx` was made and measured. None of this ships in the extension zip.

Set up once, in any scratch folder:

```bash
curl -sL -o v4.zip https://github.com/tsurumeso/vocal-remover/releases/download/v4.0.0/vocal-remover-v4.0.0.zip
unzip -q v4.zip -d v4
python3.12 -m venv venv
./venv/bin/pip install torch numpy onnx onnxruntime onnxscript librosa musdb scipy
cp /path/to/extension/ai/tools/*.py .
```

- `export_final.py` exports the network as a mask-only graph (`mag` [1, 2, 1024, frames] in, `mask` out) with a free
  frame axis, folds BatchNorm with onnxruntime's basic optimiser, stores the weights as fp16 behind Cast nodes (half the
  file, fp32 arithmetic on any GPU) and checks the result against PyTorch. Copy `vocal-remover-v4.onnx` into `extension/ai/`.
  `AdaptiveAvgPool2d((1, None))` is replaced by a mean over the frequency axis — the same thing, but exportable with a
  free frame axis.
- `evalfast.py N [model]` scores streaming settings (window, lookahead, chunk, loudness decay) against the whole-song
  inference on the first N vocal excerpts of MUSDB18's 7-second test set (downloaded by `musdb` on first use).
  `evalfast2.py` scores the shipped settings and the old L−R trick side by side.
- `parity_ref.py` writes one excerpt and its streamed separation (`parity_in.f32`, `parity_ref.f32`); `parity.mjs` runs
  `../stream.js` with onnxruntime-node over the same input and prints how far apart they are
  (`npm i onnxruntime-node` next to it, then `node parity.mjs <folder with the .f32 files and the model>`).

Results when this was written (Apple M-series, Chrome 140): 11.0 dB accompaniment SDR streamed at window 64 /
lookahead 8 / chunk 8 against 11.5 dB whole-song; L−R −2.9 dB; JavaScript vs Python −132 dB; 38 ms per run on WebGPU.

import sys, numpy as np, librosa, musdb, onnxruntime as ort
so = ort.SessionOptions(); so.intra_op_num_threads = 8
sess = ort.InferenceSession(sys.argv[2] if len(sys.argv) > 2 else "v4_dyn_opt.onnx", so, providers=["CPUExecutionProvider"])
N_FFT, HOP = 2048, 1024
def net(x): return sess.run(None, {"mag": x.astype(np.float32)})[0]
def stft(w): return np.asarray([librosa.stft(c, n_fft=N_FFT, hop_length=HOP, pad_mode="constant") for c in w])
def istft(s, length): return np.asarray([librosa.istft(c, hop_length=HOP, length=length) for c in s])

def offline_mask(mag):
    x = mag[:, :1024] / mag.max(); n = x.shape[2]
    left, roi = 128, 256
    right = roi - (n % roi) + left
    xp = np.pad(x, ((0, 0), (0, 0), (left, right)))
    outs = [net(xp[None, :, :, i * roi:i * roi + 512])[0, :, :, 128:-128] for i in range(int(np.ceil(n / roi)))]
    return np.concatenate(outs, axis=2)[:, :, :n]

def stream_mask(mag, W, F, C, decay):
    x = mag[:, :1024]; n = x.shape[2]
    xp = np.pad(x, ((0, 0), (0, 0), (W, W)))
    out = np.ones_like(x); peak = 0.0
    for start in range(0, n + F, C):
        newest = start + C - 1  # frames known after this chunk
        win = xp[:, :, newest + 1 - W + W:newest + 1 + W]
        peak = max(peak * decay, win.max())
        if win.max() < 1e-3: continue
        mk = net((win / max(peak, 1e-3))[None])[0]
        first = newest - F - C + 1
        for i in range(C):
            f = first + i
            if 0 <= f < n: out[:, :, f] = mk[:, :, W - 1 - (newest - f)]
    return out

def sdr(ref, est): return 10 * np.log10((ref ** 2).sum() / (((ref - est) ** 2).sum() + 1e-9) + 1e-9)
def apply(mask, spec, L): return istft(spec * np.concatenate([mask, mask[:, -1:]], axis=1), L)

db = musdb.DB(root="musdb7", subsets="test")
tracks = [t for t in db if (t.targets["vocals"].audio ** 2).mean() > 1e-4][:int(sys.argv[1])]
configs = [("offline (whole song)", None)] + [(f"W{W} F{F} C{C} d{d}", (W, F, C, d)) for W, F, C, d in [
    (32, 4, 8, 0.97), (64, 0, 8, 0.97), (64, 4, 8, 0.97), (64, 8, 8, 0.97), (64, 16, 8, 0.97), (96, 8, 8, 0.97), (128, 8, 8, 0.97), (64, 8, 8, 0.0), (64, 8, 8, 0.995)]]
res = {k: [] for k, _ in configs}; kept = {k: [] for k, _ in configs}; base = []; lr = []
for t in tracks:
    mix = t.audio.T.astype(np.float32); acc = t.targets["accompaniment"].audio.T.astype(np.float32); voc = t.targets["vocals"].audio.T.astype(np.float32)
    L = mix.shape[1]; spec = stft(mix); vspec = stft(voc); mag = np.abs(spec)
    base.append(sdr(acc, mix))
    for name, cfg in configs:
        mk = offline_mask(mag) if cfg is None else stream_mask(mag, *cfg)
        res[name].append(sdr(acc, apply(mk, spec, L)))
        v = apply(mk, vspec, L); kept[name].append(10 * np.log10((v ** 2).sum() / (voc ** 2).sum()))
print(f"{len(tracks)} tracks; doing nothing scores {np.mean(base):.2f} dB")
for k in res: print(f"{k:24s} accompaniment SDR {np.mean(res[k]):6.2f} dB | vocal left {np.mean(kept[k]):6.1f} dB")

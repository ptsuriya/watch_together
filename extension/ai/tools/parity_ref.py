import sys, numpy as np, musdb
sys.argv = ["x", "1", "vocal-remover-v4.onnx"]
exec(open("evalfast.py").read().split("db = musdb.DB")[0])
db = musdb.DB(root="musdb7", subsets="test")
t = [t for t in db if (t.targets["vocals"].audio ** 2).mean() > 1e-4][3]
mix = t.audio.T.astype(np.float32)
spec = stft(mix); mk = stream_mask(np.abs(spec), 64, 8, 8, 0.97)
out = apply(mk, spec, mix.shape[1]).astype(np.float32)
mix.tofile("parity_in.f32"); out.tofile("parity_ref.f32")
print(t.name, mix.shape)

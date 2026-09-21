"""Export tsurumeso/vocal-remover v4 (MIT) as a mask-only ONNX graph with a free frame axis and fp16-stored weights."""
import sys, torch, numpy as np, onnx
from onnx import numpy_helper, helper, TensorProto
sys.path.insert(0, "v4/vocal-remover")
from lib import nets
m = nets.CascadedASPPNet(2048)
m.load_state_dict(torch.load("v4/vocal-remover/models/baseline.pth", map_location="cpu")); m.eval()

class MeanOverBins(torch.nn.Module):
    """AdaptiveAvgPool2d((1, None)) is a mean over the frequency axis; spelled out, it exports with a free frame axis."""
    def forward(self, x): return x.mean(dim=2, keepdim=True)

from lib import layers
for module in m.modules():
    if isinstance(module, layers.ASPPModule):
        module.conv1[0] = MeanOverBins()

class MaskOnly(torch.nn.Module):
    def __init__(s, net): super().__init__(); s.net = net
    def forward(s, x):
        n = s.net
        bandw = x.size()[2] // 2
        aux1 = torch.cat([n.stg1_low_band_net(x[:, :, :bandw]), n.stg1_high_band_net(x[:, :, bandw:])], dim=2)
        h = torch.cat([x, aux1], dim=1)
        aux2 = n.stg2_full_band_net(n.stg2_bridge(h))
        h = torch.cat([x, aux1, aux2], dim=1)
        h = n.stg3_full_band_net(n.stg3_bridge(h))
        return torch.sigmoid(n.out(h))

x = torch.rand(1, 2, 1024, 64)
torch.onnx.export(MaskOnly(m).eval(), x, "v4_dyn_fp32.onnx", input_names=["mag"], output_names=["mask"],
                  opset_version=17, dynamic_axes={"mag": {3: "frames"}, "mask": {3: "frames"}}, dynamo=False, do_constant_folding=True)

# Fold BatchNorm into the convolutions with onnxruntime's own optimizer, then store every large float initializer as fp16
# behind a Cast, so the file halves and the arithmetic stays fp32 on any GPU.
import onnxruntime as ort
so = ort.SessionOptions(); so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_BASIC
so.optimized_model_filepath = "v4_dyn_opt.onnx"
ort.InferenceSession("v4_dyn_fp32.onnx", so, providers=["CPUExecutionProvider"])
model = onnx.load("v4_dyn_opt.onnx")
g = model.graph
new_inits, casts = [], []
for init in list(g.initializer):
    arr = numpy_helper.to_array(init)
    if arr.dtype == np.float32 and arr.size >= 256:
        half = numpy_helper.from_array(arr.astype(np.float16), init.name + "_f16")
        new_inits.append(half)
        casts.append(helper.make_node("Cast", [init.name + "_f16"], [init.name], to=TensorProto.FLOAT, name=init.name + "_cast"))
    else:
        new_inits.append(init)
del g.initializer[:]
g.initializer.extend(new_inits)
nodes = list(g.node); del g.node[:]; g.node.extend(casts + nodes)
onnx.checker.check_model(model)
onnx.save(model, "vocal-remover-v4.onnx")

import os
for W in (32, 64, 96):
    xi = np.random.rand(1, 2, 1024, W).astype(np.float32)
    with torch.no_grad(): ref = MaskOnly(m)(torch.from_numpy(xi)).numpy()
    got = ort.InferenceSession("vocal-remover-v4.onnx", providers=["CPUExecutionProvider"]).run(None, {"mag": xi})[0]
    print(f"W={W} max |mask diff| fp16-weights vs torch: {np.abs(got - ref).max():.4f}  mean {np.abs(got - ref).mean():.5f}")
print("size MB", os.path.getsize("vocal-remover-v4.onnx") / 1e6)

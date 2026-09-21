// Builds the KUMA Karaoke Key extension into .extension-build/ (loadable unpacked, which is what the tests use) and packs
// it as public/kuma-karaoke-key.zip for the room to hand out. The GPU runtime for AI vocal removal comes from the
// onnxruntime-web package at build time rather than being copied into the repo; the model file is small enough to keep.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { zipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = join(root, "extension");
const build = join(root, ".extension-build");
const zipPath = join(root, "public", "kuma-karaoke-key.zip");
const ortDist = join(root, "node_modules", "onnxruntime-web", "dist");

/** Store listing drafts, the README and the model-conversion scripts stay out of what people install. */
const SKIP = new Set(["store", "README.md", "tools", ".DS_Store"]);
/** The WebGPU build of ONNX Runtime and the one wasm variant it loads. */
const ORT_FILES = ["ort.webgpu.min.mjs", "ort-wasm-simd-threaded.asyncify.mjs", "ort-wasm-simd-threaded.asyncify.wasm"];

rmSync(build, { recursive: true, force: true });
cpSync(source, build, { recursive: true, filter: (path) => !SKIP.has(path.split("/").pop()) });

mkdirSync(join(build, "vendor", "ort"), { recursive: true });
for (const file of ORT_FILES) {
  const from = join(ortDist, file);
  if (!existsSync(from)) throw new Error(`missing ${from} — run npm install`);
  cpSync(from, join(build, "vendor", "ort", file));
}

function collect(dir, files = {}) {
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) collect(path, files);
    else files[relative(build, path)] = [readFileSync(path), { level: name.endsWith(".png") ? 0 : 9 }];
  }
  return files;
}

mkdirSync(dirname(zipPath), { recursive: true });
// A fixed date keeps the zip identical from one build to the next when nothing inside changed.
const zip = zipSync(collect(build), { mtime: new Date("2026-01-01T00:00:00Z") });
writeFileSync(zipPath, zip);
console.log(`packed ${relative(root, zipPath)} (${(zip.length / 1e6).toFixed(1)} MB) from ${relative(root, build)}/`);

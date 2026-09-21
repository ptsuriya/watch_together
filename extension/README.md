# KUMA Karaoke Key

A one-purpose Chrome/Edge extension for [KUMA Listening Party](../README.md): it lets the karaoke room change the key
of the YouTube video playing on the host screen.

Only code running inside the YouTube embed can reach the video's audio, so this content script does that and nothing
else. The room page posts `{ source: "kuma-listening-party", type: "key", semitones }` to the embed; the script routes
the video through Web Audio into [Signalsmith Stretch](https://signalsmith-audio.co.uk/code/stretch/) (MIT, vendored in
`vendor/signalsmith-stretch.js`) and shifts the pitch with about 70 ms of latency. At key 0 nothing is processed.

- Permissions: none beyond the content script on `https://www.youtube-nocookie.com/embed/*`.
- YouTube's own ads are never touched: while the player is showing an ad the pitch shift steps aside and the audio
  goes straight through, and nothing about the ad is blocked, skipped or changed.
- No data is collected, stored or sent anywhere. The extension has no background page and no network calls.

## What it does

- **Key** — the room posts a key and the content script shifts the pitch of the embed's audio with Signalsmith Stretch.
- **Vocal cut (1.2.0)** — the room can ask for half or all of the centre channel to be subtracted (L−R), the old karaoke
  trick for thinning a guide vocal. It is mono by nature and takes the centred bass and kick with it, which is why the
  room offers half as well as all. Songs that do not mix the voice dead centre barely change.
- **Tone (1.3.0)** — five bands (90 Hz shelf, 250 Hz, 1 kHz, 3 kHz, 8 kHz shelf, ±8 dB) that the room sets from
  one-tap presets or sliders, followed by a limiter just under full scale whenever the audio is processed at all, so a
  bass boost or the lift on L−R bends the peaks down instead of clipping. A 1.2 helper hears only the low, mid and high
  bands, which is why the room asks for 1.3.
- **AI vocal removal (1.4.0)** — with `engine: "ai"` the voice is taken out by tsurumeso's vocal-remover v4 network
  (MIT, `ai/vocal-remover-v4.onnx`, BatchNorm folded and weights stored as fp16, 16 MB) running on WebGPU through
  ONNX Runtime Web in a worker. A content script cannot start a worker from the extension, so it adds a hidden 1×1
  extension page (`ai/frame.html`) to the embed, which starts `ai/worker.js`; an AudioWorklet (`ai/worklet.js`) cuts
  the audio into 8192-sample chunks and trades them with the worker directly over a MessagePort. `ai/stream.js` is the
  streaming STFT (2048/1024 Hann, the model's own numbers): the network sees the last 64 frames and decides the
  frames 8 short of the newest, so each chunk plays `(1 + 8) × 1024 + 2 × 8192 = 25 600` samples (0.58 s at 44.1 kHz)
  after it arrived. That delay is fixed — a chunk the worker has not returned by then is covered by the untouched audio
  of the same moment, faded across — so the video can be held back by exactly the same amount: every decoded frame is
  copied and drawn on a canvas over the video when its moment comes round again (plus the pitch shifter's own latency
  when the key is moved). The audio context runs at 44.1 kHz, the rate the model was trained at.
  The worker times the network before it promises real time: under 110 ms a run it uses 8-frame chunks, under 240 ms
  16-frame chunks (0.95 s delay), slower than that — or without WebGPU — the extension says so and L−R carries on. The
  room reads the network's delay from the status message and makes it up to the other screens in a sing-along.
  Measured on 12 MUSDB18 test excerpts, the accompaniment comes out at 11.0 dB SDR against 11.5 dB for the model run
  offline over the whole song, with the voice 8 dB down; L−R on the same excerpts leaves the voice where it was
  (−2.9 dB SDR, since those mixes do not keep the voice dead centre). `ai/tools/` has the export, the evaluation and the
  parity check (the JavaScript STFT matches librosa to −132 dB).
- None of it touches a YouTube ad: while the player says an ad is on, the audio goes straight through, with no delay.

## Install for testing

`npm run extension:zip` in the project root runs `scripts/pack-extension.mjs`: it copies `extension/` into
`.extension-build/` (load that folder unpacked to test), adds ONNX Runtime Web's WebGPU build from `node_modules`, and
packs `public/kuma-karaoke-key.zip` (about 22 MB, most of it the model and the runtime). The site build runs it too,
so the zip is not kept in git.

- **Chrome / Brave / Vivaldi** — unzip, open `chrome://extensions`, turn on Developer mode, **Load unpacked**, pick the folder.
- **Edge** — unzip, open `edge://extensions`, turn on developer mode, **Load unpacked**, pick the folder.
- **Opera** — unzip, open `opera://extensions`, turn on Developer mode, **Load unpacked**, pick the folder.
- **Firefox** — open `about:debugging#/runtime/this-firefox` and **Load Temporary Add-on**, then pick the zip itself. It
  is dropped when Firefox closes, and the pitch shifting has not been verified on Gecko: the content script builds its
  audio graph around the embed's `<video>`, which Firefox isolates differently. Treat it as untested.

## Publishing to the Chrome Web Store

1. Upload the zip from `public/kuma-karaoke-key.zip` in the Chrome Web Store developer dashboard (one-time $5 fee).
2. Single purpose: "Change the musical key of the YouTube video playing in a KUMA Listening Party karaoke room."
3. Permission justification: the content script needs `www.youtube-nocookie.com` because the room's video plays there;
   the extension reads no page data and collects nothing.
4. After it is published, set `NEXT_PUBLIC_KARAOKE_EXTENSION_URL` to the store link in Vercel. The karaoke sidebar then
   shows a one-click install button instead of the zip and the manual steps.

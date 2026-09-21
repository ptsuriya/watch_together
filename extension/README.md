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
- None of it touches a YouTube ad: while the player says an ad is on, the audio goes straight through.

## Install for testing

`npm run extension:zip` in the project root packs `public/kuma-karaoke-key.zip`.

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

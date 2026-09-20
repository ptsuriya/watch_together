# KUMA Karaoke Key

A one-purpose Chrome/Edge extension for [KUMA Listening Party](../README.md): it lets the karaoke room change the key
of the YouTube video playing on the host screen.

Only code running inside the YouTube embed can reach the video's audio, so this content script does that and nothing
else. The room page posts `{ source: "kuma-listening-party", type: "key", semitones }` to the embed; the script routes
the video through Web Audio into [Signalsmith Stretch](https://signalsmith-audio.co.uk/code/stretch/) (MIT, vendored in
`vendor/signalsmith-stretch.js`) and shifts the pitch with about 70 ms of latency. At key 0 nothing is processed.

- Permissions: none beyond the content script on `https://www.youtube-nocookie.com/embed/*`.
- No data is collected, stored or sent anywhere. The extension has no background page and no network calls.

## Install for testing

`npm run extension:zip` in the project root packs `public/kuma-karaoke-key.zip`. Unzip it, open `chrome://extensions`,
turn on Developer mode, press **Load unpacked** and pick the folder.

## Publishing to the Chrome Web Store

1. Upload the zip from `public/kuma-karaoke-key.zip` in the Chrome Web Store developer dashboard (one-time $5 fee).
2. Single purpose: "Change the musical key of the YouTube video playing in a KUMA Listening Party karaoke room."
3. Permission justification: the content script needs `www.youtube-nocookie.com` because the room's video plays there;
   the extension reads no page data and collects nothing.
4. After it is published, set `NEXT_PUBLIC_KARAOKE_EXTENSION_URL` to the store link in Vercel. The karaoke sidebar then
   shows a one-click install button instead of the zip and the manual steps.

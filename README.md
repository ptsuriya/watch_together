# KUMA Listening Party

Private YouTube rooms in three modes, styled with the KUMA honey-bear sticker theme from kumadesign.dev. The logo mark (`public/brand/kuma-party-mark.png`, `app/icon.png`, `app/apple-icon.png`) is the KUMA bear in headphones; the other bears in `public/illustrations/` and `public/stickers/` come from the kumadesign.dev asset set.

| Mode | Host screen | Everyone else |
| --- | --- | --- |
| **Watch together** (`watch`) | Video \| notes on top, members \| up next below | Same layout; their player follows the host. Anyone can queue, play, pause and skip; the notes hold the lyrics and the host can open them to everyone. |
| **Remote** (`remote`) | The shared TV or shared screen: the video takes the space, the QR stays in view, the queue shows the next few songs | A phone remote: add songs, play/pause, skip |
| **Karaoke** (`karaoke`) | Remote, plus the current key on screen and emoji flying up from the phones | Remote, plus key −/+ (0.5 per press, ±1 for a jump), reset and an emoji pad |

The host decides who may change the key: only the host, only whoever queued the song, or anyone in the room.

Songs crossfade into each other in every mode.

## Deploy to Vercel with Supabase Realtime

1. Create a Supabase project, then enable **Anonymous Sign-Ins** in **Authentication > Providers > Anonymous**.
2. In **Realtime > Settings**, disable **Allow public access to channels**. This forces the private-channel policies in the migration to be evaluated.
3. Run `supabase/migrations/20260909110000_room_realtime.sql` in the Supabase SQL Editor (or apply it with the Supabase CLI).
4. In Vercel, add these variables for **Production**, **Preview**, and **Development**:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
5. Redeploy. Do not use a Supabase `service_role` or secret key in Vercel browser variables.

If you use the Vercel Supabase Integration, its existing `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are supported automatically. The application works visually without either configuration, but realtime rooms remain disabled.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

## Realtime behavior

- The host page is the room's source of truth. Guests send requests (add, play, pause, skip, key, notes) and render the state the host broadcasts after every change, plus a heartbeat (every 4 s while a watch room plays, otherwise every 15 s).
- In watch mode a guest's player follows the host's position and corrects drift over 1.6 s. Browsers may block autoplay with sound until the person taps; the player then shows a "tap to play" button.
- Room state is live-only. If the host reloads, guests hand the queue back; a room with no host online does not play.
- `GET /api/video?id=` looks titles up through YouTube oEmbed and rejects videos that cannot be embedded before they reach the queue.

## Crossfade

Every mode keeps two YouTube players. When a song is within the crossfade of its end and something is queued, the next song starts on the second player while the first fades out; a manual skip uses a short 1.5 s fade instead. The host picks 0 (off), 3, 6 or 10 seconds next to the queue, and the setting travels with the room state so guests fade at the same time. iOS ignores `setVolume`, so players there switch without an overlap.

## Emoji bomb and flying messages

Every mode has an emoji pad: a tap broadcasts one `react` event and each screen throws a burst of that emoji, with the sender's name underneath. Ten emoji come with the room and everyone may add one of their own, kept on their device; anything that is a single emoji is accepted.

Messages fly across the screen the way comments do on Chinese streaming sites. On a shared TV (remote and karaoke) they cross the video itself; in watch mode they cross the whole page instead, picking heights that miss the player, so nobody's picture is covered. Emoji in watch mode rise in the strip under the video. The host switches messages off with **ข้อความวิ่ง** next to the queue, they are capped at 80 characters, and each person waits 1.5 s between them. Phones keep the last few in a list.

## Notes and lyrics

The host can paste lyrics into the notes, and everyone sees them live. **ให้เพื่อนในห้องช่วยเขียน** lets guests type in them too (last writer wins; incoming text is only adopted during a typing pause so the cursor does not jump). A− / A+ set the reading size, on the panel and in the full-screen view, and the size is remembered per device.

## Karaoke key changes

Pitch-shifting YouTube audio is only possible from inside the embed, so the key buttons need the **KUMA Karaoke Key** extension on the host screen (Chrome or Edge on a computer). Its source is in `extension/`, and `npm run extension:zip` packs `public/kuma-karaoke-key.zip`, which the karaoke sidebar offers for download.

Install while it is not on the Chrome Web Store yet: download the zip, unzip it, open `chrome://extensions`, turn on Developer mode, press **Load unpacked** and pick the folder. Set `NEXT_PUBLIC_KARAOKE_EXTENSION_URL` once the extension is published, and the sidebar shows a one-click store button instead.

How it works: the extension's content script runs in the `youtube-nocookie.com` embed, and the room posts `{source: "kuma-listening-party", type: "key", semitones}` to that frame. The script routes the video through Web Audio into [Signalsmith Stretch](https://signalsmith-audio.co.uk/code/stretch/) (MIT, vendored in `extension/vendor/`), which shifts the pitch with about 70 ms of latency. The main buttons move the key by half a semitone, with ±1 underneath for a bigger jump, up to twelve steps either way. At key 0 the audio is not processed at all, and while YouTube shows an ad the pitch shift steps aside so the ad plays exactly as YouTube sent it. Nothing is collected or sent anywhere; the extension asks for no permissions beyond that one site.

Without the extension the room still works: the key on the TV and on the phones changes, but the sound does not.

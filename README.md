# KUMA Listening Party

Private YouTube rooms in three modes, styled with the KUMA honey-bear sticker theme from kumadesign.dev. The logo mark (`public/brand/kuma-party-mark.png`, `app/icon.png`, `app/apple-icon.png`) is the KUMA bear in headphones; the other bears in `public/illustrations/` and `public/stickers/` come from the kumadesign.dev asset set.

| Mode | Host screen | Everyone else |
| --- | --- | --- |
| **Watch together** (`watch`) | Video \| notes on top, members \| up next below | Same layout; their player follows the host. Anyone can queue, play, pause and skip. Only the host edits the notes (e.g. lyrics), which anyone can open large. |
| **Remote** (`remote`) | The shared TV or shared screen: the video takes the space, the QR stays in view, the queue shows the next few songs | A phone remote: add songs, play/pause, skip |
| **Karaoke** (`karaoke`) | Remote, plus the current key on screen and a MIDI bridge to the Transpose extension | Remote, plus key −/+ and reset |

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

- The host page is the room's source of truth. Guests send requests (add, play, pause, skip, key) and render the state the host broadcasts after every change, plus a heartbeat (every 4 s while a watch room plays, otherwise every 15 s).
- In watch mode a guest's player follows the host's position and corrects drift over 1.6 s. Browsers may block autoplay with sound until the person taps; the player then shows a "tap to play" button.
- Room state is live-only. If the host reloads, guests hand the queue back; a room with no host online does not play.
- `GET /api/video?id=` looks titles up through YouTube oEmbed and rejects videos that cannot be embedded before they reach the queue.

## Karaoke key changes with Transpose

The [Transpose](https://transpose.video/) extension has no API for web pages, but it can learn MIDI buttons. In karaoke mode the host page sends the phone's key changes to a virtual MIDI port with Web MIDI (Chrome or Edge on a computer), and Transpose listens on the same port:

1. Create a virtual port: on macOS open Audio MIDI Setup › Window › Show MIDI Studio, open **IAC Driver** and tick **Device is online**; on Windows install loopMIDI and add a port.
2. In the karaoke room, open **ต่อ Transpose** in the sidebar, press **เชื่อมต่อ MIDI** and pick that port.
3. In Transpose, open the Side panel › Settings › enable MIDI shortcuts › Connect MIDI › pick the same port.
4. Press **Learn** next to Transpose − and then **ทดสอบคีย์ลง** in the room (it sends after a 3-second countdown). Repeat for Transpose + with **ทดสอบคีย์ขึ้น**. The notes are C4 (60) for down and D4 (62) for up.
5. Keep the Transpose Side panel open while singing, and leave *Remember adjustments* on **Do not save** so each new song starts in its original key, as the room assumes.

If Transpose cannot hear the embedded player, allow it on both this site and `youtube-nocookie.com`, or use its Tab Audio mode. Without the bridge the room still works: the key shown on the TV tells the host what to set in Transpose.

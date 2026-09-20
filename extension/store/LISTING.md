# Chrome Web Store submission — KUMA Karaoke Key

Everything needed for the listing. Upload `public/kuma-karaoke-key.zip` (rebuild it with `npm run extension:zip`).

## Store listing

**Item name:** KUMA Karaoke Key

**Short description (132 characters max):**

> เปลี่ยนคีย์เพลงคาราโอเกะบนจอกลางจากมือถือ ใช้คู่กับห้อง KUMA Listening Party

English alternative:

> Change the key of the karaoke song on the host screen, straight from your phone, in a KUMA Listening Party room.

**Category:** Entertainment (fallback: Just for fun)

**Language:** Thai, with English in the description

**Detailed description:**

> ส่วนเสริมนี้ทำงานคู่กับห้องคาราโอเกะของ KUMA Listening Party
>
> เปิดห้องคาราโอเกะบนคอมที่ต่อทีวี เพื่อนสแกน QR เข้ามาด้วยมือถือ แล้วกดปุ่มเพิ่ม-ลดคีย์จากมือถือได้เลย เสียงเพลงบนจอกลางจะเปลี่ยนคีย์ตามทันที โดยความเร็วเพลงไม่เปลี่ยน
>
> • ติดตั้งครั้งเดียว ไม่ต้องตั้งค่าอะไรเพิ่ม
> • ปรับได้ทีละครึ่งเสียง หรือละเอียดทีละ 0.5 ขั้น สูงสุด 12 ขั้นทั้งขึ้นและลง และกดกลับคีย์ต้นฉบับได้
> • เพลงใหม่เริ่มที่คีย์ต้นฉบับเสมอ
> • ตอนคีย์เป็น 0 ส่วนเสริมไม่แตะเสียงเลย และตอนโฆษณาของ YouTube เล่น ส่วนเสริมจะหยุดทำงานชั่วคราว ไม่บล็อก ไม่ข้าม ไม่แก้โฆษณา
> • ไม่เก็บข้อมูลใด ๆ ไม่มีการส่งข้อมูลออกไปที่ไหน ขอสิทธิ์แค่หน้าวิดีโอ youtube-nocookie.com เท่านั้น
>
> วิธีใช้
> 1. เปิด KUMA Listening Party บนคอมที่เป็นจอกลาง แล้วสร้างห้องโหมดคาราโอเกะ
> 2. ติดตั้งส่วนเสริมนี้ แล้วรีเฟรชหน้าห้อง จะขึ้นว่า “ส่วนเสริมเปลี่ยนคีย์พร้อมแล้ว”
> 3. ให้เพื่อนสแกน QR บนจอ แล้วกดคีย์จากมือถือได้เลย
>
> —
>
> This extension works with karaoke rooms in KUMA Listening Party. Open a karaoke room on the computer connected to your TV, let everyone scan the QR code with their phones, and the key buttons on their phones shift the pitch of the song on the shared screen — without changing its speed.
>
> • One-time install, nothing to configure
> • A half step, or a fine 0.5 step, at a time — up to 12 steps either way, plus reset to the original key
> • Every new song starts in its original key
> • At key 0 the audio is not processed at all, and while a YouTube ad plays the pitch shift steps aside — ads are never blocked, skipped or altered
> • Collects nothing, sends nothing anywhere, and asks for one site only: youtube-nocookie.com

**Homepage URL:** the deployed KUMA Listening Party URL

**Support URL:** https://github.com/ptsuriya/watch_together

## Graphics

- Store icon 128×128: `extension/icons/icon-128.png`
- Screenshots 1280×800: `screenshot-1-tv.png`, `screenshot-2-emoji.png`, `screenshot-3-phone.png` (this folder)

## Privacy practices tab

**Single purpose:**

> Change the musical key of the YouTube video playing inside a KUMA Listening Party karaoke room, so people can sing in a key that fits their voice.

**Permission justification — host permission for `https://www.youtube-nocookie.com/embed/*`:**

> The room plays its video in a YouTube embed on that domain. Only a content script inside that frame can reach the video element's audio, which the extension routes through Web Audio to shift its pitch. The extension needs no other site, no tabs permission, no storage and no background page.

**Remote code:** No — all code, including the pitch-shifting library, ships inside the package.

**Data usage:** Nothing is collected. Tick "I do not sell or transfer user data to third parties", "I do not use or transfer user data for purposes unrelated to my item's single purpose", and "I do not use or transfer user data to determine creditworthiness or for lending purposes".

**Privacy policy URL:** `<your deployed URL>/privacy` (the page lives at `app/privacy/page.tsx`)

## After it is published

Set `NEXT_PUBLIC_KARAOKE_EXTENSION_URL` in Vercel to the store link. The karaoke sidebar then shows a one-click
"ติดตั้งจาก Chrome Web Store" button instead of the zip download and the manual steps.

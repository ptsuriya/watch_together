import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Art, Brand } from "../components/ui";

export const metadata: Metadata = {
  title: "ความเป็นส่วนตัว — KUMA Listening Party",
  description: "KUMA Listening Party และส่วนเสริม KUMA Karaoke Key ไม่เก็บข้อมูลส่วนตัวของผู้ใช้",
};

const UPDATED = "20 กันยายน 2026";

export default function PrivacyPage() {
  return (
    <div className="home">
      <header className="site-header">
        <div className="container site-header-inner">
          <Brand />
          <Link href="/" className="btn btn-secondary btn-sm"><ArrowLeft size={16} aria-hidden="true" /> กลับหน้าแรก</Link>
        </div>
      </header>

      <main className="container legal">
        <h1>ความเป็นส่วนตัว</h1>
        <p className="legal-updated">อัปเดตล่าสุด {UPDATED}</p>

        <section>
          <h2>เว็บ KUMA Listening Party</h2>
          <ul>
            <li>ไม่ต้องสมัครสมาชิก ไม่ขออีเมลหรือเบอร์โทร</li>
            <li>ชื่อที่ตั้งเองกับขนาดตัวอักษรของโน้ต เก็บไว้ในเบราว์เซอร์ของคุณเท่านั้น</li>
            <li>ห้อง คิวเพลง โน้ต และคีย์ ส่งผ่านบริการเรียลไทม์ของ Supabase เพื่อให้คนในห้องเห็นตรงกัน และหายไปเมื่อโฮสต์ปิดหน้า ไม่มีการบันทึกเป็นประวัติ</li>
            <li>วิดีโอเล่นผ่าน youtube-nocookie.com ซึ่งเป็นโหมดความเป็นส่วนตัวของ YouTube</li>
            <li>ไม่มีโฆษณา ไม่มีตัวติดตาม ไม่มีการขายข้อมูล</li>
          </ul>
        </section>

        <section>
          <h2>ส่วนเสริม KUMA Karaoke Key</h2>
          <ul>
            <li>ส่วนเสริมทำงานเฉพาะในหน้าวิดีโอ youtube-nocookie.com ที่ฝังอยู่ในห้องของคุณ เพื่อปรับคีย์เสียงเท่านั้น</li>
            <li>ไม่เก็บ ไม่บันทึก และไม่ส่งข้อมูลใดออกไปที่ไหนเลย ไม่มีเซิร์ฟเวอร์ของตัวเอง ไม่มีการเชื่อมต่อเครือข่าย</li>
            <li>ไม่อ่านประวัติการใช้งาน ไม่อ่านคุกกี้ ไม่อ่านข้อมูลบัญชี</li>
            <li>ขอสิทธิ์เพียงอย่างเดียวคือทำงานในหน้า youtube-nocookie.com/embed</li>
            <li>ซอร์สโค้ดเปิดให้ตรวจสอบได้ที่ <a href="https://github.com/ptsuriya/watch_together/tree/main/extension" target="_blank" rel="noopener noreferrer">GitHub</a></li>
          </ul>
        </section>

        <section>
          <h2>English summary</h2>
          <p>
            KUMA Listening Party needs no account and keeps no history: a room&apos;s queue, notes and key live only while
            the host page is open. The KUMA Karaoke Key extension runs only inside the YouTube embed of a room, purely to
            shift the audio pitch. It collects no data, stores no data, sends nothing anywhere, and requests no permission
            beyond that single site.
          </p>
        </section>

        <p className="legal-contact">มีคำถาม ติดต่อ <a href="mailto:ptsuriyarangsri@gmail.com">ptsuriyarangsri@gmail.com</a></p>
        <Art name="sleeping" className="legal-bear" sizes="160px" />
      </main>
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Art, Brand } from "../components/ui";

export const metadata: Metadata = {
  title: "ร้องพร้อมกันด้วย Jamulus — KUMA Listening Party",
  description: "วิธีใช้ Jamulus เป็นห้องเสียงคู่กับห้อง KUMA เพื่อร้องคาราโอเกะพร้อมกันคนละบ้าน พร้อมค่าที่ต้องตั้งและวิธีจูนให้เสียงตรงเพลง",
};

export default function JamulusPage() {
  return (
    <div className="home">
      <header className="site-header">
        <div className="container site-header-inner">
          <Brand />
          <Link href="/" className="btn btn-secondary btn-sm"><ArrowLeft size={16} aria-hidden="true" /> กลับหน้าแรก</Link>
        </div>
      </header>

      <main className="container legal">
        <h1>ร้องพร้อมกันคนละบ้านด้วย Jamulus</h1>
        <p className="legal-updated">
          Discord กับ Meet ส่งเสียงช้าเกินกว่าจะร้องพร้อมกัน (ราว 0.2–0.5 วินาที) Jamulus ทำมาเพื่อวงดนตรีซ้อมออนไลน์
          ดีเลย์เหลือราว 20–50 มิลลิวินาที ซึ่งร้องพร้อมกันได้จริง — ใช้คู่กับห้อง KUMA: <strong>Jamulus ส่งเสียงคน</strong>,
          <strong> KUMA เปิดเพลง คิว เนื้อร้อง คีย์ และคะแนน</strong>
        </p>

        <section>
          <h2>ต้องมีอะไรบ้าง</h2>
          <ul>
            <li><strong>หูฟัง</strong> ทุกคน ไม่มีข้อยกเว้น ถ้าเปิดลำโพงเสียงจะวนกลับเข้าไมค์แล้วหอนทั้งวง</li>
            <li>แอป Jamulus (ฟรี โอเพนซอร์ส) ลงได้ทั้ง Windows, macOS, Linux, Android — <a href="https://jamulus.io/" target="_blank" rel="noopener noreferrer">jamulus.io</a> มีคู่มือภาษาไทยด้วย</li>
            <li>สายแลนถ้าทำได้ ไวไฟเพิ่มดีเลย์และทำให้เสียงสะดุด</li>
            <li>ที่อยู่เซิร์ฟเวอร์ที่ทุกคนจะเข้าให้ตรงกัน (อ่านหัวข้อถัดไป)</li>
          </ul>
        </section>

        <section>
          <h2>เลือกเซิร์ฟเวอร์</h2>
          <ul>
            <li><strong>เซิร์ฟเวอร์สาธารณะ</strong> — มีให้เลือกในแอปเลย ไม่ต้องตั้งอะไร แต่คนแปลกหน้าเข้ามาได้ เหมาะกับลองเล่นครั้งแรก เลือกตัวที่ ping ต่ำสุด</li>
            <li><strong>เซิร์ฟเวอร์ที่ไม่ประกาศในสารบบ</strong> — ใครก็เข้าไม่ได้ถ้าไม่รู้ที่อยู่ เหมาะกับปาร์ตี้ส่วนตัว ตั้งได้จากแอป Jamulus เครื่องใดเครื่องหนึ่ง (ต้องเปิดพอร์ต UDP 22124 ที่เราเตอร์) หรือเช่าโฮสต์เล็กๆ ราคาหลักร้อยต่อเดือน</li>
            <li>ได้ที่อยู่แล้วเอาไปใส่ในกล่อง <strong>ตั้งค่าห้อง → ห้องเสียง (Jamulus)</strong> ของห้อง KUMA แล้วทุกคนในห้องจะเห็นที่อยู่เดียวกันพร้อมปุ่มคัดลอก</li>
          </ul>
        </section>

        <section>
          <h2>ตั้งค่าครั้งแรก (ทำครั้งเดียว)</h2>
          <ol>
            <li>เปิด Jamulus แล้วตั้งชื่อตัวเองให้ตรงกับชื่อในห้อง KUMA จะได้รู้ว่าใครเป็นใคร</li>
            <li><strong>Settings → Audio</strong> เลือกไมค์กับหูฟังให้ถูกตัว แล้วตั้ง <strong>Buffer Delay = 128</strong> (ถ้าเครื่องแรงและเสียงไม่สะดุดค่อยลดเป็น 64 จะหน่วงน้อยลงอีก)</li>
            <li>Windows: ถ้าเสียงหน่วงมาก ให้ลง ASIO4ALL หรือใช้การ์ดเสียงที่มีไดรเวอร์ ASIO — Jamulus ใช้ ASIO เท่านั้นบนวินโดวส์</li>
            <li>กด <strong>Connection Setup</strong> วางที่อยู่เซิร์ฟเวอร์จากห้อง KUMA แล้วกด Connect</li>
            <li>พูดทดสอบ ดูแถบระดับเสียงไม่ให้ชนแดง ถ้ายังไม่อยากให้ใครได้ยินให้กด <strong>Mute Myself</strong> ไว้ก่อน</li>
          </ol>
        </section>

        <section>
          <h2>เวลาร้องจริง</h2>
          <ol>
            <li>ทุกคนเปิดห้อง KUMA โหมด <strong>คาราโอเกะด้วยกัน</strong> ไว้ที่เครื่องตัวเอง — เพลงเล่นจากเครื่องตัวเอง ไม่ต้องส่งเข้า Jamulus</li>
            <li>ฟังเสียงเพื่อนจาก Jamulus และฟังเพลงจากห้อง KUMA พร้อมกัน ปรับระดับให้พอดีกันเอง</li>
            <li>ถ้ารู้สึกว่าเสียงเพื่อนกับเพลงไม่ตรงจังหวะ ใช้แถบ <strong>ปรับหน่วงเวลา</strong> ใต้ตัวเล่นในห้อง KUMA ขยับทีละ 0.1 วินาทีจนตรง — ต่างคนต่างจูนของตัวเอง เพราะดีเลย์ของแต่ละคนไม่เท่ากัน</li>
            <li>ในแอป Jamulus ปรับระดับเสียงของเพื่อนแต่ละคนได้แยกกัน ใครดังไปก็หรี่เฉพาะคนนั้น</li>
          </ol>
          <p>
            อย่าเปิดเพลงส่งเข้า Jamulus ให้คนอื่นฟัง แม้จะทำได้ทางเทคนิค เพราะเท่ากับส่งต่อเสียงของ YouTube ให้คนอื่น
            ผิดเงื่อนไขการใช้งานชัดเจน แถมเสียงถูกบีบสองต่อจนแย่กว่าเปิดเองที่เครื่อง
          </p>
        </section>

        <section>
          <h2>เจอปัญหาบ่อย ๆ</h2>
          <ul>
            <li><strong>เสียงหอน</strong> — มีคนเปิดลำโพง ให้ทุกคนใส่หูฟัง</li>
            <li><strong>เสียงขาดเป็นช่วง</strong> — เพิ่ม Buffer Delay เป็น 128 หรือ 256 และเปลี่ยนจากไวไฟเป็นสายแลน</li>
            <li><strong>หน่วงมากจนร้องไม่ทัน</strong> — เลือกเซิร์ฟเวอร์ที่ ping ต่ำกว่า (ใกล้บ้านกว่า) ลด Buffer ลง และปิดโปรแกรมที่กินเน็ต</li>
            <li><strong>คนอื่นไม่ได้ยินเรา</strong> — ยังกด Mute Myself ค้างอยู่ หรือเลือกไมค์ผิดตัวใน Settings</li>
            <li><strong>เสียงเพลงกับเสียงคนไม่ตรง</strong> — ปรับที่แถบปรับหน่วงเวลาในห้อง KUMA ไม่ใช่ที่ Jamulus</li>
          </ul>
        </section>

        <p className="legal-contact">มีคำถาม ติดต่อ <a href="mailto:ptsuriyarangsri@gmail.com">ptsuriyarangsri@gmail.com</a></p>
        <Art name="party" className="legal-bear" sizes="160px" />
      </main>
    </div>
  );
}

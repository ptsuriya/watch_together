import type { Metadata, Viewport } from "next";
import { Kanit } from "next/font/google";
import "./globals.css";

const kanit = Kanit({
  subsets: ["latin", "thai"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "KUMA Listening Party — ดูยูทูบ ฟังเพลง ร้องคาราโอเกะด้วยกัน",
  description: "ปาร์ตี้ฟังเพลงกับหมี KUMA เปิดห้องดู YouTube พร้อมกันกับเพื่อน ใช้ทีวีเป็นจอกลางให้ทุกคนเพิ่มเพลงจากมือถือ หรือร้องคาราโอเกะแล้วปรับคีย์จากมือถือ ไม่ต้องสมัคร",
  applicationName: "KUMA Listening Party",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FDF6EC",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th" data-scroll-behavior="smooth">
      <body className={kanit.className}>{children}</body>
    </html>
  );
}

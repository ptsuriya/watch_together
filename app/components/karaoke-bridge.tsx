"use client";

import { Cable } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { KEY_DOWN_NOTE, KEY_UP_NOTE, type MidiBridge, type MidiStatus } from "../../lib/midi-bridge";

const TEST_COUNTDOWN_S = 3;

const STATUS_LABEL: Record<MidiStatus, string> = {
  unsupported: "ไม่รองรับ",
  idle: "ยังไม่เชื่อม",
  requesting: "กำลังขอสิทธิ์",
  denied: "ไม่ได้รับสิทธิ์",
  "no-port": "ไม่พบพอร์ต",
  ready: "พร้อม",
};

/**
 * Host-only setup for sending phone key changes to the Transpose extension through a virtual MIDI port.
 * Without it the room still works: the key shown on the TV tells the host what to set in Transpose.
 */
export function KaraokeBridge({ midi, onCalibrate }: { midi: MidiBridge; onCalibrate: () => void }) {
  const selectId = useId();
  const [test, setTest] = useState<{ step: 1 | -1; left: number } | null>(null);
  const { status, ports, portId, selectPort, connect, sendSteps } = midi;

  useEffect(() => {
    if (!test) return;
    const timeoutId = window.setTimeout(() => {
      if (test.left > 1) {
        setTest({ ...test, left: test.left - 1 });
        return;
      }
      sendSteps(test.step);
      setTest(null);
    }, 1000);
    return () => window.clearTimeout(timeoutId);
  }, [sendSteps, test]);

  return (
    <details className="bridge" open={status !== "ready"}>
      <summary>
        <Cable size={18} aria-hidden="true" />
        <span>ต่อ Transpose ปรับคีย์จากมือถือ</span>
        <span className={`bridge-status bridge-${status}`}>{STATUS_LABEL[status]}</span>
      </summary>

      <div className="bridge-body">
        {status === "unsupported" && (
          <p className="bridge-note">
            เบราว์เซอร์นี้ไม่มี Web MIDI ใช้ Chrome หรือ Edge บนคอมพิวเตอร์ที่เป็นจอกลาง
            ระหว่างนี้ป้ายคีย์บนจอยังเปลี่ยนตามมือถือ ให้โฮสต์ปรับใน Transpose ตามได้
          </p>
        )}
        {(status === "idle" || status === "requesting" || status === "denied") && (
          <>
            <button type="button" className="btn btn-honey btn-sm" onClick={connect} disabled={status === "requesting"}>
              <Cable size={16} aria-hidden="true" /> เชื่อมต่อ MIDI
            </button>
            {status === "denied" && <p className="bridge-note is-error">เบราว์เซอร์ไม่อนุญาต MIDI เปิดสิทธิ์ MIDI ของเว็บนี้ในการตั้งค่าไซต์ แล้วลองใหม่</p>}
          </>
        )}
        {status === "no-port" && <p className="bridge-note is-error">ยังไม่พบพอร์ต MIDI เปิดพอร์ตเสมือนตามขั้นที่ 1 ก่อน รายการจะอัปเดตเอง</p>}
        {status === "ready" && (
          <>
            <label htmlFor={selectId} className="field-label">ส่งไปที่พอร์ต</label>
            <select id={selectId} className="field" value={portId ?? ""} onChange={(event) => selectPort(event.target.value)}>
              {ports.map((port) => <option key={port.id} value={port.id}>{port.name}</option>)}
            </select>
            <div className="bridge-tests">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTest({ step: -1, left: TEST_COUNTDOWN_S })} disabled={test !== null}>
                {test?.step === -1 ? `ส่งใน ${test.left}…` : "ทดสอบคีย์ลง"}
              </button>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setTest({ step: 1, left: TEST_COUNTDOWN_S })} disabled={test !== null}>
                {test?.step === 1 ? `ส่งใน ${test.left}…` : "ทดสอบคีย์ขึ้น"}
              </button>
            </div>
            <button type="button" className="text-btn" onClick={onCalibrate}>คีย์ไม่ตรงกัน? รีเซ็ตใน Transpose แล้วกดตรงนี้เพื่อตั้งแอปเป็น 0</button>
          </>
        )}

        <ol className="bridge-steps">
          <li>
            เปิดพอร์ต MIDI เสมือน — Mac: Audio MIDI Setup › Window › Show MIDI Studio › ดับเบิลคลิก IAC Driver › ติ๊ก
            “Device is online” · Windows: ติดตั้ง loopMIDI แล้วกด + สร้างพอร์ต
          </li>
          <li>กด “เชื่อมต่อ MIDI” ที่นี่ แล้วเลือกพอร์ตนั้น</li>
          <li>ใน Transpose เปิดแบบ Side panel › Settings › เปิด MIDI shortcuts › Connect MIDI › เลือกพอร์ตเดียวกัน</li>
          <li>
            กด Learn ข้าง Transpose − แล้วกด “ทดสอบคีย์ลง” ที่นี่ (ส่งหลังนับ 3) ทำซ้ำกับ Transpose + และ “ทดสอบคีย์ขึ้น”
          </li>
          <li>เปิด Side panel ของ Transpose ค้างไว้ระหว่างร้อง ถ้าปิด Transpose จะไม่ได้รับสัญญาณ</li>
        </ol>
        <p className="bridge-note">
          ถ้า Transpose จับเสียงวิดีโอในหน้านี้ไม่ได้ ให้อนุญาตทั้งเว็บนี้และ youtube-nocookie.com หรือใช้โหมด Tab Audio ·
          ตั้ง Remember adjustments เป็น “Do not save” เพื่อให้เพลงใหม่เริ่มที่คีย์ต้นฉบับตรงกับแอป ·
          โน้ตที่ส่ง: C4 ({KEY_DOWN_NOTE}) = คีย์ลง, D4 ({KEY_UP_NOTE}) = คีย์ขึ้น
        </p>
      </div>
    </details>
  );
}

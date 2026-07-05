"use client";

// 기기(안드로이드/아이폰)의 시스템 시간 표기 설정에 따라 네이티브 <input type="time">이
// 오전/오후 없이 24시간제로 뜨는 경우가 있어, 항상 동일하게 동작하는 커스텀 선택기를 쓴다.

const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

function parse(value: string): { ampm: "오전" | "오후"; hour12: number; minute: string } {
  const [hStr, mStr] = value.split(":");
  const h = Number(hStr) || 0;
  const ampm: "오전" | "오후" = h < 12 ? "오전" : "오후";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  const minute = MINUTES.includes(mStr) ? mStr : "00";
  return { ampm, hour12, minute };
}

function toValue(ampm: "오전" | "오후", hour12: number, minute: string): string {
  let h = hour12 % 12;
  if (ampm === "오후") h += 12;
  return `${String(h).padStart(2, "0")}:${minute}`;
}

export default function TimePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { ampm, hour12, minute } = parse(value || "09:00");
  const select = "rounded-xl border border-zinc-300 bg-white px-2 py-2 text-sm";

  return (
    <div className="flex gap-2">
      <select
        className={select}
        value={ampm}
        onChange={(e) => onChange(toValue(e.target.value as "오전" | "오후", hour12, minute))}
      >
        <option value="오전">오전</option>
        <option value="오후">오후</option>
      </select>
      <select
        className={select}
        value={hour12}
        onChange={(e) => onChange(toValue(ampm, Number(e.target.value), minute))}
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>
            {h}시
          </option>
        ))}
      </select>
      <select
        className={select}
        value={minute}
        onChange={(e) => onChange(toValue(ampm, hour12, e.target.value))}
      >
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}분
          </option>
        ))}
      </select>
    </div>
  );
}

"use client";

import { KIT_COLOR_OPTIONS } from "@/lib/kitColors";

export default function KitColorPicker({
  value,
  onChange,
  remembered,
}: {
  value: string;
  onChange: (v: string) => void;
  // 같은 이름의 상대팀으로 저장된 과거 색깔이 있으면 힌트로 보여준다.
  remembered?: string;
}) {
  return (
    <div>
      <label className="text-xs font-semibold text-zinc-500">
        상대팀 유니폼 색깔
      </label>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {KIT_COLOR_OPTIONS.map((c) => (
          <button
            key={c.name}
            type="button"
            onClick={() => onChange(value === c.name ? "" : c.name)}
            title={c.recommended ? `${c.name} (하늘색·검정 대비 추천)` : c.name}
            className={`flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${
              value === c.name
                ? "border-blue-600 bg-blue-50 text-blue-800"
                : "border-zinc-300 bg-white text-zinc-600"
            }`}
          >
            <span
              className="h-3 w-3 rounded-full border border-zinc-300"
              style={{ backgroundColor: c.hex }}
            />
            {c.name}
            {c.recommended && <span className="text-[10px] text-emerald-600">추천</span>}
          </button>
        ))}
      </div>
      <input
        className="mt-1.5 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
        placeholder="직접 입력 (예: 형광 주황)"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {remembered && remembered !== value && (
        <button
          type="button"
          onClick={() => onChange(remembered)}
          className="mt-1 text-xs text-blue-700 underline"
        >
          이 팀 지난 기록: {remembered} (눌러서 적용)
        </button>
      )}
    </div>
  );
}

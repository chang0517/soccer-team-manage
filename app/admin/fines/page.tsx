"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/useSession";

interface FineNotice {
  memberId: number;
  name: string;
  phone: string | null;
  missedEvents: { id: number; title: string; date: string }[];
  message: string;
}

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export default function FinesPage() {
  const { user, loading } = useSession();
  const [{ year, month }, setYearMonth] = useState(currentYearMonth());
  const [notices, setNotices] = useState<FineNotice[]>([]);
  const [busy, setBusy] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  const load = async () => {
    setBusy(true);
    const res = await fetch(`/api/admin/monthly-nonvoters?year=${year}&month=${month}`);
    const data = await res.json();
    setNotices(Array.isArray(data.notices) ? data.notices : []);
    setBusy(false);
  };

  useEffect(() => {
    if (user?.role === "admin") load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, year, month]);

  const copy = async (n: FineNotice) => {
    await navigator.clipboard.writeText(n.message);
    setCopiedId(n.memberId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  if (loading) return null;
  if (!user || user.role !== "admin") {
    return (
      <div className="space-y-3 pt-10 text-center">
        <p className="text-sm text-zinc-500">운영진만 볼 수 있는 페이지예요.</p>
        <Link href="/" className="font-semibold text-blue-700">
          홈으로
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">이번 달 미투표자 · 벌금 안내</h1>
        <Link href="/admin" className="text-sm text-blue-700">
          ← 운영진
        </Link>
      </div>
      <p className="rounded-xl bg-zinc-100 px-3 py-2 text-xs text-zinc-500">
        레이븐 회칙상 그 달 경기 투표는 그 달 1일 자정까지 완료해야 해요. 아래는
        선택한 달의 경기 중 하나라도 투표하지 않은 정식 멤버 목록이에요(용병
        제외). 문자는 여기서 자동으로 나가지 않고, 맥미니 자동발송 스크립트가
        별도로 처리하거나 아래 메시지를 복사해서 직접 보낼 수 있어요.
      </p>

      <div className="flex items-center gap-2">
        <select
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          value={year}
          onChange={(e) => setYearMonth({ year: Number(e.target.value), month })}
        >
          {[year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>
              {y}년
            </option>
          ))}
        </select>
        <select
          className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
          value={month}
          onChange={(e) => setYearMonth({ year, month: Number(e.target.value) })}
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((mo) => (
            <option key={mo} value={mo}>
              {mo}월
            </option>
          ))}
        </select>
        {busy && <span className="text-xs text-zinc-400">불러오는 중…</span>}
      </div>

      {!busy && notices.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400">
          {year}년 {month}월엔 미투표자가 없어요. 🎉
        </p>
      )}

      <div className="space-y-3">
        {notices.map((n) => (
          <div key={n.memberId} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="font-bold">
                {n.name}
                {!n.phone && (
                  <span className="ml-1.5 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                    번호 없음
                  </span>
                )}
              </p>
              <button
                onClick={() => copy(n)}
                className="rounded-lg bg-blue-700 px-3 py-1 text-xs font-semibold text-white"
              >
                {copiedId === n.memberId ? "복사됨!" : "메시지 복사"}
              </button>
            </div>
            {n.phone && <p className="mt-0.5 text-xs text-zinc-400">{n.phone}</p>}
            <p className="mt-1 text-xs text-zinc-500">
              미투표 경기:{" "}
              {n.missedEvents.map((e) => `${e.title}(${e.date})`).join(", ")}
            </p>
            <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-zinc-50 p-3 text-xs text-zinc-600">
              {n.message}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

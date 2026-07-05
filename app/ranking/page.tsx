"use client";

import { useEffect, useState } from "react";
import type { RankingRow } from "@/lib/types";

export default function RankingPage() {
  const [rows, setRows] = useState<RankingRow[]>([]);

  useEffect(() => {
    fetch("/api/ranking").then((r) => r.json()).then(setRows);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">시즌 랭킹</h1>
      <p className="rounded-xl bg-zinc-100 px-3 py-2 text-xs text-zinc-500">
        출전 1점 · 골 1점 · 어시스트 1점 · 클린시트 시 GK·센터백·윙백 1점,
        수비형 미드필더 0.5점
      </p>
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
              <th className="px-3 py-2.5">순위</th>
              <th className="px-2 py-2.5">이름</th>
              <th className="px-2 py-2.5 text-center">출전</th>
              <th className="px-2 py-2.5 text-center">골</th>
              <th className="px-2 py-2.5 text-center">어시</th>
              <th className="px-2 py-2.5 text-center">CS</th>
              <th className="px-3 py-2.5 text-right">총점</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.member.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-3 py-2 font-bold text-zinc-400">
                  {["🥇", "🥈", "🥉"][i] ?? i + 1}
                </td>
                <td className="px-2 py-2 font-semibold">
                  {r.member.name}
                  {r.member.backNo != null && (
                    <span className="ml-1 text-xs text-zinc-400">
                      #{r.member.backNo}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">{r.played}</td>
                <td className="px-2 py-2 text-center">{r.goals}</td>
                <td className="px-2 py-2 text-center">{r.assists}</td>
                <td className="px-2 py-2 text-center">{r.cleanPts}</td>
                <td className="px-3 py-2 text-right font-bold text-emerald-700">
                  {r.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

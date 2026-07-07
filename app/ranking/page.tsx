"use client";

import { useEffect, useState } from "react";
import type { PosCategory, RankingRow } from "@/lib/types";
import { POS_CATEGORY, POS_CATEGORY_LABELS } from "@/lib/types";

const TABS: { key: PosCategory | "ALL"; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "ATT", label: "공격" },
  { key: "MID", label: "미드필더" },
  { key: "DEF", label: "수비" },
];

type SortKey = "played" | "goals" | "assists" | "cleanPts" | "mvpCount" | "total";

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "played", label: "출전" },
  { key: "goals", label: "골" },
  { key: "assists", label: "어시" },
  { key: "cleanPts", label: "CS" },
  { key: "mvpCount", label: "MVP" },
  { key: "total", label: "총점" },
];

export default function RankingPage() {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [tab, setTab] = useState<PosCategory | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetch("/api/ranking").then((r) => r.json()).then(setRows);
  }, []);

  const mvpRanking = rows
    .filter((r) => r.mvpCount > 0)
    .sort((a, b) => b.mvpCount - a.mvpCount);

  const visibleRows = (
    tab === "ALL" ? rows : rows.filter((r) => POS_CATEGORY[r.member.pos1] === tab)
  )
    .slice()
    .sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === "asc" ? diff : -diff;
    });

  const clickSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">시즌 랭킹</h1>
      <p className="rounded-xl bg-zinc-100 px-3 py-2 text-xs text-zinc-500">
        출전 1.5점 · 골 1.4점 · 어시스트 1.25점 · 클린시트 시 GK·센터백·윙백
        1.25점, 수비형 미드필더 0.625점
      </p>

      <div className="grid grid-cols-4 gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl py-2 text-sm font-semibold ${
              tab === t.key
                ? "bg-emerald-700 text-white"
                : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab !== "ALL" && (
        <p className="-mt-2 text-xs text-zinc-400">
          1순위 포지션이 {POS_CATEGORY_LABELS[tab]}인 선수만 표시돼요.
        </p>
      )}

      {mvpRanking.length > 0 && (
        <div className="rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-bold text-zinc-500">
            MVP 최다 선정
          </h2>
          <div className="space-y-1.5">
            {mvpRanking.map((r, i) => (
              <div key={r.member.id} className="flex items-center gap-2 text-sm">
                <span className="w-6 text-center">
                  {["🥇", "🥈", "🥉"][i] ?? i + 1}
                </span>
                <span className="flex-1 font-semibold">{r.member.name}</span>
                <span className="font-bold text-amber-600">
                  {r.mvpCount}회
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
              <th className="px-3 py-2.5">순위</th>
              <th className="px-2 py-2.5">이름</th>
              {SORT_COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className={`px-2 py-2.5 ${c.key === "total" ? "text-right" : "text-center"}`}
                >
                  <button
                    onClick={() => clickSort(c.key)}
                    className={`inline-flex items-center gap-0.5 font-semibold ${
                      sortKey === c.key ? "text-emerald-700" : "text-zinc-500"
                    }`}
                  >
                    {c.label}
                    <span className="text-[10px]">
                      {sortKey === c.key ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((r, i) => (
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
                  {r.streak >= 3 && (
                    <span
                      className="ml-1 text-xs font-bold text-orange-500"
                      title={`최근 ${r.streak}경기 연속 ${r.streakType === "goal" ? "골" : "어시스트"}`}
                    >
                      🔥{r.streak}
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">{r.played}</td>
                <td className="px-2 py-2 text-center">{r.goals}</td>
                <td className="px-2 py-2 text-center">{r.assists}</td>
                <td className="px-2 py-2 text-center">{r.cleanPts}</td>
                <td className="px-2 py-2 text-center">{r.mvpCount}</td>
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

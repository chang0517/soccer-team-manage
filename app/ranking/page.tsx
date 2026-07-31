"use client";

import { useEffect, useState } from "react";
import type { PosCategory, RankingRow } from "@/lib/types";
import { POS_CATEGORY, POS_CATEGORY_LABELS } from "@/lib/types";
import { seasonLabel } from "@/lib/season";

const TABS: { key: PosCategory | "ALL"; label: string }[] = [
  { key: "ALL", label: "전체" },
  { key: "ATT", label: "공격" },
  { key: "MID", label: "미드필더" },
  { key: "DEF", label: "수비" },
];

type SortKey = "played" | "goals" | "assists" | "cleanCount" | "mvpCount" | "total";

const SORT_COLUMNS: { key: SortKey; label: string }[] = [
  { key: "played", label: "출전" },
  { key: "goals", label: "골" },
  { key: "assists", label: "어시" },
  { key: "cleanCount", label: "CS" },
  { key: "mvpCount", label: "MVP" },
  { key: "total", label: "총점" },
];

const ALL_TIME = "ALL_TIME";

export default function RankingPage() {
  const [rows, setRows] = useState<RankingRow[]>([]);
  const [seasons, setSeasons] = useState<number[]>([]);
  const [season, setSeason] = useState<number | typeof ALL_TIME>(ALL_TIME);
  const [tab, setTab] = useState<PosCategory | "ALL">("ALL");
  const [sortKey, setSortKey] = useState<SortKey>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetch("/api/ranking/seasons").then((r) => r.json()).then(setSeasons);
  }, []);

  useEffect(() => {
    const qs = season === ALL_TIME ? "" : `?season=${season}`;
    fetch(`/api/ranking${qs}`).then((r) => r.json()).then(setRows);
  }, [season]);

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
        1.25점, 수비형 미드필더 0.625점 (CS 열은 점수가 아니라 클린시트 기여
        횟수예요 — 수비형 미드필더는 0.5회로 계산돼요)
      </p>

      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => setSeason(ALL_TIME)}
          className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
            season === ALL_TIME ? "bg-blue-900 text-white" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          전체
        </button>
        {seasons.map((s) => (
          <button
            key={s}
            onClick={() => setSeason(s)}
            className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
              season === s ? "bg-blue-900 text-white" : "bg-zinc-100 text-zinc-600"
            }`}
          >
            {seasonLabel(s)}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl py-2 text-sm font-semibold ${
              tab === t.key
                ? "bg-blue-700 text-white"
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
        <table className="w-full whitespace-nowrap text-sm">
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
                      sortKey === c.key ? "text-blue-700" : "text-zinc-500"
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
                <td className="px-2 py-2 text-center">{r.cleanCount}</td>
                <td className="px-2 py-2 text-center">{r.mvpCount}</td>
                <td className="px-3 py-2 text-right font-bold text-blue-700">
                  {r.total.toFixed(1)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

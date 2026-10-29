"use client";

import { useEffect, useState } from "react";
import GpsHeatmap from "@/components/GpsHeatmap";
import { ZONE_ROWS } from "@/lib/gps/zones";
import type { TeamSummary } from "@/lib/gps/team";

type SortKey = "distanceM" | "distancePerMin" | "maxSpeedKmh" | "sprintCount" | "accelCount";

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "distanceM", label: "이동거리" },
  { key: "distancePerMin", label: "분당" },
  { key: "maxSpeedKmh", label: "최고속도" },
  { key: "sprintCount", label: "스프린트" },
  { key: "accelCount", label: "가속/감속" },
];

const card = "rounded-2xl border border-zinc-200 bg-white p-4";
const pct = (v: number) => `${Math.round(v * 100)}%`;

function ZoneBar({ share }: { share: Record<"walk" | "jog" | "fast" | "sprint", number> }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
      {ZONE_ROWS.map((z) => (
        <div key={z.key} className={z.color} style={{ width: `${share[z.key] * 100}%` }} title={`${z.label} ${pct(share[z.key])}`} />
      ))}
    </div>
  );
}

export default function GpsTeamPanel({ sessionId, refreshKey }: { sessionId: number; refreshKey: number }) {
  const [data, setData] = useState<TeamSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [sort, setSort] = useState<SortKey>("distanceM");

  useEffect(() => {
    let alive = true;
    fetch(`/api/gps/sessions/${sessionId}/team`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        if (d) setData(d);
        else setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [sessionId, refreshKey]);

  if (failed) return <p className="py-6 text-center text-sm text-zinc-500">팀 분석을 불러오지 못했어요.</p>;
  if (!data) return <p className="py-6 text-center text-sm text-zinc-400">불러오는 중…</p>;
  if (data.rows.length === 0) return <p className="py-6 text-center text-sm text-zinc-500">올라온 기록이 없어요.</p>;

  const rows = [...data.rows].sort((a, b) => b[sort] - a[sort]);
  const maxDist = Math.max(1, ...data.rows.map((r) => r.distanceM));

  return (
    <div className="space-y-4">
      <div className={`${card} space-y-2`}>
        <p className="text-sm font-bold">경기 요약</p>
        <ul className="space-y-1.5 text-sm text-zinc-700">
          {data.insights.map((t, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-blue-700">•</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
        {data.notes.map((n, i) => (
          <p key={i} className="text-xs text-amber-700">
            {n}
          </p>
        ))}
      </div>

      {data.totals.zoneShare && (
        <div className={`${card} space-y-2`}>
          <p className="text-sm font-bold">팀 전체 속도 구간 비율 (시간 기준)</p>
          <ZoneBar share={data.totals.zoneShare} />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-zinc-600 sm:grid-cols-4">
            {ZONE_ROWS.map((z) => (
              <span key={z.key} className="flex items-center gap-1.5">
                <i className={`inline-block h-2.5 w-2.5 rounded-full ${z.color}`} />
                {z.label} <b className="tabular-nums">{pct(data.totals.zoneShare![z.key])}</b>
              </span>
            ))}
          </div>
        </div>
      )}

      {data.heatmap && data.frame && (
        <div className={`${card} space-y-2`}>
          <p className="text-sm font-bold">팀 전체 히트맵</p>
          <GpsHeatmap heatmap={data.heatmap} lengthM={data.frame.lengthM} widthM={data.frame.widthM} />
          <p className="text-xs text-zinc-400">같이 뛴 선수들이 머문 시간을 모두 더한 지도예요. 붉을수록 팀이 오래 머문 곳이에요.</p>
        </div>
      )}

      <div className={`${card} space-y-2`}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold">선수별 비교</p>
          <div className="flex flex-wrap justify-end gap-1">
            {COLUMNS.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setSort(c.key)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                  sort === c.key ? "bg-blue-900 text-white" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {c.label}순
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] whitespace-nowrap text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1.5 pr-2 font-semibold">선수</th>
                <th className="px-2 font-semibold">이동거리</th>
                <th className="px-2 text-right font-semibold">분당</th>
                <th className="px-2 text-right font-semibold">최고속도</th>
                <th className="px-2 text-right font-semibold">스프린트</th>
                <th className="px-2 text-right font-semibold">가속/감속</th>
                <th className="pl-2 font-semibold">속도 구간</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.trackId} className="border-t border-zinc-100">
                  <td className="py-2 pr-2 font-semibold">{r.name}</td>
                  <td className="px-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-16 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full bg-blue-700/80" style={{ width: `${(r.distanceM / maxDist) * 100}%` }} />
                      </div>
                      <span className="tabular-nums">{(r.distanceM / 1000).toFixed(2)}km</span>
                    </div>
                  </td>
                  <td className="px-2 text-right tabular-nums">{Math.round(r.distancePerMin)}m</td>
                  <td className="px-2 text-right tabular-nums">{r.maxSpeedKmh.toFixed(1)}</td>
                  <td className="px-2 text-right tabular-nums">{r.sprintCount}회</td>
                  <td className="px-2 text-right tabular-nums">
                    {r.accelCount}/{r.decelCount}
                  </td>
                  <td className="w-28 pl-2">{r.zoneShare ? <ZoneBar share={r.zoneShare} /> : <span className="text-xs text-zinc-300">-</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-zinc-400">
          분당은 기록된 시간으로 나눈 이동거리라서, 뛴 시간이 다른 선수끼리 비교할 때 쓰세요. 최고속도 단위는 km/h예요.
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/useSession";
import type { HistoricalStats, Member } from "@/lib/types";

interface Draft {
  games: string;
  goals: string;
  assists: string;
  cleanPts: string;
  bonusPts: string;
}

const toDraft = (s?: HistoricalStats): Draft => ({
  games: s ? String(s.games) : "0",
  goals: s ? String(s.goals) : "0",
  assists: s ? String(s.assists) : "0",
  cleanPts: s ? String(s.cleanPts) : "0",
  bonusPts: s ? String(s.bonusPts) : "0",
});

export default function HistoricalStatsAdminPage() {
  const { user, loading } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [stats, setStats] = useState<HistoricalStats[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [savingId, setSavingId] = useState<number | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const load = async () => {
    const [membersRes, statsRes] = await Promise.all([
      fetch("/api/members").then((r) => r.json()),
      fetch("/api/admin/historical-stats"),
    ]);
    if (statsRes.status === 403) {
      setForbidden(true);
      return;
    }
    const statsData: HistoricalStats[] = await statsRes.json();
    setMembers(membersRes);
    setStats(statsData);
    const byMember = new Map(statsData.map((s) => [s.memberId, s]));
    setDrafts(
      Object.fromEntries(
        (membersRes as Member[]).map((m) => [m.id, toDraft(byMember.get(m.id))])
      )
    );
  };

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (loading) return null;
  if (!user || user.role !== "admin" || forbidden) {
    return (
      <div className="space-y-3 pt-10 text-center">
        <p className="text-sm text-zinc-500">운영진만 볼 수 있는 페이지예요.</p>
        <Link href="/" className="font-semibold text-blue-700">
          홈으로
        </Link>
      </div>
    );
  }

  const input = "w-16 rounded-lg border border-zinc-300 bg-white px-1.5 py-1 text-sm text-right";

  const setDraft = (memberId: number, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [memberId]: { ...d[memberId], ...patch } }));

  const save = async (memberId: number) => {
    const d = drafts[memberId];
    setSavingId(memberId);
    await fetch("/api/admin/historical-stats", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        memberId,
        games: d.games,
        goals: d.goals,
        assists: d.assists,
        cleanPts: d.cleanPts,
        bonusPts: d.bonusPts,
      }),
    });
    setSavingId(null);
    load();
  };

  const remove = async (memberId: number, name: string) => {
    if (!confirm(`${name}의 역대 누적 기록을 삭제할까요?`)) return;
    setSavingId(memberId);
    await fetch("/api/admin/historical-stats", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId }),
    });
    setSavingId(null);
    load();
  };

  const hasEntry = new Set(stats.map((s) => s.memberId));
  const sortedMembers = [...members].sort((a, b) => a.name.localeCompare(b.name, "ko"));

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">역대 누적 기록(랭킹) 관리</h1>
      <p className="text-sm text-zinc-500">
        앱 도입 이전 스프레드시트로 관리하던 역대 누적 기록을 멤버별로 추가·수정할 수
        있어요. 여기서 입력한 값은 &quot;전체&quot; 랭킹과 2026 시즌 랭킹에 기준치로
        더해져요.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
              <th className="px-3 py-2.5">이름</th>
              <th className="px-2 py-2.5 text-center">출전</th>
              <th className="px-2 py-2.5 text-center">골</th>
              <th className="px-2 py-2.5 text-center">어시</th>
              <th className="px-2 py-2.5 text-center">CS점수</th>
              <th className="px-2 py-2.5 text-center">보너스</th>
              <th className="px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {sortedMembers.map((m) => {
              const d = drafts[m.id] ?? toDraft();
              return (
                <tr key={m.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-2 font-semibold">
                    {m.name}
                    {m.backNo != null && (
                      <span className="ml-1 text-xs text-zinc-400">#{m.backNo}</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      className={input}
                      value={d.games}
                      onChange={(e) => setDraft(m.id, { games: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      className={input}
                      value={d.goals}
                      onChange={(e) => setDraft(m.id, { goals: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      className={input}
                      value={d.assists}
                      onChange={(e) => setDraft(m.id, { assists: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      className={input}
                      value={d.cleanPts}
                      onChange={(e) => setDraft(m.id, { cleanPts: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <input
                      className={input}
                      value={d.bonusPts}
                      onChange={(e) => setDraft(m.id, { bonusPts: e.target.value })}
                    />
                  </td>
                  <td className="px-2 py-2 text-right">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => save(m.id)}
                        disabled={savingId === m.id}
                        className="rounded-lg bg-blue-700 px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        저장
                      </button>
                      {hasEntry.has(m.id) && (
                        <button
                          onClick={() => remove(m.id, m.name)}
                          disabled={savingId === m.id}
                          className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-500 disabled:opacity-40"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

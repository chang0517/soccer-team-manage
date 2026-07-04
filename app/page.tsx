"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import VoteButtons from "@/components/VoteButtons";
import { useMyId } from "@/components/useMyId";
import { dDayLabel, formatDate, todayStr } from "@/lib/format";
import type {
  EventItem,
  Member,
  RankingRow,
  VoteRow,
  VoteStatus,
} from "@/lib/types";

export default function HomePage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [votesByEvent, setVotesByEvent] = useState<Record<number, VoteRow[]>>({});
  const [myId, setMyId] = useMyId();

  const upcoming = events
    .filter((e) => e.date >= todayStr())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3);

  const loadVotes = useCallback(async (eventIds: number[]) => {
    const entries = await Promise.all(
      eventIds.map(async (id) => {
        const res = await fetch(`/api/events/${id}`);
        const data = await res.json();
        return [id, data.votes as VoteRow[]] as const;
      })
    );
    setVotesByEvent(Object.fromEntries(entries));
  }, []);

  useEffect(() => {
    fetch("/api/members").then((r) => r.json()).then(setMembers);
    fetch("/api/ranking").then((r) => r.json()).then(setRanking);
    fetch("/api/events")
      .then((r) => r.json())
      .then((evs: EventItem[]) => {
        setEvents(evs);
        const ids = evs
          .filter((e) => e.date >= todayStr())
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 3)
          .map((e) => e.id);
        loadVotes(ids);
      });
  }, [loadVotes]);

  const vote = async (eventId: number, status: VoteStatus) => {
    if (!myId) return;
    await fetch(`/api/events/${eventId}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: myId, status }),
    });
    loadVotes(upcoming.map((e) => e.id));
  };

  const voteCounts = (eventId: number): Record<VoteStatus, number> => {
    const vs = votesByEvent[eventId] ?? [];
    return {
      attend: vs.filter((v) => v.status === "attend").length,
      maybe: vs.filter((v) => v.status === "maybe").length,
      absent: vs.filter((v) => v.status === "absent").length,
    };
  };

  const myStatus = (eventId: number): VoteStatus | null =>
    (votesByEvent[eventId] ?? []).find((v) => v.memberId === myId)?.status ??
    null;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <label className="text-xs font-semibold text-zinc-500">내 이름</label>
        <select
          className="mt-1 w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
          value={myId ?? ""}
          onChange={(e) => setMyId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">이름을 선택하세요 (투표에 사용돼요)</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.backNo != null ? ` (#${m.backNo})` : ""}
            </option>
          ))}
        </select>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">다가오는 일정</h2>
          <Link href="/schedule" className="text-sm text-emerald-700">
            전체 보기 →
          </Link>
        </div>
        {upcoming.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
            예정된 일정이 없어요. 일정 탭에서 추가해 보세요.
          </p>
        )}
        <div className="space-y-3">
          {upcoming.map((e) => (
            <div
              key={e.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4"
            >
              <Link href={`/events/${e.id}`} className="block">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
                    {dDayLabel(e.date)}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {formatDate(e.date, e.time)}
                  </span>
                </div>
                <p className="mt-2 font-bold">
                  {e.title}
                  {e.opponent && (
                    <span className="font-medium text-zinc-600">
                      {" "}
                      vs {e.opponent}
                    </span>
                  )}
                </p>
                {e.location && (
                  <p className="mt-0.5 text-sm text-zinc-500">📍 {e.location}</p>
                )}
              </Link>
              <div className="mt-3">
                <VoteButtons
                  myStatus={myStatus(e.id)}
                  counts={voteCounts(e.id)}
                  disabled={!myId}
                  onVote={(s) => vote(e.id, s)}
                />
                {!myId && (
                  <p className="mt-1.5 text-xs text-zinc-400">
                    위에서 내 이름을 먼저 선택하면 투표할 수 있어요.
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">시즌 랭킹 TOP 5</h2>
          <Link href="/ranking" className="text-sm text-emerald-700">
            전체 보기 →
          </Link>
        </div>
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
          {ranking.slice(0, 5).map((r, i) => (
            <div
              key={r.member.id}
              className="flex items-center gap-3 border-b border-zinc-100 px-4 py-2.5 last:border-0"
            >
              <span className="w-6 text-center text-sm font-bold text-zinc-400">
                {["🥇", "🥈", "🥉"][i] ?? i + 1}
              </span>
              <span className="flex-1 text-sm font-semibold">
                {r.member.name}
              </span>
              <span className="text-xs text-zinc-500">
                ⚽{r.goals} 🎯{r.assists}
              </span>
              <span className="w-12 text-right text-sm font-bold text-emerald-700">
                {r.total}점
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

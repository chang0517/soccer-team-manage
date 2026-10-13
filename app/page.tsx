"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import VoteButtons from "@/components/VoteButtons";
import { useSession } from "@/components/useSession";
import { dDayLabel, formatDate, todayStr } from "@/lib/format";
import { currentSeason } from "@/lib/season";
import { WEATHER_EMOJI } from "@/lib/weather";
import type { MatchWeather } from "@/lib/weather";
import type { EventItem, OpponentKitRow, RankingRow, VoteRow, VoteStatus } from "@/lib/types";

const DUTY_FIELDS: { key: keyof DutyDraft; label: string }[] = [
  { key: "dutyOffense", label: "공가방1" },
  { key: "dutyDefense", label: "공가방2" },
  { key: "waterDuty", label: "물/음료" },
  { key: "iceboxDuty", label: "아이스박스" },
];

interface DutyDraft {
  dutyOffense: string;
  dutyDefense: string;
  waterDuty: string;
  iceboxDuty: string;
}

// 상대팀 유니폼 색(hex)의 상대 휘도를 계산해서, 우리 팀은 밝은 색/어두운
// 색 중 대비되는 쪽을 입으라고 추천한다(정확한 색상 매칭이 아니라
// 단순 명암 대비 — 실제 보유한 유니폼 색을 다 알 수는 없어서 이 정도가
// 실용적인 선에서 가장 안전한 기준).
function recommendKit(hex: string): { label: string; swatch: string } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return luminance > 0.5
    ? { label: "어두운(남색·검정 계열) 유니폼을 추천해요", swatch: "#18181b" }
    : { label: "밝은(흰색 계열) 유니폼을 추천해요", swatch: "#fafafa" };
}

export default function HomePage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [votesByEvent, setVotesByEvent] = useState<Record<number, VoteRow[]>>({});
  const [weatherByEvent, setWeatherByEvent] = useState<Record<number, MatchWeather | null>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<number, DutyDraft>>({});
  const [editingId, setEditingId] = useState<number | null>(null);
  const [noteSavingId, setNoteSavingId] = useState<number | null>(null);
  const [opponentKits, setOpponentKits] = useState<Record<string, string>>({});
  const [kitDrafts, setKitDrafts] = useState<Record<string, string>>({});
  const [kitSavingTeam, setKitSavingTeam] = useState<string | null>(null);
  const { user } = useSession();
  const myId = user?.memberId ?? null;

  const upcoming = events
    .filter((e) => e.date >= todayStr())
    .sort((a, b) => a.date.localeCompare(b.date));

  const loadVotes = useCallback(async (eventIds: number[]) => {
    if (eventIds.length === 0) {
      setVotesByEvent({});
      return;
    }
    const res = await fetch(`/api/votes?eventIds=${eventIds.join(",")}`);
    const data = await res.json();
    setVotesByEvent(data);
  }, []);

  const loadWeather = useCallback(async (eventIds: number[]) => {
    if (eventIds.length === 0) {
      setWeatherByEvent({});
      return;
    }
    const pairs = await Promise.all(
      eventIds.map(async (eid) => {
        const d = await fetch(`/api/events/${eid}/weather`).then((r) => r.json());
        return [eid, d.weather ?? null] as const;
      })
    );
    setWeatherByEvent(Object.fromEntries(pairs));
  }, []);

  useEffect(() => {
    fetch(`/api/ranking?season=${currentSeason()}`).then((r) => r.json()).then(setRanking);
    fetch("/api/opponent-kits")
      .then((r) => (r.ok ? r.json() : []))
      .then((kits: OpponentKitRow[]) =>
        setOpponentKits(Object.fromEntries(kits.map((k) => [k.teamName, k.color])))
      );
    fetch("/api/events")
      .then((r) => r.json())
      .then((evs: EventItem[]) => {
        setEvents(evs);
        const ids = evs
          .filter((e) => e.date >= todayStr())
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((e) => e.id);
        loadVotes(ids);
        loadWeather(ids);
        setNoteDrafts(
          Object.fromEntries(
            evs.map((e) => [
              e.id,
              {
                dutyOffense: e.dutyOffense ?? "",
                dutyDefense: e.dutyDefense ?? "",
                waterDuty: e.waterDuty ?? "",
                iceboxDuty: e.iceboxDuty ?? "",
              },
            ])
          )
        );
      });
  }, [loadVotes, loadWeather]);

  const startEditNote = (eventId: number) => setEditingId(eventId);

  const saveNote = async (eventId: number) => {
    setNoteSavingId(eventId);
    await fetch(`/api/events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        noteDrafts[eventId] ?? {
          dutyOffense: "",
          dutyDefense: "",
          waterDuty: "",
          iceboxDuty: "",
        }
      ),
    });
    setNoteSavingId(null);
    setEditingId(null);
  };

  const saveKit = async (teamName: string) => {
    const color = kitDrafts[teamName];
    if (!color) return;
    setKitSavingTeam(teamName);
    await fetch("/api/opponent-kits", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ teamName, color }),
    });
    setOpponentKits((prev) => ({ ...prev, [teamName]: color }));
    setKitSavingTeam(null);
  };

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
      {!user && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm">
          <Link href="/login" className="font-semibold text-blue-700">
            로그인
          </Link>
          하면 투표하고 활동할 수 있어요.
        </section>
      )}
      {user && !myId && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          아직 멤버 프로필과 연결되지 않았어요. 운영진에게 연결을 요청해 주세요.
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">다가오는 일정</h2>
          <Link href="/schedule" className="text-sm text-blue-700">
            전체 보기 →
          </Link>
        </div>
        {upcoming.length === 0 && (
          <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
            예정된 일정이 없어요. 일정 탭에서 추가해 보세요.
          </p>
        )}
        <div className="space-y-3">
          {upcoming.map((e) => {
            const w = weatherByEvent[e.id];
            return (
            <div
              key={e.id}
              className="rounded-2xl border border-zinc-200 bg-white p-4"
            >
              <Link href={`/events/${e.id}`} className="block">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
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
                {w && (
                  <p className="mt-0.5 text-sm font-semibold text-zinc-600">
                    {w.pty ? WEATHER_EMOJI[w.pty] : w.sky ? WEATHER_EMOJI[w.sky] : ""}{" "}
                    {w.pty ?? w.sky ?? ""}
                    {w.tmp != null && ` · ${w.tmp}°C`}
                    {w.pop != null && ` · 강수 ${w.pop}%`}
                  </p>
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
              {e.opponent &&
                (() => {
                  const teamName = e.opponent.trim();
                  const knownColor = opponentKits[teamName];
                  return (
                    <div className="mt-3 border-t border-zinc-100 pt-3">
                      <span className="text-xs font-semibold text-zinc-500">
                        상대팀 유니폼
                      </span>
                      {knownColor ? (
                        <div className="mt-1.5 flex items-center gap-2 text-sm">
                          <span
                            className="h-4 w-4 shrink-0 rounded-full border border-zinc-300"
                            style={{ backgroundColor: knownColor }}
                          />
                          <span className="text-zinc-600">{teamName}팀 기록된 색</span>
                          <span className="text-zinc-400">·</span>
                          <span className="flex items-center gap-1.5 font-semibold text-blue-700">
                            <span
                              className="h-4 w-4 shrink-0 rounded-full border border-zinc-300"
                              style={{ backgroundColor: recommendKit(knownColor).swatch }}
                            />
                            {recommendKit(knownColor).label}
                          </span>
                        </div>
                      ) : (
                        <div className="mt-1.5 flex items-center gap-2">
                          <input
                            type="color"
                            className="h-8 w-10 shrink-0 rounded border border-zinc-300"
                            value={kitDrafts[teamName] ?? "#1e3a8a"}
                            onChange={(ev) =>
                              setKitDrafts((d) => ({ ...d, [teamName]: ev.target.value }))
                            }
                          />
                          <p className="flex-1 text-xs text-zinc-400">
                            {teamName}팀 유니폼 색을 처음 기록해 두면, 다음에 또 만났을 때
                            자동으로 알려드려요.
                          </p>
                          <button
                            onClick={() => saveKit(teamName)}
                            disabled={kitSavingTeam === teamName}
                            className="shrink-0 rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            {kitSavingTeam === teamName ? "저장 중…" : "저장"}
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              <div className="mt-3 border-t border-zinc-100 pt-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-zinc-500">비고</span>
                  {editingId !== e.id && (
                    <button
                      onClick={() => startEditNote(e.id)}
                      className="text-xs font-semibold text-blue-700"
                    >
                      수정
                    </button>
                  )}
                </div>
                {editingId === e.id ? (
                  <div className="space-y-1.5">
                    {DUTY_FIELDS.map((f) => (
                      <div key={f.key} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-xs text-zinc-400">
                          {f.label}
                        </span>
                        <input
                          className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1 text-sm"
                          value={noteDrafts[e.id]?.[f.key] ?? ""}
                          onChange={(ev) =>
                            setNoteDrafts((d) => {
                              const current = d[e.id] ?? {
                                dutyOffense: "",
                                dutyDefense: "",
                                waterDuty: "",
                                iceboxDuty: "",
                              };
                              return {
                                ...d,
                                [e.id]: { ...current, [f.key]: ev.target.value },
                              };
                            })
                          }
                        />
                      </div>
                    ))}
                    <button
                      onClick={() => saveNote(e.id)}
                      disabled={noteSavingId === e.id}
                      className="mt-1 rounded-lg bg-blue-700 px-3 py-1 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {noteSavingId === e.id ? "저장 중…" : "확인"}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-0.5 text-sm">
                    {DUTY_FIELDS.every((f) => !(noteDrafts[e.id]?.[f.key] ?? "")) ? (
                      <p className="text-xs text-zinc-400">아직 등록된 비고가 없어요.</p>
                    ) : (
                      DUTY_FIELDS.map(
                        (f) =>
                          noteDrafts[e.id]?.[f.key] && (
                            <p key={f.key}>
                              <span className="text-xs font-semibold text-zinc-500">
                                {f.label}
                              </span>{" "}
                              {noteDrafts[e.id][f.key]}
                            </p>
                          )
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-base font-bold">이번 시즌 랭킹 TOP 5</h2>
          <Link href="/ranking" className="text-sm text-blue-700">
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
              <span className="w-12 text-right text-sm font-bold text-blue-700">
                {r.total}점
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AiRecordImport from "@/components/AiRecordImport";
import VoteButtons from "@/components/VoteButtons";
import { useMyId } from "@/components/useMyId";
import { formatDate, dDayLabel } from "@/lib/format";
import { FORMATION_SLOTS, slotPositionFor } from "@/lib/squad";
import { POS_GROUPS, POS_SHORT } from "@/lib/types";
import type {
  EventItem,
  Member,
  PosGroup,
  RecordRow,
  SquadData,
  VoteRow,
  VoteStatus,
} from "@/lib/types";

interface RecordDraft {
  memberId: number;
  played: boolean;
  goals: number;
  assists: number;
  position: string;
}

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [votes, setVotes] = useState<VoteRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [drafts, setDrafts] = useState<RecordDraft[]>([]);
  const [scored, setScored] = useState<string>("");
  const [conceded, setConceded] = useState<string>("");
  const [savedMsg, setSavedMsg] = useState("");
  const [myId, setMyId] = useMyId();
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestForm, setGuestForm] = useState<{
    name: string;
    pos1: PosGroup;
    pos2: PosGroup;
  }>({ name: "", pos1: "CB", pos2: "WB" });
  const [addingGuest, setAddingGuest] = useState(false);

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );

  const load = useCallback(async () => {
    const [detail, mems] = await Promise.all([
      fetch(`/api/events/${id}`).then((r) => r.json()),
      fetch("/api/members").then((r) => r.json()),
    ]);
    if (detail.error) return;
    const ev: EventItem = detail.event;
    const recs: RecordRow[] = detail.records;
    setEvent(ev);
    setVotes(detail.votes);
    setMembers(mems);
    setScored(ev.scored != null ? String(ev.scored) : "");
    setConceded(ev.conceded != null ? String(ev.conceded) : "");

    const recByMember = new Map(recs.map((r) => [r.memberId, r]));
    const memberById2 = new Map((mems as Member[]).map((m) => [m.id, m]));
    const squadPos = new Map<number, string>();
    if (ev.squad) {
      for (const s of ev.squad.starters) {
        const mem = s.memberId != null ? memberById2.get(s.memberId) : undefined;
        if (s.memberId != null && mem) {
          squadPos.set(s.memberId, slotPositionFor(s.slotId, mem));
        }
      }
    }
    setDrafts(
      (mems as Member[]).map((m) => {
        const r = recByMember.get(m.id);
        return {
          memberId: m.id,
          played: r ? !!r.played : squadPos.has(m.id),
          goals: r?.goals ?? 0,
          assists: r?.assists ?? 0,
          position: r?.position || squadPos.get(m.id) || m.pos1,
        };
      })
    );
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!event) return <p className="py-10 text-center text-zinc-400">불러오는 중…</p>;

  const attendIds = votes.filter((v) => v.status === "attend").map((v) => v.memberId);
  const counts: Record<VoteStatus, number> = {
    attend: attendIds.length,
    maybe: votes.filter((v) => v.status === "maybe").length,
    absent: votes.filter((v) => v.status === "absent").length,
  };
  const myStatus =
    votes.find((v) => v.memberId === myId)?.status ?? null;
  const nonVoters = members.filter(
    (m) => !votes.some((v) => v.memberId === m.id)
  );

  const vote = async (status: VoteStatus) => {
    if (!myId) return;
    await fetch(`/api/events/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: myId, status }),
    });
    load();
  };

  const addGuest = async () => {
    if (!guestForm.name.trim()) return;
    setAddingGuest(true);
    const res = await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: guestForm.name.trim(),
        backNo: null,
        pos1: guestForm.pos1,
        pos2: guestForm.pos2,
        isGuest: true,
      }),
    });
    const guest = await res.json();
    await fetch(`/api/events/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: guest.id, status: "attend" }),
    });
    setAddingGuest(false);
    setGuestForm({ name: "", pos1: "CB", pos2: "WB" });
    setShowGuestForm(false);
    load();
  };

  const regenerate = async () => {
    await fetch(`/api/events/${id}/squad`, { method: "POST" });
    load();
  };

  const assignSlot = async (slotId: string, memberIdRaw: string) => {
    if (!event.squad) return;
    const newId = memberIdRaw ? Number(memberIdRaw) : null;
    const squad: SquadData = {
      ...event.squad,
      starters: event.squad.starters.map((s) => {
        if (s.slotId === slotId) return { ...s, memberId: newId };
        // 같은 선수가 두 자리에 서지 않게 기존 자리는 비운다
        if (newId != null && s.memberId === newId) return { ...s, memberId: null };
        return s;
      }),
    };
    const starterIds = new Set(
      squad.starters.map((s) => s.memberId).filter((v): v is number => v != null)
    );
    squad.bench = attendIds.filter((mid) => !starterIds.has(mid));
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ squad }),
    });
    load();
  };

  const saveRecords = async () => {
    await fetch(`/api/events/${id}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scored: scored === "" ? null : Number(scored),
        conceded: conceded === "" ? null : Number(conceded),
        records: drafts,
      }),
    });
    setSavedMsg("기록이 저장됐어요.");
    setTimeout(() => setSavedMsg(""), 2500);
    load();
  };

  const removeEvent = async () => {
    if (!confirm("이 일정을 삭제할까요? 투표와 기록도 함께 삭제돼요.")) return;
    await fetch(`/api/events/${id}`, { method: "DELETE" });
    router.push("/schedule");
  };

  const updateDraft = (memberId: number, patch: Partial<RecordDraft>) =>
    setDrafts((ds) =>
      ds.map((d) => (d.memberId === memberId ? { ...d, ...patch } : d))
    );

  const applyAiResults = (
    results: { memberId: number; goals: number; assists: number }[]
  ) => {
    setDrafts((ds) =>
      ds.map((d) => {
        const r = results.find((x) => x.memberId === d.memberId);
        if (!r) return d;
        return {
          ...d,
          played: true,
          goals: d.goals + r.goals,
          assists: d.assists + r.assists,
        };
      })
    );
  };

  const nameOf = (mid: number | null) =>
    mid != null ? (memberById.get(mid)?.name ?? "?") : "미정";

  const voterList = (status: VoteStatus) =>
    votes
      .filter((v) => v.status === status)
      .map((v) => {
        const m = memberById.get(v.memberId);
        return m ? `${m.name}${m.isGuest ? "(용병)" : ""}` : null;
      })
      .filter(Boolean)
      .join(", ");

  const numInput =
    "w-12 rounded-lg border border-zinc-300 bg-white px-1 py-1 text-center text-sm";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">
            {dDayLabel(event.date)}
          </span>
          <button
            onClick={removeEvent}
            className="text-xs text-red-500 underline"
          >
            일정 삭제
          </button>
        </div>
        <h1 className="mt-2 text-lg font-bold">
          {event.title}
          {event.opponent && (
            <span className="text-zinc-600"> vs {event.opponent}</span>
          )}
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          {formatDate(event.date, event.time)}
          {event.location && ` · ${event.location}`}
        </p>
        {event.scored != null && event.conceded != null && (
          <p className="mt-2 text-2xl font-extrabold text-emerald-700">
            {event.scored} : {event.conceded}
            {event.conceded === 0 && (
              <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700">
                클린시트
              </span>
            )}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-base font-bold">참석 투표</h2>
        <VoteButtons
          myStatus={myStatus}
          counts={counts}
          disabled={!myId}
          onVote={vote}
        />
        {!myId && (
          <p className="mt-2 text-xs text-zinc-400">
            홈 화면에서 내 이름을 먼저 선택해 주세요.
            {" "}
            <Link className="text-emerald-700 underline" href="/">
              홈으로
            </Link>
          </p>
        )}
        <div className="mt-4 space-y-2 text-sm">
          <p>
            <span className="font-semibold text-emerald-700">참석 {counts.attend}</span>
            <span className="ml-2 text-zinc-600">{voterList("attend")}</span>
          </p>
          <p>
            <span className="font-semibold text-amber-600">미정 {counts.maybe}</span>
            <span className="ml-2 text-zinc-600">{voterList("maybe")}</span>
          </p>
          <p>
            <span className="font-semibold text-zinc-500">불참 {counts.absent}</span>
            <span className="ml-2 text-zinc-600">{voterList("absent")}</span>
          </p>
          {nonVoters.length > 0 && (
            <p className="text-xs text-zinc-400">
              미투표 {nonVoters.length}명: {nonVoters.map((m) => m.name).join(", ")}
            </p>
          )}
        </div>

        <div className="mt-4 border-t border-zinc-100 pt-3">
          <button
            onClick={() => setShowGuestForm((v) => !v)}
            className="text-sm font-semibold text-emerald-700"
          >
            {showGuestForm ? "용병 추가 닫기" : "+ 용병 추가"}
          </button>
          {showGuestForm && (
            <div className="mt-3 space-y-2 rounded-xl bg-zinc-50 p-3">
              <input
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
                placeholder="용병 이름"
                value={guestForm.name}
                onChange={(e) =>
                  setGuestForm({ ...guestForm, name: e.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  className="rounded-xl border border-zinc-300 bg-white px-2 py-2 text-sm"
                  value={guestForm.pos1}
                  onChange={(e) =>
                    setGuestForm({
                      ...guestForm,
                      pos1: e.target.value as PosGroup,
                    })
                  }
                >
                  {POS_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      1순위 {g}
                    </option>
                  ))}
                </select>
                <select
                  className="rounded-xl border border-zinc-300 bg-white px-2 py-2 text-sm"
                  value={guestForm.pos2}
                  onChange={(e) =>
                    setGuestForm({
                      ...guestForm,
                      pos2: e.target.value as PosGroup,
                    })
                  }
                >
                  {POS_GROUPS.map((g) => (
                    <option key={g} value={g}>
                      2순위 {g}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={addGuest}
                disabled={addingGuest || !guestForm.name.trim()}
                className="w-full rounded-xl bg-emerald-700 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                {addingGuest ? "추가 중…" : "용병 추가 + 이 경기 참석 등록"}
              </button>
              <p className="text-xs text-zinc-400">
                이 경기에만 쓰는 임시 참가자예요. 멤버 탭에도 &ldquo;용병&rdquo;
                표시로 남아요.
              </p>
            </div>
          )}
        </div>
      </section>

      {event.type === "match" && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold">스쿼드 (4-1-2-1-2)</h2>
            <button
              onClick={regenerate}
              className="rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
            >
              {event.squad ? "다시 생성" : "자동 생성"}
            </button>
          </div>
          <p className="mb-3 text-xs text-zinc-400">
            경기 3일 전이 되면 참석 투표 기준으로 자동 생성돼요. 포지션은 각자
            멤버 탭의 1·2순위 선호를 따라요.
          </p>

          {event.squad ? (
            <>
              <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl bg-emerald-700" style={{ aspectRatio: "3 / 4" }}>
                <div className="absolute inset-3 rounded-xl border-2 border-emerald-300/50" />
                <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-300/50" />
                <div className="absolute left-3 right-3 top-1/2 border-t-2 border-emerald-300/50" />
                {FORMATION_SLOTS.map((slot) => {
                  const asg = event.squad!.starters.find(
                    (s) => s.slotId === slot.id
                  );
                  return (
                    <div
                      key={slot.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
                      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                    >
                      <div
                        className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${
                          slot.accepts.includes("GK")
                            ? "bg-amber-400 text-amber-950"
                            : "bg-white text-emerald-900"
                        }`}
                      >
                        {slot.label}
                      </div>
                      <p className="mt-0.5 max-w-16 truncate rounded bg-emerald-950/60 px-1 text-[11px] font-semibold text-white">
                        {nameOf(asg?.memberId ?? null)}
                      </p>
                    </div>
                  );
                })}
              </div>

              {event.squad.bench.length > 0 && (
                <p className="mt-3 text-sm">
                  <span className="font-semibold text-zinc-500">교체 대기:</span>{" "}
                  {event.squad.bench
                    .map((mid) => {
                      const m = memberById.get(mid);
                      return m ? `${m.name}${m.isGuest ? "(용병)" : ""}` : "?";
                    })
                    .join(", ")}
                </p>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-emerald-700">
                  수동으로 조정하기
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {FORMATION_SLOTS.map((slot) => {
                    const asg = event.squad!.starters.find(
                      (s) => s.slotId === slot.id
                    );
                    return (
                      <div key={slot.id} className="flex items-center gap-2">
                        <span className="w-16 shrink-0 text-xs font-bold text-zinc-500">
                          {slot.label} · {slot.accepts.map((g) => POS_SHORT[g]).join("/")}
                        </span>
                        <select
                          className="flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                          value={asg?.memberId ?? ""}
                          onChange={(e) => assignSlot(slot.id, e.target.value)}
                        >
                          <option value="">(비움)</option>
                          {members
                            .filter(
                              (m) =>
                                attendIds.includes(m.id) ||
                                m.id === asg?.memberId
                            )
                            .map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name} ({m.pos1}/{m.pos2}){m.isGuest ? " · 용병" : ""}
                              </option>
                            ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </details>
            </>
          ) : (
            <p className="rounded-xl border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-400">
              아직 스쿼드가 없어요. 참석 투표가 모이면 자동 생성되거나, 위
              버튼으로 바로 만들 수 있어요.
            </p>
          )}
        </section>
      )}

      {event.type === "match" && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-base font-bold">경기 기록</h2>
          <div className="mb-4 flex items-center gap-3">
            <label className="text-sm font-semibold">득점</label>
            <input
              type="number"
              min={0}
              className={numInput}
              value={scored}
              onChange={(e) => setScored(e.target.value)}
            />
            <label className="text-sm font-semibold">실점</label>
            <input
              type="number"
              min={0}
              className={numInput}
              value={conceded}
              onChange={(e) => setConceded(e.target.value)}
            />
            {conceded === "0" && (
              <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700">
                클린시트 → GK·수비 1점, 수미 0.5점
              </span>
            )}
          </div>

          <AiRecordImport members={members} onApply={applyAiResults} />

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                  <th className="py-2 pr-2">출전</th>
                  <th className="py-2 pr-2">이름</th>
                  <th className="py-2 pr-2">포지션</th>
                  <th className="py-2 pr-2 text-center">골</th>
                  <th className="py-2 text-center">어시</th>
                </tr>
              </thead>
              <tbody>
                {drafts
                  .slice()
                  .sort((a, b) => {
                    const ax = attendIds.includes(a.memberId) || a.played ? 0 : 1;
                    const bx = attendIds.includes(b.memberId) || b.played ? 0 : 1;
                    if (ax !== bx) return ax - bx;
                    return (memberById.get(a.memberId)?.name ?? "").localeCompare(
                      memberById.get(b.memberId)?.name ?? "",
                      "ko"
                    );
                  })
                  .map((d) => (
                    <tr key={d.memberId} className="border-b border-zinc-100">
                      <td className="py-1.5 pr-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-emerald-700"
                          checked={d.played}
                          onChange={(e) =>
                            updateDraft(d.memberId, { played: e.target.checked })
                          }
                        />
                      </td>
                      <td className="py-1.5 pr-2 font-medium">
                        {memberById.get(d.memberId)?.name}
                      </td>
                      <td className="py-1.5 pr-2">
                        <select
                          className="rounded-lg border border-zinc-300 bg-white px-1.5 py-1 text-xs"
                          value={d.position}
                          onChange={(e) =>
                            updateDraft(d.memberId, { position: e.target.value })
                          }
                        >
                          {POS_GROUPS.map((g) => (
                            <option key={g} value={g}>
                              {g}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1.5 pr-2 text-center">
                        <input
                          type="number"
                          min={0}
                          className={numInput}
                          value={d.goals}
                          onChange={(e) =>
                            updateDraft(d.memberId, {
                              goals: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                      <td className="py-1.5 text-center">
                        <input
                          type="number"
                          min={0}
                          className={numInput}
                          value={d.assists}
                          onChange={(e) =>
                            updateDraft(d.memberId, {
                              assists: Number(e.target.value) || 0,
                            })
                          }
                        />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <button
            onClick={saveRecords}
            className="mt-4 w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white"
          >
            기록 저장
          </button>
          {savedMsg && (
            <p className="mt-2 text-center text-sm font-semibold text-emerald-700">
              {savedMsg}
            </p>
          )}
        </section>
      )}

      <Link
        href={`/report/${event.id}`}
        className="block rounded-2xl border border-zinc-200 bg-white p-4 text-center text-sm font-semibold text-emerald-700 hover:bg-zinc-50"
      >
        📝 이 일정으로 활동 보고서 만들기 →
      </Link>
    </div>
  );
}

"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AiRecordImport from "@/components/AiRecordImport";
import VoteButtons from "@/components/VoteButtons";
import { useSession } from "@/components/useSession";
import { formatDate, dDayLabel, daysUntil } from "@/lib/format";
import { isVotingClosed } from "@/lib/rules";
import {
  FORMATION_SLOTS,
  SLOT_CATEGORY_COLORS,
  slotDisplayLabel,
  slotPositionFor,
} from "@/lib/squad";
import { POS_GROUPS } from "@/lib/types";
import type {
  CommentRow,
  EventItem,
  Member,
  MvpVoteRow,
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
  const { user } = useSession();
  const myId = user?.memberId ?? null;
  const [activeQuarter, setActiveQuarter] = useState(0);
  const [showGuestForm, setShowGuestForm] = useState(false);
  const [guestForm, setGuestForm] = useState<{
    name: string;
    pos1: PosGroup;
    pos2: PosGroup;
  }>({ name: "", pos1: "CB", pos2: "WB" });
  const [addingGuest, setAddingGuest] = useState(false);
  const [mvpVotes, setMvpVotes] = useState<MvpVoteRow[]>([]);
  const [mvpPick, setMvpPick] = useState("");
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [newComment, setNewComment] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const [adminAddPick, setAdminAddPick] = useState("");
  const [voteError, setVoteError] = useState("");
  const isAdmin = user?.role === "admin";

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );

  const load = useCallback(async () => {
    const [detail, mems, comms] = await Promise.all([
      fetch(`/api/events/${id}`).then((r) => r.json()),
      fetch("/api/members").then((r) => r.json()),
      fetch(`/api/events/${id}/comments`).then((r) => r.json()),
    ]);
    if (detail.error) return;
    const ev: EventItem = detail.event;
    const recs: RecordRow[] = detail.records;
    setEvent(ev);
    setVotes(detail.votes);
    setMvpVotes(detail.mvpVotes ?? []);
    setComments(Array.isArray(comms) ? comms : []);
    setMembers(mems);
    setScored(ev.scored != null ? String(ev.scored) : "");
    setConceded(ev.conceded != null ? String(ev.conceded) : "");

    const recByMember = new Map(recs.map((r) => [r.memberId, r]));
    const memberById2 = new Map((mems as Member[]).map((m) => [m.id, m]));
    const squadPos = new Map<number, string>();
    if (ev.squad) {
      for (const qs of ev.squad.quarters) {
        for (const s of qs.starters) {
          for (const mid of [s.memberId, s.memberId2]) {
            if (mid == null || squadPos.has(mid)) continue;
            const mem = memberById2.get(mid);
            if (mem) squadPos.set(mid, slotPositionFor(s.slotId, mem));
          }
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
  const voteClosed = isVotingClosed(daysUntil(event.date), counts.attend);

  const mvpTally = (() => {
    const counts = new Map<number, number>();
    for (const v of mvpVotes) counts.set(v.voteeId, (counts.get(v.voteeId) ?? 0) + 1);
    const max = Math.max(0, ...counts.values());
    return [...counts.entries()]
      .map(([memberId, count]) => ({ memberId, count, isLeader: count === max && max > 0 }))
      .sort((a, b) => b.count - a.count);
  })();
  const myMvpVote = mvpVotes.find((v) => v.voterId === myId)?.voteeId ?? null;

  const quarterCounts = (() => {
    if (!event.squad) return [] as { memberId: number; count: number }[];
    const counts = new Map<number, number>();
    for (const q of event.squad.quarters) {
      for (const s of q.starters) {
        // 하프 분할이면 전반·후반 각각 0.5쿼터씩으로 센다.
        const weight = s.memberId2 !== undefined ? 0.5 : 1;
        if (s.memberId != null) counts.set(s.memberId, (counts.get(s.memberId) ?? 0) + weight);
        if (s.memberId2 != null) counts.set(s.memberId2, (counts.get(s.memberId2) ?? 0) + weight);
      }
    }
    return [...counts.entries()]
      .map(([memberId, count]) => ({ memberId, count }))
      .sort(
        (a, b) =>
          b.count - a.count ||
          (memberById.get(a.memberId)?.name ?? "").localeCompare(
            memberById.get(b.memberId)?.name ?? "",
            "ko"
          )
      );
  })();

  const vote = async (status: VoteStatus) => {
    if (!myId) return;
    const res = await fetch(`/api/events/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: myId, status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setVoteError(data?.error || "투표에 실패했어요.");
      return;
    }
    setVoteError("");
    load();
  };

  const postComment = async () => {
    if (!newComment.trim()) return;
    setCommentSaving(true);
    const res = await fetch(`/api/events/${id}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newComment.trim() }),
    });
    setCommentSaving(false);
    if (res.ok) {
      setNewComment("");
      load();
    }
  };

  const adminAddAttend = async () => {
    if (!adminAddPick) return;
    await fetch(`/api/events/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId: Number(adminAddPick), status: "attend" }),
    });
    setAdminAddPick("");
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

  // 슬롯 배정을 바꾸는 모든 조작(단일 배정, 하프 분할, 드래그 맞교체, 벤치 교체)의
  // 공통 진입점. starters 배열을 변형하는 함수를 받아 벤치를 재계산하고 저장한다.
  const updateStarters = async (
    quarterIdx: number,
    transform: (starters: SquadData["quarters"][number]["starters"]) => SquadData["quarters"][number]["starters"]
  ) => {
    if (!event.squad) return;
    const quarters = event.squad.quarters.map((q, qi) => {
      if (qi !== quarterIdx) return q;
      const starters = transform(q.starters);
      const starterIds = new Set(
        starters.flatMap((s) => [s.memberId, s.memberId2 ?? null]).filter((v): v is number => v != null)
      );
      return { starters, bench: attendIds.filter((mid) => !starterIds.has(mid)) };
    });
    const squad: SquadData = { ...event.squad, quarters };
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ squad }),
    });
    load();
  };

  const clearMemberElsewhere = (
    starters: SquadData["quarters"][number]["starters"],
    slotId: string,
    memberId: number
  ) =>
    starters.map((s) => {
      if (s.slotId === slotId) return s;
      const patch: Partial<{ memberId: number | null; memberId2: number | null }> = {};
      if (s.memberId === memberId) patch.memberId = null;
      if (s.memberId2 === memberId) patch.memberId2 = null;
      return Object.keys(patch).length ? { ...s, ...patch } : s;
    });

  const assignSlot = (
    quarterIdx: number,
    slotId: string,
    half: "full" | "first" | "second",
    memberIdRaw: string
  ) => {
    const newId = memberIdRaw ? Number(memberIdRaw) : null;
    updateStarters(quarterIdx, (starters) => {
      let next = newId != null ? clearMemberElsewhere(starters, slotId, newId) : starters;
      next = next.map((s) => {
        if (s.slotId !== slotId) return s;
        if (half === "first") return { ...s, memberId: newId };
        if (half === "second") return { ...s, memberId2: newId };
        return { ...s, memberId: newId };
      });
      return next;
    });
  };

  const toggleHalfSplit = (quarterIdx: number, slotId: string) => {
    updateStarters(quarterIdx, (starters) =>
      starters.map((s) => {
        if (s.slotId !== slotId) return s;
        if (s.memberId2 !== undefined) {
          return { slotId: s.slotId, memberId: s.memberId };
        }
        return { ...s, memberId2: null };
      })
    );
  };

  const swapSlots = (quarterIdx: number, slotIdA: string, slotIdB: string) => {
    if (slotIdA === slotIdB) return;
    updateStarters(quarterIdx, (starters) => {
      const a = starters.find((s) => s.slotId === slotIdA);
      const b = starters.find((s) => s.slotId === slotIdB);
      if (!a || !b) return starters;
      return starters.map((s) => {
        if (s.slotId === slotIdA) return { ...s, memberId: b.memberId, memberId2: b.memberId2 };
        if (s.slotId === slotIdB) return { ...s, memberId: a.memberId, memberId2: a.memberId2 };
        return s;
      });
    });
  };

  const substituteFromBench = (quarterIdx: number, slotId: string, benchMemberId: number) => {
    updateStarters(quarterIdx, (starters) =>
      clearMemberElsewhere(starters, slotId, benchMemberId).map((s) =>
        s.slotId === slotId ? { ...s, memberId: benchMemberId } : s
      )
    );
  };

  const handleSlotDragStart = (e: DragEvent, slotId: string) => {
    e.dataTransfer.setData("text/plain", `slot:${slotId}`);
  };
  const handleBenchDragStart = (e: DragEvent, memberId: number) => {
    e.dataTransfer.setData("text/plain", `bench:${memberId}`);
  };
  const handleSlotDrop = (e: DragEvent, targetSlotId: string) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("text/plain");
    if (data.startsWith("slot:")) {
      swapSlots(activeQuarter, data.slice(5), targetSlotId);
    } else if (data.startsWith("bench:")) {
      substituteFromBench(activeQuarter, targetSlotId, Number(data.slice(6)));
    }
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

  const voteMvp = async () => {
    if (!myId || !mvpPick) return;
    await fetch(`/api/events/${id}/mvp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voterId: myId, voteeId: Number(mvpPick) }),
    });
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
    results: { memberId: number; goals: number; assists: number }[],
    score: { scored: number | null; conceded: number | null } | null
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
    if (score?.scored != null) setScored(String(score.scored));
    if (score?.conceded != null) setConceded(String(score.conceded));
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
          {user?.role === "admin" && (
            <button
              onClick={removeEvent}
              className="text-xs text-red-500 underline"
            >
              일정 삭제
            </button>
          )}
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
        {voteClosed && (
          <p className="mb-3 rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-600">
            투표가 마감됐어요 ({counts.attend >= 20 ? "참석 20명 도달" : "경기 3일 전 마감"}
            ). 참석하고 싶으면 아래 댓글로 남겨 주세요.
          </p>
        )}
        <VoteButtons
          myStatus={myStatus}
          counts={counts}
          disabled={!myId || (voteClosed && !isAdmin)}
          onVote={vote}
        />
        {voteError && <p className="mt-2 text-xs text-red-500">{voteError}</p>}
        {!myId && (
          <p className="mt-2 text-xs text-zinc-400">
            {user
              ? "아직 멤버 프로필과 연결되지 않았어요. 운영진에게 요청해 주세요."
              : "투표하려면 먼저 로그인해 주세요."}{" "}
            {!user && (
              <Link className="text-emerald-700 underline" href="/login">
                로그인
              </Link>
            )}
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

        {isAdmin && (
          <div className="mt-4 flex items-center gap-2 border-t border-zinc-100 pt-3">
            <select
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
              value={adminAddPick}
              onChange={(e) => setAdminAddPick(e.target.value)}
            >
              <option value="">참석으로 직접 추가할 멤버 선택</option>
              {members
                .filter((m) => !attendIds.includes(m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.isGuest ? " · 용병" : ""}
                  </option>
                ))}
            </select>
            <button
              onClick={adminAddAttend}
              disabled={!adminAddPick}
              className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              참석 추가
            </button>
          </div>
        )}

        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-2 text-sm font-semibold text-zinc-500">댓글</p>
          {comments.length === 0 ? (
            <p className="mb-2 text-xs text-zinc-400">아직 댓글이 없어요.</p>
          ) : (
            <div className="mb-2 space-y-1.5">
              {comments.map((c) => (
                <p key={c.id} className="text-sm">
                  <span className="font-semibold">
                    {memberById.get(c.memberId)?.name ?? "?"}
                  </span>
                  <span className="ml-1.5 text-zinc-600">{c.body}</span>
                </p>
              ))}
            </div>
          )}
          {myId ? (
            <div className="flex items-center gap-2">
              <input
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                placeholder="참석 의사나 하고 싶은 말을 남겨보세요"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && postComment()}
              />
              <button
                onClick={postComment}
                disabled={commentSaving || !newComment.trim()}
                className="shrink-0 rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                등록
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-400">댓글을 남기려면 로그인해 주세요.</p>
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
            <h2 className="text-base font-bold">스쿼드 (4-1-2-2-1)</h2>
            <button
              onClick={regenerate}
              className="rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white"
            >
              {event.squad ? "다시 생성" : "자동 생성"}
            </button>
          </div>
          <p className="mb-3 text-xs text-zinc-400">
            경기 3일 전이 되면 참석 투표 기준으로 쿼터별(1~4쿼터) 스쿼드가
            자동 생성돼요. 포지션은 각자 멤버 탭의 1·2순위 선호를, 출전
            기회는 쿼터를 거듭할수록 덜 뛴 사람을 우선해서 나눠요. 아래
            선수 아이콘을 드래그해서 다른 자리와 맞바꿀 수 있어요.
          </p>

          {event.squad ? (
            <>
              <div className="mb-3 grid grid-cols-4 gap-1.5">
                {event.squad.quarters.map((_, qi) => (
                  <button
                    key={qi}
                    onClick={() => setActiveQuarter(qi)}
                    className={`rounded-xl py-2 text-sm font-semibold ${
                      activeQuarter === qi
                        ? "bg-emerald-700 text-white"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {qi + 1}쿼터
                  </button>
                ))}
              </div>

              <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl bg-emerald-700" style={{ aspectRatio: "3 / 4" }}>
                <div className="absolute inset-3 rounded-xl border-2 border-emerald-300/50" />
                <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-300/50" />
                <div className="absolute left-3 right-3 top-1/2 border-t-2 border-emerald-300/50" />
                {FORMATION_SLOTS.map((slot) => {
                  const asg = event.squad!.quarters[activeQuarter].starters.find(
                    (s) => s.slotId === slot.id
                  );
                  const isSplit = asg?.memberId2 !== undefined;
                  return (
                    <div
                      key={slot.id}
                      draggable
                      onDragStart={(e) => handleSlotDragStart(e, slot.id)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => handleSlotDrop(e, slot.id)}
                      className="absolute -translate-x-1/2 -translate-y-1/2 cursor-grab text-center active:cursor-grabbing"
                      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                    >
                      <div
                        className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${SLOT_CATEGORY_COLORS[slot.category].bg} ${SLOT_CATEGORY_COLORS[slot.category].text}`}
                      >
                        {slot.label}
                      </div>
                      {isSplit ? (
                        <p className="mt-0.5 max-w-20 truncate rounded bg-emerald-950/60 px-1 text-[10px] font-semibold text-white">
                          {nameOf(asg?.memberId ?? null)} / {nameOf(asg?.memberId2 ?? null)}
                        </p>
                      ) : (
                        <p className="mt-0.5 max-w-16 truncate rounded bg-emerald-950/60 px-1 text-[11px] font-semibold text-white">
                          {nameOf(asg?.memberId ?? null)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-2 flex justify-center gap-3 text-[11px] text-zinc-500">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />수비
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-violet-300" />미드필더
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />공격
                </span>
              </div>

              {event.squad.quarters[activeQuarter].bench.length > 0 && (
                <div className="mt-3 text-sm">
                  <span className="font-semibold text-zinc-500">
                    교체 대기 (드래그해서 자리에 투입):
                  </span>{" "}
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {event.squad.quarters[activeQuarter].bench.map((mid) => {
                      const m = memberById.get(mid);
                      return (
                        <span
                          key={mid}
                          draggable
                          onDragStart={(e) => handleBenchDragStart(e, mid)}
                          className="cursor-grab rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 active:cursor-grabbing"
                        >
                          {m ? `${m.name}${m.isGuest ? "(용병)" : ""}` : "?"}
                        </span>
                      );
                    })}
                  </span>
                </div>
              )}

              {quarterCounts.length > 0 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-emerald-700">
                    인당 출전 쿼터 수 (전체 {event.squad.quarters.length}쿼터 중)
                  </summary>
                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
                    {quarterCounts.map(({ memberId, count }) => {
                      const m = memberById.get(memberId);
                      return (
                        <div key={memberId} className="flex justify-between">
                          <span>
                            {m?.name ?? "?"}
                            {m?.isGuest ? " · 용병" : ""}
                          </span>
                          <span className="font-semibold text-zinc-500">
                            {count}쿼터
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}

              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-emerald-700">
                  {activeQuarter + 1}쿼터 수동으로 조정하기
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {FORMATION_SLOTS.map((slot) => {
                    const asg = event.squad!.quarters[activeQuarter].starters.find(
                      (s) => s.slotId === slot.id
                    );
                    const isSplit = asg?.memberId2 !== undefined;
                    const memberOptions = (excludeId: number | null) =>
                      members
                        .filter((m) => attendIds.includes(m.id) || m.id === excludeId)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.pos1}/{m.pos2}){m.isGuest ? " · 용병" : ""}
                          </option>
                        ));
                    return (
                      <div key={slot.id} className="space-y-1 rounded-lg border border-zinc-100 p-2">
                        <div className="flex items-center gap-2">
                          <span className="w-16 shrink-0 text-xs font-bold text-zinc-500">
                            {slotDisplayLabel(slot)}
                          </span>
                          {!isSplit && (
                            <select
                              className="flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                              value={asg?.memberId ?? ""}
                              onChange={(e) =>
                                assignSlot(activeQuarter, slot.id, "full", e.target.value)
                              }
                            >
                              <option value="">(비움)</option>
                              {memberOptions(asg?.memberId ?? null)}
                            </select>
                          )}
                          <button
                            onClick={() => toggleHalfSplit(activeQuarter, slot.id)}
                            className="shrink-0 rounded-lg bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-600"
                          >
                            {isSplit ? "하프분할 취소" : "하프분할"}
                          </button>
                        </div>
                        {isSplit && (
                          <div className="grid grid-cols-2 gap-2">
                            <label className="flex items-center gap-1">
                              <span className="shrink-0 text-[11px] text-zinc-400">전반</span>
                              <select
                                className="flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                                value={asg?.memberId ?? ""}
                                onChange={(e) =>
                                  assignSlot(activeQuarter, slot.id, "first", e.target.value)
                                }
                              >
                                <option value="">(비움)</option>
                                {memberOptions(asg?.memberId ?? null)}
                              </select>
                            </label>
                            <label className="flex items-center gap-1">
                              <span className="shrink-0 text-[11px] text-zinc-400">후반</span>
                              <select
                                className="flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                                value={asg?.memberId2 ?? ""}
                                onChange={(e) =>
                                  assignSlot(activeQuarter, slot.id, "second", e.target.value)
                                }
                              >
                                <option value="">(비움)</option>
                                {memberOptions(asg?.memberId2 ?? null)}
                              </select>
                            </label>
                          </div>
                        )}
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
          <h2 className="mb-1 text-base font-bold">경기 기록</h2>
          <p className="mb-3 text-xs text-zinc-400">
            출전 체크만 해도 1점, 골·어시 각 1점이 더해져요.
          </p>
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
                클린시트 → GK·센터백·윙백 1.25점, 수미 0.625점
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

      {event.type === "match" && (
        <section className="rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 className="mb-3 text-base font-bold">MVP 투표</h2>
          <div className="flex gap-2">
            <select
              className="flex-1 rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
              value={mvpPick || (myMvpVote != null ? String(myMvpVote) : "")}
              onChange={(e) => setMvpPick(e.target.value)}
              disabled={!myId}
            >
              <option value="">투표할 선수 선택</option>
              {members
                .filter((m) => attendIds.includes(m.id) && m.id !== myId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.isGuest ? " · 용병" : ""}
                  </option>
                ))}
            </select>
            <button
              onClick={voteMvp}
              disabled={!myId || !mvpPick}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              투표
            </button>
          </div>
          {!myId && (
            <p className="mt-2 text-xs text-zinc-400">
              {user
                ? "아직 멤버 프로필과 연결되지 않았어요."
                : "투표하려면 먼저 로그인해 주세요."}
            </p>
          )}

          {mvpTally.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {mvpTally.map((t) => {
                const m = memberById.get(t.memberId);
                return (
                  <div
                    key={t.memberId}
                    className="flex items-center gap-2 text-sm"
                  >
                    {t.isLeader && <span>🏆</span>}
                    <span className={t.isLeader ? "font-bold" : ""}>
                      {m?.name ?? "?"}
                    </span>
                    <span className="text-xs text-zinc-400">{t.count}표</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

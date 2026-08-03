"use client";

import { use, useCallback, useEffect, useMemo, useState } from "react";
import type { DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TimePicker from "@/components/TimePicker";
import VoteButtons from "@/components/VoteButtons";
import { useSession } from "@/components/useSession";
import { formatDate, dDayLabel, daysUntil } from "@/lib/format";
import type { MatchWeather } from "@/lib/weather";
import { ATTEND_CAP, isVotingClosed } from "@/lib/rules";
import {
  FORMATION_SLOTS,
  generateSquad,
  isSquadConfirmed,
  QUARTER_COUNT,
  SLOT_CATEGORY_COLORS,
  SQUAD_APPROVAL_THRESHOLD,
  slotDisplayLabel,
  slotFinalPosition,
  splitScrimmageTeams,
} from "@/lib/squad";
import { POS_CATEGORY, POS_CATEGORY_LABELS, POS_GROUPS } from "@/lib/types";
import type {
  CommentRow,
  EventItem,
  Member,
  MvpVoteRow,
  PosCategory,
  PosGroup,
  QuarterRecordEntry,
  RecordRow,
  SquadData,
  VoteRow,
  VoteStatus,
} from "@/lib/types";

const CATEGORY_ORDER: PosCategory[] = ["ATT", "MID", "DEF"];

const WEATHER_EMOJI: Record<string, string> = {
  맑음: "☀️",
  구름많음: "⛅",
  흐림: "☁️",
  비: "🌧️",
  "비/눈": "🌨️",
  눈: "❄️",
  소나기: "🌦️",
  빗방울: "🌦️",
  빗방울눈날림: "🌨️",
  눈날림: "🌨️",
};

interface GoalEntryDraft {
  key: string;
  scorerId: string;
  assistId: string;
}

interface QuarterRecordDraft {
  scored: string;
  conceded: string;
  goals: GoalEntryDraft[];
}

let goalKeySeq = 0;
const makeGoalKey = () => `g${++goalKeySeq}`;

const emptyRecordQuarters = (): QuarterRecordDraft[] =>
  Array.from({ length: QUARTER_COUNT }, () => ({ scored: "", conceded: "", goals: [] }));

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
  const [recordQuarters, setRecordQuarters] = useState<QuarterRecordDraft[]>(
    emptyRecordQuarters()
  );
  const [recordQuarterIdx, setRecordQuarterIdx] = useState(0);
  const [savedMsg, setSavedMsg] = useState("");
  const { user } = useSession();
  const myId = user?.memberId ?? null;
  const [activeQuarter, setActiveQuarter] = useState(0);
  const [activeTeam, setActiveTeam] = useState<"A" | "B">("A");
  const [weather, setWeather] = useState<MatchWeather | null>(null);
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
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoSaving, setInfoSaving] = useState(false);
  const [infoForm, setInfoForm] = useState({
    title: "",
    type: "match" as "match" | "social",
    opponent: "",
    date: "",
    time: "08:00",
    location: "",
  });
  const [notifying, setNotifying] = useState(false);
  const [notifyResult, setNotifyResult] = useState("");

  const memberById = useMemo(
    () => new Map(members.map((m) => [m.id, m])),
    [members]
  );

  // 스쿼드에 배정된 선수의 실제 포지션(전반/후반 하프 분할 포함). 경기 기록
  // 저장 시 클린시트 보너스 계산용 position 필드를 채우는 데 쓴다.
  const squadPositionByMember = useMemo(() => {
    const map = new Map<number, string>();
    if (event?.squad) {
      for (const qs of event.squad.quarters) {
        for (const s of qs.starters) {
          for (const mid of [s.memberId, s.memberId2]) {
            if (mid == null || map.has(mid)) continue;
            const mem = members.find((m) => m.id === mid);
            if (mem) map.set(mid, slotFinalPosition(s.slotId));
          }
        }
      }
    }
    return map;
  }, [event, members]);

  const load = useCallback(async () => {
    const [detail, mems, comms] = await Promise.all([
      fetch(`/api/events/${id}`).then((r) => r.json()),
      fetch("/api/members").then((r) => r.json()),
      fetch(`/api/events/${id}/comments`).then((r) => r.json()),
    ]);
    if (detail.error) return;
    const ev: EventItem = detail.event;
    setEvent(ev);
    setVotes(detail.votes);
    setMvpVotes(detail.mvpVotes ?? []);
    setComments(Array.isArray(comms) ? comms : []);
    setMembers(mems);

    if (Array.isArray(ev.recordLog) && ev.recordLog.length > 0) {
      setRecordQuarters(
        ev.recordLog.map((q) => ({
          scored: q.scored != null ? String(q.scored) : "",
          conceded: q.conceded != null ? String(q.conceded) : "",
          goals: q.goals.map((g) => ({
            key: makeGoalKey(),
            scorerId: g.scorerId != null ? String(g.scorerId) : "",
            assistId: g.assistId != null ? String(g.assistId) : "",
          })),
        }))
      );
    } else {
      setRecordQuarters(emptyRecordQuarters());
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // 날씨는 스쿼드 편집 등으로 load()가 재호출될 때마다 다시 부를 필요가
  // 없어서, 날짜·시각·장소가 실제로 바뀔 때만 따로 불러온다.
  useEffect(() => {
    if (!event || event.type !== "match") {
      setWeather(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/events/${id}/weather`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setWeather(d.weather ?? null);
      })
      .catch(() => {
        if (!cancelled) setWeather(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id, event?.type, event?.date, event?.time, event?.location]);

  if (!event) return <p className="py-10 text-center text-zinc-400">불러오는 중…</p>;

  const attendIds = votes.filter((v) => v.status === "attend").map((v) => v.memberId);
  const amAttendee = myId != null && attendIds.includes(myId);
  const counts: Record<VoteStatus, number> = {
    attend: attendIds.length,
    maybe: votes.filter((v) => v.status === "maybe").length,
    absent: votes.filter((v) => v.status === "absent").length,
  };
  const myStatus =
    votes.find((v) => v.memberId === myId)?.status ?? null;
  const nonVoters = members.filter(
    (m) => !m.isGuest && !votes.some((v) => v.memberId === m.id)
  );
  const statusOf = (memberId: number): VoteStatus | null =>
    votes.find((v) => v.memberId === memberId)?.status ?? null;
  const voteClosed = isVotingClosed(daysUntil(event.date), counts.attend);
  // 내전(자체 2팀 스크리미지) 모드: scrimmageSquad가 있으면 squad=A팀,
  // scrimmageSquad=B팀으로 취급하고, 탭으로 어느 팀을 보고/편집 중인지 고른다.
  const isScrimmage = !!event.scrimmageSquad;
  const currentSquad = activeTeam === "B" ? event.scrimmageSquad : event.squad;
  const squadField = activeTeam === "B" ? "scrimmageSquad" : "squad";
  // 팀 로스터(그 팀 소속 memberId 전체) — 매뉴얼 조정 드롭다운과 벤치 계산에
  // 쓴다. 슬롯 이동만으로는 팀 소속이 바뀌지 않으므로, 4쿼터 전체의
  // starters+bench 합집합으로 안정적으로 복원한다.
  const teamRosterIds = (squad: SquadData | null): number[] => {
    const ids = new Set<number>();
    if (!squad) return [];
    for (const q of squad.quarters) {
      for (const s of q.starters) {
        if (s.memberId != null) ids.add(s.memberId);
        if (s.memberId2 != null) ids.add(s.memberId2);
      }
      for (const mid of q.bench) ids.add(mid);
    }
    return [...ids];
  };
  const rosterIds = isScrimmage ? teamRosterIds(currentSquad) : attendIds;
  const isSquadLocked = isSquadConfirmed(currentSquad);
  const canEditSquad = !isSquadLocked || isAdmin;
  // 반대 팀으로 옮기는 건 두 팀 스쿼드를 동시에 바꾸는 조작이라, 지금 팀뿐
  // 아니라 반대 팀도 잠겨있지 않아야(또는 운영진이어야) 허용한다.
  const otherTeamSquad = activeTeam === "B" ? event.squad : event.scrimmageSquad;
  const canMoveTeam = isScrimmage && canEditSquad && (!isSquadConfirmed(otherTeamSquad) || isAdmin);
  const squadApprovedBy = currentSquad?.approvedBy ?? [];
  const iApprovedSquad = myId != null && squadApprovedBy.includes(myId);
  const hasAbsenteeInSquad =
    currentSquad?.quarters.some((q) =>
      q.starters.some(
        (s) =>
          (s.memberId != null && statusOf(s.memberId) === "absent") ||
          (s.memberId2 != null && statusOf(s.memberId2) === "absent")
      )
    ) ?? false;

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
    if (!currentSquad) return [] as { memberId: number; count: number }[];
    const counts = new Map<number, number>();
    for (const q of currentSquad.quarters) {
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

  // 쿼터별 입력을 합산한 요약 — 미리보기와 저장 둘 다 이 값을 쓴다.
  const recordSummary = (() => {
    let scoredSum = 0;
    let concededSum = 0;
    let anyScored = false;
    let anyConceded = false;
    const goals = new Map<number, number>();
    const assists = new Map<number, number>();
    for (const q of recordQuarters) {
      if (q.scored !== "") {
        scoredSum += Number(q.scored) || 0;
        anyScored = true;
      }
      if (q.conceded !== "") {
        concededSum += Number(q.conceded) || 0;
        anyConceded = true;
      }
      for (const g of q.goals) {
        if (g.scorerId) {
          const mid = Number(g.scorerId);
          goals.set(mid, (goals.get(mid) ?? 0) + 1);
        }
        if (g.assistId) {
          const mid = Number(g.assistId);
          assists.set(mid, (assists.get(mid) ?? 0) + 1);
        }
      }
    }
    const attendedIds = new Set([...attendIds, ...goals.keys(), ...assists.keys()]);
    return {
      scored: anyScored ? scoredSum : null,
      conceded: anyConceded ? concededSum : null,
      goals,
      assists,
      attendedIds,
    };
  })();

  // 쿼터별 실점 입력을 기준으로, 무실점인 쿼터에 뛴 GK·센터백·윙백·수미를
  // 골/어시처럼 바로 보여준다 — 저장 전에도 어떤 클린시트가 반영될지 미리 확인 가능.
  const quarterCleanSheetLines = (() => {
    if (!event.squad) return [] as string[];
    const lines: string[] = [];
    recordQuarters.forEach((q, qi) => {
      if (q.conceded === "" || Number(q.conceded) !== 0) return;
      const quarterSquad = event.squad!.quarters[qi];
      if (!quarterSquad) return;
      const names: string[] = [];
      for (const slot of quarterSquad.starters) {
        const ids = [slot.memberId, slot.memberId2].filter(
          (v): v is number => v != null
        );
        for (const mid of ids) {
          const mem = memberById.get(mid);
          if (!mem) continue;
          const pos = slotFinalPosition(slot.slotId);
          if (pos === "GK" || pos === "CB" || pos === "WB" || pos === "DM") {
            names.push(mem.name);
          }
        }
      }
      if (names.length > 0) {
        lines.push(`${qi + 1}쿼터 무실점 클린시트: ${names.join(", ")}`);
      }
    });
    return lines;
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

  const adminSetVote = async (memberId: number, status: VoteStatus) => {
    await fetch(`/api/events/${id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, status }),
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

  // 내전 모드가 아니면(=평소 단일 팀) 서버가 참석 투표를 다시 읽어 A팀
  // 스쿼드를 새로 만든다. 내전 모드면 지금 보고 있는 팀의 기존 로스터
  // (팀을 새로 나누지 않고) 그대로 포메이션·쿼터만 다시 섞는다.
  const regenerate = async () => {
    if (!isScrimmage) {
      await fetch(`/api/events/${id}/squad`, { method: "POST" });
      load();
      return;
    }
    const rosterMembers = members.filter((m) => rosterIds.includes(m.id));
    const squad = generateSquad(rosterMembers);
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [squadField]: squad }),
    });
    load();
  };

  // 참석자를 포지션 균형 맞춰 두 팀으로 나누고, 각 팀 포메이션도 함께
  // 새로 만든다. 이미 내전 모드였다면 두 팀 다 다시 나뉜다(재승인 필요).
  const splitScrimmage = async () => {
    if (isScrimmage && !confirm("두 팀을 다시 나눌까요? 기존 두 팀 스쿼드가 대체돼요."))
      return;
    const attendees = members.filter((m) => attendIds.includes(m.id));
    const { teamA, teamB } = splitScrimmageTeams(attendees);
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        squad: generateSquad(teamA),
        scrimmageSquad: generateSquad(teamB),
      }),
    });
    setActiveTeam("A");
    load();
  };

  // 내전 모드 종료 — B팀 스쿼드를 지우고 평소처럼 A팀(squad) 하나만 쓰는
  // 상태로 되돌린다. A팀 스쿼드 자체는 그대로 둔다.
  const endScrimmage = async () => {
    if (!confirm("내전 모드를 끝낼까요? B팀 스쿼드는 사라져요.")) return;
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scrimmageSquad: null }),
    });
    setActiveTeam("A");
    load();
  };

  // 내전 모드에서 특정 멤버를 반대 팀 로스터로 옮긴다. 두 팀 다 그 새
  // 로스터로 포메이션을 다시 만든다(어느 슬롯에 배정될지는 다시 계산됨).
  const moveToOtherTeam = async (memberId: number) => {
    if (!event.squad || !event.scrimmageSquad) return;
    const aIds = teamRosterIds(event.squad);
    const bIds = teamRosterIds(event.scrimmageSquad);
    const movingFromA = aIds.includes(memberId);
    const newAIds = movingFromA
      ? aIds.filter((mid) => mid !== memberId)
      : [...aIds, memberId];
    const newBIds = movingFromA
      ? [...bIds, memberId]
      : bIds.filter((mid) => mid !== memberId);
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        squad: generateSquad(members.filter((m) => newAIds.includes(m.id))),
        scrimmageSquad: generateSquad(members.filter((m) => newBIds.includes(m.id))),
      }),
    });
    load();
  };

  // 운영진 전용 비상 해제 — 승인 수와 상관없이 즉시 잠금을 풀고 승인 목록도
  // 비운다(다시 확정하려면 처음부터 새로 승인을 모아야 한다).
  const unlockSquad = async () => {
    if (!currentSquad) return;
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [squadField]: { ...currentSquad, confirmed: false, approvedBy: [] },
      }),
    });
    load();
  };

  // 내가 이미 승인했으면 취소, 아니면 승인 추가. SQUAD_APPROVAL_THRESHOLD명
  // 이상 모이면 isSquadConfirmed가 자동으로 확정 상태로 인식한다.
  const toggleSquadApproval = async () => {
    await fetch(`/api/events/${id}/squad/approve?team=${activeTeam}`, { method: "POST" });
    load();
  };

  // 불참으로 바뀐 멤버가 스쿼드에 남아있으면 그 자리에서만 빼낸다(다른 슬롯엔
  // 영향 없음). 승인은 스쿼드 구성이 바뀌는 것이므로 재승인이 필요하도록 비운다.
  const removeAbsenteesFromSquad = async () => {
    if (!currentSquad) return;
    const isAbsent = (mid: number | null | undefined) =>
      mid != null && statusOf(mid) === "absent";
    const quarters = currentSquad.quarters.map((q) => {
      const starters = q.starters.map((s) => {
        const patch: Partial<{ memberId: number | null; memberId2: number | null }> = {};
        if (isAbsent(s.memberId)) patch.memberId = null;
        if (isAbsent(s.memberId2)) patch.memberId2 = null;
        return Object.keys(patch).length ? { ...s, ...patch } : s;
      });
      const starterIds = new Set(
        starters.flatMap((s) => [s.memberId, s.memberId2 ?? null]).filter((v): v is number => v != null)
      );
      return { starters, bench: rosterIds.filter((mid) => !starterIds.has(mid)) };
    });
    const squad: SquadData = { ...currentSquad, quarters, confirmed: false, approvedBy: [] };
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [squadField]: squad }),
    });
    load();
  };

  // 슬롯 배정을 바꾸는 모든 조작(단일 배정, 하프 분할, 드래그 맞교체, 벤치 교체)의
  // 공통 진입점. starters 배열을 변형하는 함수를 받아 벤치를 재계산하고 저장한다.
  // 스쿼드 구성이 바뀌는 조작이므로 확정/승인 상태는 초기화한다(재승인 필요).
  const updateStarters = async (
    quarterIdx: number,
    transform: (starters: SquadData["quarters"][number]["starters"]) => SquadData["quarters"][number]["starters"]
  ) => {
    if (!currentSquad) return;
    const quarters = currentSquad.quarters.map((q, qi) => {
      if (qi !== quarterIdx) return q;
      const starters = transform(q.starters);
      const starterIds = new Set(
        starters.flatMap((s) => [s.memberId, s.memberId2 ?? null]).filter((v): v is number => v != null)
      );
      return { starters, bench: rosterIds.filter((mid) => !starterIds.has(mid)) };
    });
    const squad: SquadData = { ...currentSquad, quarters, confirmed: false, approvedBy: [] };
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [squadField]: squad }),
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

  const updateQuarterScore = (
    qi: number,
    patch: Partial<{ scored: string; conceded: string }>
  ) =>
    setRecordQuarters((qs) => qs.map((q, i) => (i === qi ? { ...q, ...patch } : q)));

  const addGoal = (qi: number) =>
    setRecordQuarters((qs) =>
      qs.map((q, i) =>
        i === qi
          ? { ...q, goals: [...q.goals, { key: makeGoalKey(), scorerId: "", assistId: "" }] }
          : q
      )
    );

  const removeGoal = (qi: number, key: string) =>
    setRecordQuarters((qs) =>
      qs.map((q, i) => (i === qi ? { ...q, goals: q.goals.filter((g) => g.key !== key) } : q))
    );

  const updateGoal = (
    qi: number,
    key: string,
    patch: Partial<{ scorerId: string; assistId: string }>
  ) =>
    setRecordQuarters((qs) =>
      qs.map((q, i) =>
        i === qi
          ? { ...q, goals: q.goals.map((g) => (g.key === key ? { ...g, ...patch } : g)) }
          : q
      )
    );

  const saveRecords = async () => {
    const records: Omit<RecordRow, "eventId">[] = [...recordSummary.attendedIds].map(
      (mid) => ({
        memberId: mid,
        played: 1,
        goals: recordSummary.goals.get(mid) ?? 0,
        assists: recordSummary.assists.get(mid) ?? 0,
        position:
          (squadPositionByMember.get(mid) as PosGroup | undefined) ||
          memberById.get(mid)?.pos1 ||
          "",
      })
    );
    const recordLog: QuarterRecordEntry[] = recordQuarters.map((q) => ({
      scored: q.scored === "" ? null : Number(q.scored),
      conceded: q.conceded === "" ? null : Number(q.conceded),
      goals: q.goals
        .filter((g) => g.scorerId || g.assistId)
        .map((g) => ({
          scorerId: g.scorerId ? Number(g.scorerId) : null,
          assistId: g.assistId ? Number(g.assistId) : null,
        })),
    }));
    await fetch(`/api/events/${id}/records`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        scored: recordSummary.scored,
        conceded: recordSummary.conceded,
        records,
        recordLog,
      }),
    });
    setSavedMsg(
      recordSummary.scored != null && recordSummary.conceded != null
        ? `기록이 저장되고 최종 스코어 ${recordSummary.scored} : ${recordSummary.conceded}로 게시됐어요.`
        : "기록이 저장됐어요."
    );
    setTimeout(() => setSavedMsg(""), 3000);
    load();
  };

  const voteMvp = async () => {
    if (!myId || !amAttendee || !mvpPick) return;
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

  const startEditInfo = () => {
    setInfoForm({
      title: event.title,
      type: event.type,
      opponent: event.opponent,
      date: event.date,
      time: event.time,
      location: event.location,
    });
    setEditingInfo(true);
  };

  const saveInfo = async () => {
    if (!infoForm.title.trim() || !infoForm.date) return;
    setInfoSaving(true);
    await fetch(`/api/events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(infoForm),
    });
    setInfoSaving(false);
    setEditingInfo(false);
    load();
  };

  const notifyNonVoters = async () => {
    if (!confirm(`미투표자 ${nonVoters.length}명에게 투표 독려 문자를 보낼까요?`)) return;
    setNotifying(true);
    setNotifyResult("");
    const res = await fetch(`/api/events/${id}/notify-nonvoters`, { method: "POST" });
    const data = await res.json();
    setNotifying(false);
    if (!res.ok) {
      setNotifyResult(data.error || "문자 발송에 실패했어요.");
      return;
    }
    const parts: string[] = [];
    if (data.sent.length > 0) parts.push(`${data.sent.length}명 발송 완료`);
    if (data.skippedNoPhone.length > 0)
      parts.push(`전화번호 없음 ${data.skippedNoPhone.length}명 제외`);
    if (data.failed.length > 0) parts.push(`발송 실패 ${data.failed.length}명`);
    setNotifyResult(parts.join(" · ") || "보낼 대상이 없어요.");
  };

  const nameOf = (mid: number | null) =>
    mid != null ? (memberById.get(mid)?.name ?? "?") : "미정";

  // 스쿼드를 짤 때 공격/미드필더/수비 인원을 한눈에 보려고 포지션(1순위)
  // 카테고리별로 묶어서 보여준다.
  const groupedByCategory = (memberIds: number[]) => {
    const byCat = new Map<PosCategory, string[]>();
    for (const mid of memberIds) {
      const m = memberById.get(mid);
      if (!m) continue;
      const cat = POS_CATEGORY[m.pos1];
      const list = byCat.get(cat) ?? [];
      list.push(`${m.name}${m.isGuest ? "(용병)" : ""}`);
      byCat.set(cat, list);
    }
    return CATEGORY_ORDER.filter((c) => (byCat.get(c)?.length ?? 0) > 0).map((c) => ({
      cat: c,
      label: POS_CATEGORY_LABELS[c],
      names: byCat.get(c)!,
    }));
  };

  const groupedVoters = (status: VoteStatus) =>
    groupedByCategory(votes.filter((v) => v.status === status).map((v) => v.memberId));

  // 팀 로스터를 포지션별로 묶되, 각 인원의 memberId도 같이 준다 — 내전
  // 모드에서 이름을 눌러 반대 팀으로 옮기는 조작에 필요하다.
  const groupedByCategoryIds = (memberIds: number[]) => {
    const byCat = new Map<PosCategory, number[]>();
    for (const mid of memberIds) {
      const m = memberById.get(mid);
      if (!m) continue;
      const cat = POS_CATEGORY[m.pos1];
      const list = byCat.get(cat) ?? [];
      list.push(mid);
      byCat.set(cat, list);
    }
    return CATEGORY_ORDER.filter((c) => (byCat.get(c)?.length ?? 0) > 0).map((c) => ({
      cat: c,
      label: POS_CATEGORY_LABELS[c],
      ids: byCat.get(c)!,
    }));
  };

  const numInput =
    "w-12 rounded-lg border border-zinc-300 bg-white px-1 py-1 text-center text-sm";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-bold text-blue-800">
            {dDayLabel(event.date)}
          </span>
          {isAdmin && !editingInfo && (
            <div className="flex gap-3">
              <button
                onClick={startEditInfo}
                className="text-xs font-semibold text-blue-700 underline"
              >
                정보 수정
              </button>
              <button
                onClick={removeEvent}
                className="text-xs text-red-500 underline"
              >
                일정 삭제
              </button>
            </div>
          )}
        </div>
        {editingInfo ? (
          <div className="mt-3 space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-semibold text-zinc-500">제목</label>
                <input
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={infoForm.title}
                  onChange={(e) => setInfoForm({ ...infoForm, title: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500">유형</label>
                <select
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={infoForm.type}
                  onChange={(e) =>
                    setInfoForm({ ...infoForm, type: e.target.value as "match" | "social" })
                  }
                >
                  <option value="match">경기</option>
                  <option value="social">모임/행사</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500">상대팀</label>
                <input
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
                  placeholder="경기일 때만"
                  value={infoForm.opponent}
                  onChange={(e) => setInfoForm({ ...infoForm, opponent: e.target.value })}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-zinc-500">날짜</label>
                <input
                  type="date"
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={infoForm.date}
                  onChange={(e) => setInfoForm({ ...infoForm, date: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-zinc-500">시간</label>
                <TimePicker
                  value={infoForm.time}
                  onChange={(time) => setInfoForm({ ...infoForm, time })}
                />
              </div>
              <div className="col-span-2">
                <label className="text-xs font-semibold text-zinc-500">장소</label>
                <input
                  className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm"
                  value={infoForm.location}
                  onChange={(e) => setInfoForm({ ...infoForm, location: e.target.value })}
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={saveInfo}
                disabled={infoSaving || !infoForm.title.trim() || !infoForm.date}
                className="flex-1 rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                {infoSaving ? "저장 중…" : "저장"}
              </button>
              <button
                onClick={() => setEditingInfo(false)}
                className="rounded-xl border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-600"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
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
            {weather && (
              <p className="mt-1 text-sm font-semibold text-zinc-600">
                {weather.pty ? WEATHER_EMOJI[weather.pty] : weather.sky ? WEATHER_EMOJI[weather.sky] : ""}{" "}
                {weather.pty ?? weather.sky ?? ""}
                {weather.tmp != null && ` · ${weather.tmp}°C`}
                {weather.pop != null && ` · 강수 ${weather.pop}%`}
              </p>
            )}
          </>
        )}
        {event.scored != null && event.conceded != null && (
          <p className="mt-2 text-2xl font-extrabold text-blue-700">
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
            투표가 마감됐어요 ({counts.attend >= ATTEND_CAP ? `참석 ${ATTEND_CAP}명 도달` : "경기 3일 전 마감"}
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
              <Link className="text-blue-700 underline" href="/login">
                로그인
              </Link>
            )}
          </p>
        )}
        <div className="mt-4 space-y-3 text-sm">
          {(
            [
              ["attend", "참석", "text-blue-700"],
              ["maybe", "미정", "text-amber-600"],
              ["absent", "불참", "text-zinc-500"],
            ] as [VoteStatus, string, string][]
          ).map(([status, label, colorClass]) => (
            <div key={status}>
              <span className={`font-semibold ${colorClass}`}>
                {label} {counts[status]}
              </span>
              <div className="mt-1 space-y-0.5">
                {groupedVoters(status).map((g) => (
                  <p key={g.cat} className="text-zinc-600">
                    <span className="font-semibold text-zinc-500">
                      {g.label} {g.names.length}
                    </span>{" "}
                    {g.names.join(", ")}
                  </p>
                ))}
              </div>
            </div>
          ))}
          {nonVoters.length > 0 && (
            <p className="text-xs text-zinc-400">
              미투표 {nonVoters.length}명: {nonVoters.map((m) => m.name).join(", ")}
            </p>
          )}
          {isAdmin && nonVoters.length > 0 && (
            <div className="mt-1.5">
              <button
                onClick={notifyNonVoters}
                disabled={notifying}
                className="rounded-lg bg-blue-700 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                {notifying ? "발송 중…" : "미투표자에게 문자 보내기"}
              </button>
              {notifyResult && (
                <p className="mt-1 text-xs text-zinc-500">{notifyResult}</p>
              )}
            </div>
          )}
        </div>

        {isAdmin && (
          <div className="mt-4 border-t border-zinc-100 pt-3">
            <div className="flex items-center gap-2">
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
                className="shrink-0 rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                참석 추가
              </button>
            </div>

            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-semibold text-blue-700">
                운영진: 전체 인원 참석 관리 (투표 마감 후에도 변경 가능)
              </summary>
              <div className="mt-2 max-h-96 space-y-1 overflow-y-auto rounded-lg border border-zinc-100 p-2">
                {members
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name, "ko"))
                  .map((m) => {
                    const st = statusOf(m.id);
                    return (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 py-1"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm">
                          {m.name}
                          {m.isGuest ? " · 용병" : ""}
                        </span>
                        <div className="flex shrink-0 gap-1">
                          {(
                            [
                              ["attend", "참석"],
                              ["maybe", "미정"],
                              ["absent", "불참"],
                            ] as [VoteStatus, string][]
                          ).map(([status, label]) => (
                            <button
                              key={status}
                              onClick={() => adminSetVote(m.id, status)}
                              className={`rounded-lg px-2 py-1 text-xs font-semibold ${
                                st === status
                                  ? status === "attend"
                                    ? "bg-blue-700 text-white"
                                    : status === "maybe"
                                      ? "bg-amber-500 text-white"
                                      : "bg-zinc-500 text-white"
                                  : "bg-zinc-100 text-zinc-600"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </details>
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
                className="shrink-0 rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
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
            className="text-sm font-semibold text-blue-700"
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
                className="w-full rounded-xl bg-blue-700 py-2 text-sm font-semibold text-white disabled:opacity-40"
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
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold">스쿼드 (4-1-2-2-1)</h2>
              {isSquadLocked && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                  🔒 확정된 스쿼드
                </span>
              )}
              {!isSquadLocked && squadApprovedBy.length > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-800">
                  승인 {squadApprovedBy.length}/{SQUAD_APPROVAL_THRESHOLD}
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {isAdmin && (
                <button
                  onClick={splitScrimmage}
                  className="rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {isScrimmage ? "내전 2팀 다시 나누기" : "내전 2팀 나누기"}
                </button>
              )}
              {isAdmin && isScrimmage && (
                <button
                  onClick={endScrimmage}
                  className="rounded-xl bg-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600"
                >
                  내전 모드 종료
                </button>
              )}
              {isAdmin && currentSquad && hasAbsenteeInSquad && (
                <button
                  onClick={removeAbsenteesFromSquad}
                  className="rounded-xl bg-red-500 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  불참자 정리
                </button>
              )}
              {isAdmin && currentSquad && (
                <button
                  onClick={isSquadLocked ? unlockSquad : toggleSquadApproval}
                  disabled={!isSquadLocked && !myId}
                  title={!isSquadLocked && !myId ? "멤버 프로필과 연결돼야 승인할 수 있어요" : undefined}
                  className="rounded-xl bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  {isSquadLocked
                    ? "확정 해제"
                    : `${iApprovedSquad ? "승인 취소" : "승인"} (${squadApprovedBy.length}/${SQUAD_APPROVAL_THRESHOLD})`}
                </button>
              )}
              {canEditSquad && (
                <button
                  onClick={regenerate}
                  className="rounded-xl bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  {currentSquad ? (isScrimmage ? "이 팀 다시 생성" : "다시 생성") : "자동 생성"}
                </button>
              )}
            </div>
          </div>
          {isScrimmage && (
            <div className="mb-3 grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setActiveTeam("A")}
                className={`rounded-xl py-2 text-sm font-bold ${
                  activeTeam === "A" ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700"
                }`}
              >
                A팀
              </button>
              <button
                onClick={() => setActiveTeam("B")}
                className={`rounded-xl py-2 text-sm font-bold ${
                  activeTeam === "B" ? "bg-violet-600 text-white" : "bg-violet-50 text-violet-700"
                }`}
              >
                B팀
              </button>
            </div>
          )}
          {squadApprovedBy.length > 0 && (
            <p className="mb-2 text-xs text-zinc-400">
              승인: {squadApprovedBy.map((mid) => memberById.get(mid)?.name ?? "?").join(", ")}
            </p>
          )}
          <p className="mb-3 text-xs text-zinc-400">
            {isScrimmage
              ? "내전(자체 훈련) 모드예요. 참석자를 포지션 균형에 맞춰 두 팀으로 나눠서, 팀마다 4-1-2-2-1 포메이션·쿼터를 따로 관리해요."
              : "경기 3일 전이 되면 참석 투표 기준으로 쿼터별(1~4쿼터) 스쿼드가 자동 생성돼요. 포지션은 각자 멤버 탭의 1·2순위 선호를, 출전 기회는 쿼터를 거듭할수록 덜 뛴 사람을 우선해서 나눠요."}
            {" "}운영진 {SQUAD_APPROVAL_THRESHOLD}명 이상이 승인하면 자동으로 확정돼요.
            {canEditSquad
              ? " 아래 선수 아이콘을 드래그해서 다른 자리와 맞바꿀 수 있어요."
              : " 스쿼드가 확정돼서 운영진만 수정할 수 있어요."}
          </p>

          {currentSquad ? (
            <>
              <div className="mb-3 rounded-xl bg-zinc-50 p-3 text-sm">
                <p className="mb-1.5 text-xs font-bold text-zinc-500">
                  {isScrimmage ? `${activeTeam}팀 전체 명단` : "전체 명단"} · {rosterIds.length}명
                  {canMoveTeam && ` · 이름을 누르면 ${activeTeam === "A" ? "B" : "A"}팀으로 이동`}
                </p>
                <div className="space-y-1.5">
                  {groupedByCategoryIds(rosterIds).map(({ cat, label, ids }) => (
                    <p key={cat} className="flex flex-wrap items-center gap-1">
                      <span className="mr-1 shrink-0 font-semibold text-zinc-500">
                        {label} {ids.length}
                      </span>
                      {ids.map((mid) => {
                        const m = memberById.get(mid);
                        const nameLabel = `${m?.name ?? "?"}${m?.isGuest ? "(용병)" : ""}`;
                        return canMoveTeam ? (
                          <button
                            key={mid}
                            onClick={() => moveToOtherTeam(mid)}
                            className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200"
                          >
                            {nameLabel}
                          </button>
                        ) : (
                          <span
                            key={mid}
                            className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-zinc-600 ring-1 ring-zinc-100"
                          >
                            {nameLabel}
                          </span>
                        );
                      })}
                    </p>
                  ))}
                </div>
              </div>

              <div className="mb-3 grid grid-cols-4 gap-1.5">
                {currentSquad.quarters.map((_, qi) => (
                  <button
                    key={qi}
                    onClick={() => setActiveQuarter(qi)}
                    className={`rounded-xl py-2 text-sm font-semibold ${
                      activeQuarter === qi
                        ? "bg-blue-700 text-white"
                        : "bg-zinc-100 text-zinc-600"
                    }`}
                  >
                    {qi + 1}쿼터
                  </button>
                ))}
              </div>

              <div className="relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl bg-blue-700" style={{ aspectRatio: "3 / 4" }}>
                <div className="absolute inset-3 rounded-xl border-2 border-blue-300/50" />
                <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-300/50" />
                <div className="absolute left-3 right-3 top-1/2 border-t-2 border-blue-300/50" />
                {FORMATION_SLOTS.map((slot) => {
                  const asg = currentSquad!.quarters[activeQuarter].starters.find(
                    (s) => s.slotId === slot.id
                  );
                  const isSplit = asg?.memberId2 !== undefined;
                  return (
                    <div
                      key={slot.id}
                      draggable={canEditSquad}
                      onDragStart={
                        canEditSquad ? (e) => handleSlotDragStart(e, slot.id) : undefined
                      }
                      onDragOver={canEditSquad ? (e) => e.preventDefault() : undefined}
                      onDrop={canEditSquad ? (e) => handleSlotDrop(e, slot.id) : undefined}
                      className={`absolute -translate-x-1/2 -translate-y-1/2 text-center ${canEditSquad ? "cursor-grab active:cursor-grabbing" : ""}`}
                      style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
                    >
                      <div
                        className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold ${SLOT_CATEGORY_COLORS[slot.category].bg} ${SLOT_CATEGORY_COLORS[slot.category].text}`}
                      >
                        {slot.label}
                      </div>
                      {isSplit ? (
                        <p className="mt-0.5 max-w-20 truncate rounded bg-blue-950/60 px-1 text-[10px] font-semibold text-white">
                          {nameOf(asg?.memberId ?? null)} / {nameOf(asg?.memberId2 ?? null)}
                        </p>
                      ) : (
                        <p className="mt-0.5 max-w-16 truncate rounded bg-blue-950/60 px-1 text-[11px] font-semibold text-white">
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

              {currentSquad.quarters[activeQuarter].bench.length > 0 && (
                <div className="mt-3 text-sm">
                  <span className="font-semibold text-zinc-500">
                    교체 대기{canEditSquad && " (드래그해서 자리에 투입)"}:
                  </span>{" "}
                  <span className="mt-1 flex flex-wrap gap-1.5">
                    {currentSquad.quarters[activeQuarter].bench.map((mid) => {
                      const m = memberById.get(mid);
                      return (
                        <span
                          key={mid}
                          draggable={canEditSquad}
                          onDragStart={
                            canEditSquad ? (e) => handleBenchDragStart(e, mid) : undefined
                          }
                          className={`rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-600 ${canEditSquad ? "cursor-grab active:cursor-grabbing" : ""}`}
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
                  <summary className="cursor-pointer text-sm font-semibold text-blue-700">
                    인당 출전 쿼터 수 (전체 {currentSquad.quarters.length}쿼터 중)
                  </summary>
                  <div className="mt-2 space-y-3">
                    {CATEGORY_ORDER.map((cat) => {
                      const rows = quarterCounts.filter(({ memberId }) => {
                        const m = memberById.get(memberId);
                        return m && POS_CATEGORY[m.pos1] === cat;
                      });
                      if (rows.length === 0) return null;
                      return (
                        <div key={cat}>
                          <p className="mb-1 text-xs font-bold text-zinc-400">
                            {POS_CATEGORY_LABELS[cat]}
                          </p>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm sm:grid-cols-3">
                            {rows.map(({ memberId, count }) => {
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
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}

              {canEditSquad && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-blue-700">
                  {activeQuarter + 1}쿼터 수동으로 조정하기
                </summary>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {FORMATION_SLOTS.map((slot) => {
                    const asg = currentSquad!.quarters[activeQuarter].starters.find(
                      (s) => s.slotId === slot.id
                    );
                    const isSplit = asg?.memberId2 !== undefined;
                    const memberOptions = (excludeId: number | null) =>
                      members
                        .filter((m) => rosterIds.includes(m.id) || m.id === excludeId)
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
              )}
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
            쿼터별로 스코어와 득점·어시스트를 입력하면 자동으로 합산돼서 최종
            스코어와 개인 기록에 반영돼요. 참석 투표한 사람만 선택할 수
            있어요 — 득점·어시가 없는 선수(예: 무실점 방어에 기여한
            수비수·GK)도 출전·클린시트 점수를 받으려면 반드시 참석으로
            등록돼 있어야 해요.
          </p>

          {isAdmin && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-zinc-50 p-2">
              <select
                className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                value={adminAddPick}
                onChange={(e) => setAdminAddPick(e.target.value)}
              >
                <option value="">
                  투표 없이 뛴 선수를 참석으로 추가
                </option>
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
                className="shrink-0 rounded-lg bg-blue-700 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
              >
                참석 추가
              </button>
            </div>
          )}

          <div className="mb-3 grid grid-cols-4 gap-1.5">
            {recordQuarters.map((_, qi) => (
              <button
                key={qi}
                onClick={() => setRecordQuarterIdx(qi)}
                className={`rounded-xl py-2 text-sm font-semibold ${
                  recordQuarterIdx === qi
                    ? "bg-blue-700 text-white"
                    : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {qi + 1}쿼터
              </button>
            ))}
          </div>

          <div className="mb-3 flex items-center gap-3">
            <label className="text-sm font-semibold">이 쿼터 득점</label>
            <input
              type="number"
              min={0}
              className={numInput}
              value={recordQuarters[recordQuarterIdx].scored}
              onChange={(e) =>
                updateQuarterScore(recordQuarterIdx, { scored: e.target.value })
              }
            />
            <label className="text-sm font-semibold">실점</label>
            <input
              type="number"
              min={0}
              className={numInput}
              value={recordQuarters[recordQuarterIdx].conceded}
              onChange={(e) =>
                updateQuarterScore(recordQuarterIdx, { conceded: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            {recordQuarters[recordQuarterIdx].goals.length === 0 && (
              <p className="text-xs text-zinc-400">
                이 쿼터에 입력된 골이 없어요.
              </p>
            )}
            {recordQuarters[recordQuarterIdx].goals.map((g) => (
              <div key={g.key} className="flex items-center gap-2">
                <select
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  value={g.scorerId}
                  onChange={(e) =>
                    updateGoal(recordQuarterIdx, g.key, { scorerId: e.target.value })
                  }
                >
                  <option value="">득점자 선택</option>
                  {members
                    .filter((m) => attendIds.includes(m.id))
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.isGuest ? " · 용병" : ""}
                      </option>
                    ))}
                </select>
                <select
                  className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  value={g.assistId}
                  onChange={(e) =>
                    updateGoal(recordQuarterIdx, g.key, { assistId: e.target.value })
                  }
                >
                  <option value="">어시 없음</option>
                  {members
                    .filter((m) => attendIds.includes(m.id) && String(m.id) !== g.scorerId)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {m.isGuest ? " · 용병" : ""}
                      </option>
                    ))}
                </select>
                <button
                  onClick={() => removeGoal(recordQuarterIdx, g.key)}
                  className="shrink-0 text-xs text-red-500"
                >
                  삭제
                </button>
              </div>
            ))}
            <button
              onClick={() => addGoal(recordQuarterIdx)}
              className="w-full rounded-lg border border-dashed border-zinc-300 py-1.5 text-xs font-semibold text-blue-700"
            >
              + 이 쿼터에 골 추가
            </button>
          </div>

          <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm">
            <p className="font-semibold text-zinc-600">
              전체 합산 스코어: {recordSummary.scored ?? "?"} : {recordSummary.conceded ?? "?"}
              {recordSummary.conceded === 0 && (
                <span className="ml-2 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-bold text-sky-700">
                  클린시트 → GK·센터백·윙백 1.25점, 수미 0.625점
                </span>
              )}
            </p>
            {recordSummary.goals.size > 0 && (
              <p className="mt-1 text-xs text-zinc-500">
                득점:{" "}
                {[...recordSummary.goals.entries()]
                  .map(([mid, n]) => `${memberById.get(mid)?.name ?? "?"} ${n}`)
                  .join(", ")}
              </p>
            )}
            {recordSummary.assists.size > 0 && (
              <p className="mt-1 text-xs text-zinc-500">
                어시스트:{" "}
                {[...recordSummary.assists.entries()]
                  .map(([mid, n]) => `${memberById.get(mid)?.name ?? "?"} ${n}`)
                  .join(", ")}
              </p>
            )}
            {quarterCleanSheetLines.map((line, i) => (
              <p key={i} className="mt-1 text-xs text-sky-700">
                {line}
              </p>
            ))}
          </div>

          <button
            onClick={saveRecords}
            className="mt-4 w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white"
          >
            저장하고 게시
          </button>
          {savedMsg && (
            <p className="mt-2 text-center text-sm font-semibold text-blue-700">
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
              disabled={!myId || !amAttendee}
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
              disabled={!myId || !amAttendee || !mvpPick}
              className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
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
          {myId && !amAttendee && (
            <p className="mt-2 text-xs text-zinc-400">
              경기 참여자(참석 투표)만 MVP 투표를 할 수 있어요.
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

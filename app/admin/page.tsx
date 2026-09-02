"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/useSession";
import { POS_GROUPS, POS_LABELS } from "@/lib/types";
import type { AppUser, Member, PosGroup } from "@/lib/types";

interface ApprovalDraft {
  mode: "link" | "new";
  memberId: string;
  pos1: PosGroup;
  pos2: PosGroup;
  backNo: string;
  phone: string;
  role: "admin" | "player";
}

// 대기 유저가 가입 때 스스로 입력한 값으로 초기 draft를 채운다(없으면
// 예전 방식대로 기본값). 운영진은 승인 전에 이 값을 그대로 두거나 바꿀 수 있다.
function initialDraft(u: AppUser): ApprovalDraft {
  return {
    mode: "link",
    memberId: "",
    pos1: u.draftPos1 ?? "CB",
    pos2: u.draftPos2 ?? "WB",
    backNo: u.draftBackNo != null ? String(u.draftBackNo) : "",
    phone: u.draftPhone ?? "",
    role: u.role,
  };
}

export default function AdminPage() {
  const { user, loading } = useSession();
  const [pending, setPending] = useState<AppUser[]>([]);
  const [unlinked, setUnlinked] = useState<AppUser[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [drafts, setDrafts] = useState<Record<number, ApprovalDraft>>({});
  const [linkPicks, setLinkPicks] = useState<Record<number, string>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    const [p, u, m] = await Promise.all([
      fetch("/api/admin/pending-users").then((r) => r.json()),
      fetch("/api/admin/unlinked-users").then((r) => r.json()),
      fetch("/api/members").then((r) => r.json()),
    ]);
    if (Array.isArray(p)) {
      setPending(p);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const u of p as AppUser[]) {
          if (!next[u.id]) next[u.id] = initialDraft(u);
        }
        return next;
      });
    }
    if (Array.isArray(u)) setUnlinked(u);
    setMembers(m);
  };

  useEffect(() => {
    if (user?.role === "admin") load();
  }, [user]);

  if (loading) return null;
  if (!user || user.role !== "admin") {
    return (
      <div className="space-y-3 pt-10 text-center">
        <p className="text-sm text-zinc-500">운영진만 볼 수 있는 페이지예요.</p>
        <Link href="/" className="font-semibold text-blue-700">
          홈으로
        </Link>
      </div>
    );
  }

  const setDraft = (id: number, patch: Partial<ApprovalDraft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  const approve = async (u: AppUser) => {
    const draft = drafts[u.id];
    setBusyId(u.id);
    const body =
      draft.mode === "link"
        ? {
            action: "approve",
            memberId: draft.memberId ? Number(draft.memberId) : null,
            role: draft.role,
          }
        : {
            action: "approve",
            newMember: {
              name: u.displayName,
              pos1: draft.pos1,
              pos2: draft.pos2,
              backNo: draft.backNo === "" ? null : Number(draft.backNo),
              phone: draft.phone.trim() || null,
            },
            role: draft.role,
          };
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "승인에 실패했어요. 다시 시도해 주세요.");
      return;
    }
    load();
  };

  const reject = async (u: AppUser) => {
    if (!confirm(`${u.displayName}(${u.username}) 가입을 거절할까요?`)) return;
    setBusyId(u.id);
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject" }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "거절 처리에 실패했어요. 다시 시도해 주세요.");
      return;
    }
    load();
  };

  const linkMember = async (u: AppUser) => {
    const memberId = linkPicks[u.id];
    if (!memberId) return;
    setBusyId(u.id);
    const res = await fetch(`/api/admin/users/${u.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "approve", memberId: Number(memberId) }),
    });
    setBusyId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "연결에 실패했어요. 다시 시도해 주세요.");
      return;
    }
    setLinkPicks((p) => ({ ...p, [u.id]: "" }));
    load();
  };

  const input = "rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">운영진 · 가입 승인</h1>
        <div className="flex flex-col items-end gap-1 text-sm">
          <Link href="/members" className="font-semibold text-blue-700">
            선수 명단 관리 →
          </Link>
          <Link href="/admin/fines" className="font-semibold text-blue-700">
            이번 달 미투표자 →
          </Link>
          <Link href="/admin/historical-stats" className="font-semibold text-blue-700">
            역대 기록 관리 →
          </Link>
        </div>
      </div>
      <p className="text-sm text-zinc-500">
        가입 신청자가 실제 팀원인지 이름을 보고 확인한 다음, 기존 멤버와
        연결하거나 새 멤버로 등록해 승인하세요.
      </p>

      {unlinked.length > 0 && (
        <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-800">
            멤버 연결이 안 된 승인 계정 ({unlinked.length}명)
          </p>
          <p className="text-xs text-amber-700">
            승인 때 “나중에 연결”로 남겨둔 계정이에요. 로그인은 되지만
            투표·기록 같은 기능은 멤버와 연결돼야 쓸 수 있어요.
          </p>
          <div className="space-y-2">
            {unlinked.map((u) => (
              <div
                key={u.id}
                className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3"
              >
                <span className="text-sm font-semibold">
                  {u.displayName}{" "}
                  <span className="font-normal text-zinc-400">@{u.username}</span>
                </span>
                <select
                  className={`${input} min-w-0 flex-1`}
                  value={linkPicks[u.id] ?? ""}
                  onChange={(e) =>
                    setLinkPicks((p) => ({ ...p, [u.id]: e.target.value }))
                  }
                >
                  <option value="">멤버 선택</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.backNo != null ? ` #${m.backNo}` : ""}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => linkMember(u)}
                  disabled={busyId === u.id || !linkPicks[u.id]}
                  className="shrink-0 rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                >
                  연결
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400">
          승인 대기 중인 가입 신청이 없어요.
        </p>
      )}

      <div className="space-y-3">
        {pending.map((u) => {
          const draft = drafts[u.id] ?? initialDraft(u);
          return (
            <div key={u.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="font-bold">
                {u.displayName}{" "}
                <span className="font-normal text-zinc-400">@{u.username}</span>
                {u.role === "admin" && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                    운영진 이름으로 자동 배정됨
                  </span>
                )}
              </p>
              <p className="mb-3 text-xs text-zinc-400">
                {new Date(u.createdAt).toLocaleString("ko-KR")} 가입 신청
              </p>

              <div className="mb-3 flex items-center gap-2 text-sm">
                <span className="text-xs font-semibold text-zinc-500">권한</span>
                <select
                  className={input}
                  value={draft.role}
                  onChange={(e) =>
                    setDraft(u.id, { role: e.target.value as "admin" | "player" })
                  }
                >
                  <option value="player">일반 선수</option>
                  <option value="admin">운영진</option>
                </select>
              </div>

              <div className="mb-3 flex gap-2 text-sm">
                <button
                  onClick={() => setDraft(u.id, { mode: "link" })}
                  className={`rounded-lg px-3 py-1.5 font-semibold ${
                    draft.mode === "link"
                      ? "bg-blue-700 text-white"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  기존 멤버와 연결
                </button>
                <button
                  onClick={() => setDraft(u.id, { mode: "new" })}
                  className={`rounded-lg px-3 py-1.5 font-semibold ${
                    draft.mode === "new"
                      ? "bg-blue-700 text-white"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  새 멤버로 추가
                </button>
              </div>

              {draft.mode === "link" ? (
                <select
                  className={`${input} w-full`}
                  value={draft.memberId}
                  onChange={(e) => setDraft(u.id, { memberId: e.target.value })}
                >
                  <option value="">멤버 선택 안 함 (나중에 연결)</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                      {m.backNo != null ? ` #${m.backNo}` : ""}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-zinc-400">
                    가입 신청자가 스스로 입력한 값이 미리 채워져 있어요 — 필요하면 바꾸세요.
                  </p>
                  <div className="flex gap-2">
                    <select
                      className={input}
                      value={draft.pos1}
                      onChange={(e) => setDraft(u.id, { pos1: e.target.value as PosGroup })}
                    >
                      {POS_GROUPS.map((g) => (
                        <option key={g} value={g}>
                          1순위 {POS_LABELS[g]}
                        </option>
                      ))}
                    </select>
                    <select
                      className={input}
                      value={draft.pos2}
                      onChange={(e) => setDraft(u.id, { pos2: e.target.value as PosGroup })}
                    >
                      {POS_GROUPS.map((g) => (
                        <option key={g} value={g}>
                          2순위 {POS_LABELS[g]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex gap-2">
                    <input
                      className={input}
                      type="number"
                      placeholder="등번호 (선택)"
                      value={draft.backNo}
                      onChange={(e) => setDraft(u.id, { backNo: e.target.value })}
                    />
                    <input
                      className={input}
                      type="tel"
                      placeholder="전화번호 (선택)"
                      value={draft.phone}
                      onChange={(e) => setDraft(u.id, { phone: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => approve(u)}
                  disabled={busyId === u.id}
                  className="flex-1 rounded-xl bg-blue-700 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  승인
                </button>
                <button
                  onClick={() => reject(u)}
                  disabled={busyId === u.id}
                  className="flex-1 rounded-xl border border-red-300 py-2 text-sm font-semibold text-red-600 disabled:opacity-40"
                >
                  거절
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

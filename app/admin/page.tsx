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
}

export default function AdminPage() {
  const { user, loading } = useSession();
  const [pending, setPending] = useState<AppUser[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [drafts, setDrafts] = useState<Record<number, ApprovalDraft>>({});
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = async () => {
    const [p, m] = await Promise.all([
      fetch("/api/admin/pending-users").then((r) => r.json()),
      fetch("/api/members").then((r) => r.json()),
    ]);
    if (Array.isArray(p)) {
      setPending(p);
      setDrafts((prev) => {
        const next = { ...prev };
        for (const u of p as AppUser[]) {
          if (!next[u.id]) next[u.id] = { mode: "link", memberId: "", pos1: "CB", pos2: "WB" };
        }
        return next;
      });
    }
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
        <Link href="/" className="font-semibold text-emerald-700">
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
        ? { action: "approve", memberId: draft.memberId ? Number(draft.memberId) : null }
        : {
            action: "approve",
            newMember: { name: u.displayName, pos1: draft.pos1, pos2: draft.pos2 },
          };
    await fetch(`/api/admin/users/${u.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyId(null);
    load();
  };

  const reject = async (u: AppUser) => {
    if (!confirm(`${u.displayName}(${u.username}) 가입을 거절할까요?`)) return;
    setBusyId(u.id);
    await fetch(`/api/admin/users/${u.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reject" }),
    });
    setBusyId(null);
    load();
  };

  const input = "rounded-xl border border-zinc-300 bg-white px-2 py-1.5 text-sm";

  return (
    <div className="space-y-4">
      <h1 className="text-lg font-bold">운영진 · 가입 승인</h1>
      <p className="text-sm text-zinc-500">
        가입 신청자가 실제 팀원인지 이름을 보고 확인한 다음, 기존 멤버와
        연결하거나 새 멤버로 등록해 승인하세요.
      </p>

      {pending.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400">
          승인 대기 중인 가입 신청이 없어요.
        </p>
      )}

      <div className="space-y-3">
        {pending.map((u) => {
          const draft = drafts[u.id] ?? { mode: "link", memberId: "", pos1: "CB", pos2: "WB" };
          return (
            <div key={u.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
              <p className="font-bold">
                {u.displayName}{" "}
                <span className="font-normal text-zinc-400">@{u.username}</span>
              </p>
              <p className="mb-3 text-xs text-zinc-400">
                {new Date(u.createdAt).toLocaleString("ko-KR")} 가입 신청
              </p>

              <div className="mb-3 flex gap-2 text-sm">
                <button
                  onClick={() => setDraft(u.id, { mode: "link" })}
                  className={`rounded-lg px-3 py-1.5 font-semibold ${
                    draft.mode === "link"
                      ? "bg-emerald-700 text-white"
                      : "bg-zinc-100 text-zinc-600"
                  }`}
                >
                  기존 멤버와 연결
                </button>
                <button
                  onClick={() => setDraft(u.id, { mode: "new" })}
                  className={`rounded-lg px-3 py-1.5 font-semibold ${
                    draft.mode === "new"
                      ? "bg-emerald-700 text-white"
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
              )}

              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => approve(u)}
                  disabled={busyId === u.id}
                  className="flex-1 rounded-xl bg-emerald-700 py-2 text-sm font-semibold text-white disabled:opacity-40"
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

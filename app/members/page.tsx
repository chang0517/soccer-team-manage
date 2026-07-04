"use client";

import { useEffect, useState } from "react";
import { POS_GROUPS, POS_LABELS } from "@/lib/types";
import type { Member, PosGroup } from "@/lib/types";

interface Draft {
  name: string;
  backNo: string;
  pos1: PosGroup;
  pos2: PosGroup;
}

const EMPTY: Draft = { name: "", backNo: "", pos1: "CM", pos2: "DF" };

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<Draft>(EMPTY);

  const load = () =>
    fetch("/api/members").then((r) => r.json()).then(setMembers);
  useEffect(() => {
    load();
  }, []);

  const add = async () => {
    if (!draft.name.trim()) return;
    await fetch("/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name,
        backNo: draft.backNo === "" ? null : Number(draft.backNo),
        pos1: draft.pos1,
        pos2: draft.pos2,
      }),
    });
    setDraft(EMPTY);
    load();
  };

  const saveEdit = async (id: number) => {
    await fetch(`/api/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editDraft.name,
        backNo: editDraft.backNo === "" ? null : Number(editDraft.backNo),
        pos1: editDraft.pos1,
        pos2: editDraft.pos2,
      }),
    });
    setEditingId(null);
    load();
  };

  const remove = async (m: Member) => {
    if (!confirm(`${m.name} 님을 삭제할까요? 투표·기록도 함께 삭제돼요.`)) return;
    await fetch(`/api/members/${m.id}`, { method: "DELETE" });
    load();
  };

  const input =
    "rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm";
  const posSelect = (
    value: PosGroup,
    onChange: (v: PosGroup) => void
  ) => (
    <select
      className={input}
      value={value}
      onChange={(e) => onChange(e.target.value as PosGroup)}
    >
      {POS_GROUPS.map((g) => (
        <option key={g} value={g}>
          {g} · {POS_LABELS[g]}
        </option>
      ))}
    </select>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg font-bold">멤버</h1>
        <span className="text-sm text-zinc-500">총 {members.length}명</span>
      </div>

      <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
        <p className="text-sm font-bold">멤버 추가</p>
        <div className="grid grid-cols-2 gap-2">
          <input
            className={input}
            placeholder="이름"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
          <input
            className={input}
            placeholder="등번호 (선택)"
            type="number"
            value={draft.backNo}
            onChange={(e) => setDraft({ ...draft, backNo: e.target.value })}
          />
          <div>
            <label className="text-xs font-semibold text-zinc-500">
              1순위 포지션
            </label>
            {posSelect(draft.pos1, (v) => setDraft({ ...draft, pos1: v }))}
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-500">
              2순위 포지션
            </label>
            {posSelect(draft.pos2, (v) => setDraft({ ...draft, pos2: v }))}
          </div>
        </div>
        <button
          onClick={add}
          disabled={!draft.name.trim()}
          className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          추가
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white">
        {members.map((m) => (
          <div key={m.id} className="border-b border-zinc-100 last:border-0">
            {editingId === m.id ? (
              <div className="space-y-2 bg-zinc-50 p-4">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className={input}
                    value={editDraft.name}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, name: e.target.value })
                    }
                  />
                  <input
                    className={input}
                    type="number"
                    placeholder="등번호"
                    value={editDraft.backNo}
                    onChange={(e) =>
                      setEditDraft({ ...editDraft, backNo: e.target.value })
                    }
                  />
                  {posSelect(editDraft.pos1, (v) =>
                    setEditDraft({ ...editDraft, pos1: v })
                  )}
                  {posSelect(editDraft.pos2, (v) =>
                    setEditDraft({ ...editDraft, pos2: v })
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => saveEdit(m.id)}
                    className="flex-1 rounded-xl bg-emerald-700 py-2 text-sm font-semibold text-white"
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setEditingId(null)}
                    className="flex-1 rounded-xl border border-zinc-300 py-2 text-sm"
                  >
                    취소
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
                  {m.backNo ?? "–"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{m.name}</p>
                  <p className="text-xs text-zinc-500">
                    1순위 {POS_LABELS[m.pos1]} · 2순위 {POS_LABELS[m.pos2]}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setEditingId(m.id);
                    setEditDraft({
                      name: m.name,
                      backNo: m.backNo != null ? String(m.backNo) : "",
                      pos1: m.pos1,
                      pos2: m.pos2,
                    });
                  }}
                  className="text-xs text-emerald-700 underline"
                >
                  수정
                </button>
                <button
                  onClick={() => remove(m)}
                  className="text-xs text-red-500 underline"
                >
                  삭제
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

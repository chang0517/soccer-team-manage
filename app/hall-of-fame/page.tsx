"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/useSession";
import type { HallOfFameRow, Member } from "@/lib/types";

const ROLE_FIELDS: { key: keyof Omit<HallOfFameRow, "id" | "year">; label: string }[] = [
  { key: "captainId", label: "주장" },
  { key: "viceCaptainId", label: "부주장" },
  { key: "managerId", label: "총무" },
  { key: "topScorerId", label: "득점왕" },
  { key: "topAssistId", label: "어시왕" },
  { key: "cleanSheetFirstId", label: "클린시트 1등" },
  { key: "overallFirstId", label: "종합 1위" },
];

type FormState = { year: string } & Record<
  | "captainId"
  | "viceCaptainId"
  | "managerId"
  | "topScorerId"
  | "topAssistId"
  | "cleanSheetFirstId"
  | "overallFirstId",
  string
>;

const emptyForm = (): FormState => ({
  year: "",
  captainId: "",
  viceCaptainId: "",
  managerId: "",
  topScorerId: "",
  topAssistId: "",
  cleanSheetFirstId: "",
  overallFirstId: "",
});

export default function HallOfFamePage() {
  const { user } = useSession();
  const isAdmin = user?.role === "admin";
  const [rows, setRows] = useState<HallOfFameRow[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const memberById = new Map(members.map((m) => [m.id, m]));
  const nameOf = (id: number | null) => (id != null ? memberById.get(id)?.name ?? "?" : "—");

  const load = () => {
    fetch("/api/hall-of-fame").then((r) => r.json()).then(setRows);
    fetch("/api/members").then((r) => r.json()).then(setMembers);
  };

  useEffect(() => {
    load();
  }, []);

  const startEdit = (row: HallOfFameRow) => {
    setForm({
      year: String(row.year),
      captainId: row.captainId != null ? String(row.captainId) : "",
      viceCaptainId: row.viceCaptainId != null ? String(row.viceCaptainId) : "",
      managerId: row.managerId != null ? String(row.managerId) : "",
      topScorerId: row.topScorerId != null ? String(row.topScorerId) : "",
      topAssistId: row.topAssistId != null ? String(row.topAssistId) : "",
      cleanSheetFirstId: row.cleanSheetFirstId != null ? String(row.cleanSheetFirstId) : "",
      overallFirstId: row.overallFirstId != null ? String(row.overallFirstId) : "",
    });
    setShowForm(true);
    setError("");
  };

  const submit = async () => {
    if (!form.year.trim()) {
      setError("연도를 입력해 주세요.");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch("/api/hall-of-fame", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "저장에 실패했어요.");
      return;
    }
    setForm(emptyForm());
    setShowForm(false);
    load();
  };

  const remove = async (id: number) => {
    if (!confirm("이 연도 기록을 삭제할까요?")) return;
    await fetch(`/api/hall-of-fame/${id}`, { method: "DELETE" });
    load();
  };

  const input = "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">명예의 전당</h1>
        {isAdmin && (
          <button
            onClick={() => {
              setShowForm((v) => !v);
              if (showForm) return;
              setForm(emptyForm());
            }}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
          >
            {showForm ? "닫기" : "+ 연도 추가/수정"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <label className="block text-xs font-semibold text-zinc-500">
            연도
            <input
              className={`${input} mt-1`}
              type="number"
              placeholder="예: 2026"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {ROLE_FIELDS.map((f) => (
              <label key={f.key} className="block text-xs font-semibold text-zinc-500">
                {f.label}
                <select
                  className={`${input} mt-1`}
                  value={form[f.key]}
                  onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                >
                  <option value="">(없음)</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={submit}
            disabled={saving || !form.year.trim()}
            className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? "저장 중…" : "저장"}
          </button>
        </div>
      )}

      {rows.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400">
          아직 등록된 명예의 전당 기록이 없어요.
        </p>
      )}

      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.id} className="rounded-2xl border border-zinc-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-emerald-700">{row.year}년</h2>
              {isAdmin && (
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => startEdit(row)}
                    className="text-emerald-700 underline"
                  >
                    수정
                  </button>
                  <button onClick={() => remove(row.id)} className="text-red-500 underline">
                    삭제
                  </button>
                </div>
              )}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm sm:grid-cols-3">
              {ROLE_FIELDS.map((f) => (
                <div key={f.key}>
                  <span className="text-xs text-zinc-400">{f.label}</span>
                  <p className="font-semibold">{nameOf(row[f.key])}</p>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

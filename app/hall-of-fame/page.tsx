"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/useSession";
import type { HallOfFameRow, Member } from "@/lib/types";

type RoleKey =
  | "captainId"
  | "viceCaptainId"
  | "managerId"
  | "topScorerId"
  | "topAssistId"
  | "cleanSheetFirstId"
  | "overallFirstId";

const LEADERSHIP_FIELDS: { key: RoleKey; label: string; icon: string }[] = [
  { key: "captainId", label: "주장", icon: "👑" },
  { key: "viceCaptainId", label: "부주장", icon: "🎖️" },
  { key: "managerId", label: "총무", icon: "📋" },
];

const SEASON_FIELDS: { key: RoleKey; label: string; icon: string }[] = [
  { key: "topScorerId", label: "득점왕", icon: "⚽" },
  { key: "topAssistId", label: "어시왕", icon: "🎯" },
  { key: "cleanSheetFirstId", label: "클린시트 1등", icon: "🧤" },
];

const ROLE_FIELDS = [...LEADERSHIP_FIELDS, { key: "overallFirstId" as const, label: "종합 1위", icon: "🏆" }, ...SEASON_FIELDS];

type FormState = { year: string } & Record<RoleKey, string>;

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

const AVATAR_COLORS = [
  "bg-rose-500",
  "bg-orange-500",
  "bg-amber-500",
  "bg-emerald-600",
  "bg-teal-500",
  "bg-sky-500",
  "bg-indigo-500",
  "bg-violet-500",
  "bg-fuchsia-500",
];

function avatarColor(seed: number) {
  return AVATAR_COLORS[seed % AVATAR_COLORS.length];
}

function RoleItem({
  icon,
  label,
  member,
  featured,
}: {
  icon: string;
  label: string;
  member: Member | undefined;
  featured?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl p-2.5 ${
        featured
          ? "bg-gradient-to-r from-amber-50 to-amber-100/60 ring-1 ring-amber-300"
          : "bg-zinc-50"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm ${
          featured ? "bg-amber-400" : "bg-white ring-1 ring-zinc-200"
        }`}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className={`text-[11px] font-semibold ${featured ? "text-amber-700" : "text-zinc-400"}`}>
          {label}
        </p>
        {member ? (
          <div className="flex items-center gap-1.5">
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white ${avatarColor(member.id)}`}
            >
              {member.name.slice(0, 1)}
            </span>
            <p className={`truncate text-sm font-bold ${featured ? "text-amber-900" : "text-zinc-800"}`}>
              {member.name}
            </p>
          </div>
        ) : (
          <p className="text-sm text-zinc-300">—</p>
        )}
      </div>
    </div>
  );
}

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
  const memberOf = (id: number | null) => (id != null ? memberById.get(id) : undefined);

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
    <div className="space-y-5">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-900 via-emerald-800 to-emerald-700 p-6 text-white shadow-lg">
        <div className="pointer-events-none absolute -right-6 -top-6 text-[120px] leading-none opacity-10">
          🏆
        </div>
        <div className="pointer-events-none absolute -bottom-8 -left-4 text-[90px] leading-none opacity-10">
          ⚽
        </div>
        <div className="relative flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-200">
              Raven FC
            </p>
            <h1 className="mt-1 text-2xl font-extrabold">🏆 명예의 전당</h1>
            <p className="mt-1 text-sm text-emerald-100">
              역대 주장단과 매 시즌 최고의 기록을 새겨둡니다.
            </p>
          </div>
          {isAdmin && (
            <button
              onClick={() => {
                setShowForm((v) => !v);
                if (showForm) return;
                setForm(emptyForm());
              }}
              className="shrink-0 rounded-xl bg-amber-400 px-4 py-2 text-sm font-bold text-amber-950 shadow hover:bg-amber-300"
            >
              {showForm ? "닫기" : "+ 연도 추가/수정"}
            </button>
          )}
        </div>
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
                {f.icon} {f.label}
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
        <p className="rounded-2xl border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-400">
          아직 등록된 명예의 전당 기록이 없어요.
        </p>
      )}

      <div className="space-y-4">
        {rows.map((row) => (
          <div
            key={row.id}
            className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between bg-gradient-to-r from-emerald-800 to-emerald-700 px-4 py-3">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-white">
                <span className="text-amber-300">✦</span>
                {row.year}
                <span className="text-sm font-semibold text-emerald-200">시즌</span>
              </h2>
              {isAdmin && (
                <div className="flex gap-2 text-xs">
                  <button
                    onClick={() => startEdit(row)}
                    className="rounded-lg bg-white/10 px-2 py-1 font-semibold text-white hover:bg-white/20"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => remove(row.id)}
                    className="rounded-lg bg-white/10 px-2 py-1 font-semibold text-red-200 hover:bg-white/20"
                  >
                    삭제
                  </button>
                </div>
              )}
            </div>

            <div className="p-4">
              <RoleItem
                icon="🏆"
                label="종합 1위"
                member={memberOf(row.overallFirstId)}
                featured
              />

              <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                리더십
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {LEADERSHIP_FIELDS.map((f) => (
                  <RoleItem key={f.key} icon={f.icon} label={f.label} member={memberOf(row[f.key])} />
                ))}
              </div>

              <p className="mb-1.5 mt-4 text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                시즌 기록
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {SEASON_FIELDS.map((f) => (
                  <RoleItem key={f.key} icon={f.icon} label={f.label} member={memberOf(row[f.key])} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

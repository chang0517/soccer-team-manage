"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { dDayLabel, formatDate, todayStr } from "@/lib/format";
import type { EventItem } from "@/lib/types";

const EMPTY_FORM = {
  title: "정기 경기",
  type: "match",
  date: "",
  time: "08:00",
  location: "",
  opponent: "",
};

export default function SchedulePage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = () =>
    fetch("/api/events").then((r) => r.json()).then(setEvents);
  useEffect(() => {
    load();
  }, []);

  const upcoming = events
    .filter((e) => e.date >= todayStr())
    .sort((a, b) => a.date.localeCompare(b.date));
  const past = events.filter((e) => e.date < todayStr());

  const submit = async () => {
    if (!form.title.trim() || !form.date) return;
    setSaving(true);
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setShowForm(false);
    setForm(EMPTY_FORM);
    load();
  };

  const input =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm";

  const EventRow = ({ e }: { e: EventItem }) => (
    <Link
      href={`/events/${e.id}`}
      className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
    >
      <div className="w-14 shrink-0 text-center">
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-bold ${
            e.date >= todayStr()
              ? "bg-emerald-100 text-emerald-800"
              : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {dDayLabel(e.date)}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {e.title}
          {e.opponent && (
            <span className="font-normal text-zinc-500"> vs {e.opponent}</span>
          )}
        </p>
        <p className="text-xs text-zinc-500">
          {formatDate(e.date, e.time)}
          {e.location && ` · ${e.location}`}
        </p>
      </div>
      {e.scored != null && e.conceded != null && (
        <span
          className={`text-sm font-bold ${
            e.scored > e.conceded
              ? "text-emerald-700"
              : e.scored < e.conceded
                ? "text-red-600"
                : "text-zinc-500"
          }`}
        >
          {e.scored}:{e.conceded}
        </span>
      )}
    </Link>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">일정</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white"
        >
          {showForm ? "닫기" : "+ 일정 추가"}
        </button>
      </div>

      {showForm && (
        <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-semibold text-zinc-500">제목</label>
              <input
                className={input}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500">유형</label>
              <select
                className={input}
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
              >
                <option value="match">경기</option>
                <option value="social">모임/행사</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500">상대팀</label>
              <input
                className={input}
                placeholder="경기일 때만"
                value={form.opponent}
                onChange={(e) => setForm({ ...form, opponent: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500">날짜</label>
              <input
                type="date"
                className={input}
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500">시간</label>
              <input
                type="time"
                className={input}
                value={form.time}
                onChange={(e) => setForm({ ...form, time: e.target.value })}
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-semibold text-zinc-500">장소</label>
              <input
                className={input}
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
          </div>
          <button
            onClick={submit}
            disabled={saving || !form.title.trim() || !form.date}
            className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? "저장 중…" : "일정 저장"}
          </button>
        </div>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-500">다가오는 일정</h2>
        {upcoming.length === 0 && (
          <p className="text-sm text-zinc-400">예정된 일정이 없어요.</p>
        )}
        {upcoming.map((e) => (
          <EventRow key={e.id} e={e} />
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-500">지난 일정</h2>
        {past.length === 0 && (
          <p className="text-sm text-zinc-400">지난 일정이 없어요.</p>
        )}
        {past.map((e) => (
          <EventRow key={e.id} e={e} />
        ))}
      </section>
    </div>
  );
}

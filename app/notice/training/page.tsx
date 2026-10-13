"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/useSession";
import type { AnnouncementRow } from "@/lib/types";

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatDateHeader(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

export default function TrainingPage() {
  const { user } = useSession();
  const [items, setItems] = useState<AnnouncementRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [sessionDate, setSessionDate] = useState(todayStr());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    fetch("/api/announcements").then((r) => r.json()).then(setItems);

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!title.trim() || !body.trim() || !sessionDate) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        body,
        category: "training",
        feedbackDate: sessionDate,
      }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "작성에 실패했어요.");
      return;
    }
    setTitle("");
    setBody("");
    setSessionDate(todayStr());
    setShowForm(false);
    load();
  };

  const input = "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm";

  const sessions = items.filter((a) => a.category === "training");
  const groups = new Map<string, AnnouncementRow[]>();
  for (const a of sessions) {
    const key = a.feedbackDate ?? a.createdAt.slice(0, 10);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(a);
  }
  const sortedDates = [...groups.keys()].sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="space-y-4">
      <Link href="/notice" className="text-sm font-semibold text-blue-700">
        ← 게시판
      </Link>
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">🏋️ 훈련 세션</h1>
        {user?.role === "admin" && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
          >
            {showForm ? "닫기" : "+ 세션 추가"}
          </button>
        )}
      </div>

      {showForm && (
        <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
          <label className="block text-xs font-semibold text-zinc-500">
            날짜
            <input
              className={`${input} mt-1`}
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
            />
          </label>
          <input
            className={input}
            placeholder="제목 (예: 10/13 패스&슈팅 훈련)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <label className="block text-xs font-semibold text-zinc-500">
            세션 HTML
            <textarea
              className={`${input} mt-1 resize-none font-mono text-xs`}
              rows={14}
              placeholder="여기에 훈련 세션 페이지의 HTML을 그대로 붙여넣어 주세요."
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={submit}
            disabled={saving || !title.trim() || !body.trim() || !sessionDate}
            className="w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? "저장 중…" : "추가하기"}
          </button>
        </div>
      )}

      {sessions.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400">
          아직 등록된 훈련 세션이 없어요.
        </p>
      )}

      <div className="space-y-5">
        {sortedDates.map((date) => (
          <div key={date}>
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-zinc-400">
              {formatDateHeader(date)}
            </p>
            <div className="space-y-2">
              {groups.get(date)!.map((a) => (
                <Link
                  key={a.id}
                  href={`/notice/${a.id}`}
                  className="block rounded-2xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
                >
                  <p className="font-semibold">{a.title}</p>
                  <p className="mt-1 text-xs text-zinc-400">{a.authorName}</p>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/useSession";
import type { AnnouncementRow } from "@/lib/types";

export default function NoticeListPage() {
  const { user } = useSession();
  const [items, setItems] = useState<AnnouncementRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    fetch("/api/announcements").then((r) => r.json()).then(setItems);

  useEffect(() => {
    load();
  }, []);

  const submit = async () => {
    if (!title.trim() || !body.trim()) return;
    setSaving(true);
    setError("");
    const res = await fetch("/api/announcements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "작성에 실패했어요.");
      return;
    }
    setTitle("");
    setBody("");
    setShowForm(false);
    load();
  };

  const input = "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm";
  const notices = items.filter((a) => a.category !== "coach_feedback");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">게시판</h1>
        {user?.role === "admin" && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-xl bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
          >
            {showForm ? "닫기" : "+ 공지 작성"}
          </button>
        )}
      </div>
      <Link
        href="/notice/coach"
        className="block rounded-xl bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700"
      >
        🗣️ 코치 피드백 보기 →
      </Link>

      {showForm && (
        <div className="space-y-3 rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
          <input
            className={input}
            placeholder="제목"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <textarea
            className={`${input} resize-none`}
            rows={5}
            placeholder="내용"
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            onClick={submit}
            disabled={saving || !title.trim() || !body.trim()}
            className="w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {saving ? "저장 중…" : "게시하기"}
          </button>
        </div>
      )}

      {notices.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400">
          아직 공지사항이 없어요.
        </p>
      )}

      <div className="space-y-2">
        {notices.map((a) => (
          <Link
            key={a.id}
            href={`/notice/${a.id}`}
            className="block rounded-2xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50"
          >
            <p className="font-semibold">{a.title}</p>
            <p className="mt-1 text-xs text-zinc-400">
              {a.authorName} · {new Date(a.createdAt).toLocaleDateString("ko-KR")}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

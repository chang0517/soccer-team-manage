"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/components/useSession";
import type { AnnouncementRow } from "@/lib/types";

export default function NoticeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { user } = useSession();
  const [item, setItem] = useState<AnnouncementRow | null>(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [feedbackDate, setFeedbackDate] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch(`/api/announcements/${id}`);
    if (!res.ok) return;
    const data: AnnouncementRow = await res.json();
    setItem(data);
    setTitle(data.title);
    setBody(data.body);
    setFeedbackDate(data.feedbackDate ?? "");
  };

  useEffect(() => {
    load();
  }, [id]);

  if (!item) return <p className="py-10 text-center text-zinc-400">불러오는 중…</p>;

  const isAdmin = user?.role === "admin";
  const isCoachFeedback = item.category === "coach_feedback";
  const backHref = isCoachFeedback ? "/notice/coach" : "/notice";
  const backLabel = isCoachFeedback ? "← 코치 피드백 목록" : "← 게시판";

  const save = async () => {
    setSaving(true);
    await fetch(`/api/announcements/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        isCoachFeedback ? { title, body, feedbackDate } : { title, body }
      ),
    });
    setSaving(false);
    setEditing(false);
    load();
  };

  const remove = async () => {
    if (!confirm("이 글을 삭제할까요?")) return;
    await fetch(`/api/announcements/${id}`, { method: "DELETE" });
    router.push(backHref);
  };

  const input = "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      <Link href={backHref} className="text-sm text-blue-700">
        {backLabel}
      </Link>

      <div className="rounded-2xl border border-zinc-200 bg-white p-4">
        {editing ? (
          <div className="space-y-3">
            {isCoachFeedback && (
              <label className="block text-xs font-semibold text-zinc-500">
                날짜
                <input
                  className={`${input} mt-1`}
                  type="date"
                  value={feedbackDate}
                  onChange={(e) => setFeedbackDate(e.target.value)}
                />
              </label>
            )}
            <input className={input} value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea
              className={`${input} resize-none`}
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={save}
                disabled={saving}
                className="flex-1 rounded-xl bg-blue-700 py-2 text-sm font-semibold text-white disabled:opacity-40"
              >
                저장
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex-1 rounded-xl border border-zinc-300 py-2 text-sm"
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                {isCoachFeedback && (
                  <span className="mb-1 inline-block rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-bold text-blue-700">
                    🗣️ 코치 피드백
                  </span>
                )}
                <h1 className="text-lg font-bold">{item.title}</h1>
              </div>
              {isAdmin && (
                <div className="flex shrink-0 gap-2 text-xs">
                  <button
                    onClick={() => setEditing(true)}
                    className="text-blue-700 underline"
                  >
                    수정
                  </button>
                  <button onClick={remove} className="text-red-500 underline">
                    삭제
                  </button>
                </div>
              )}
            </div>
            <p className="mt-1 text-xs text-zinc-400">
              {item.authorName} ·{" "}
              {isCoachFeedback && item.feedbackDate
                ? new Date(`${item.feedbackDate}T00:00:00`).toLocaleDateString("ko-KR")
                : new Date(item.createdAt).toLocaleString("ko-KR")}
            </p>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">{item.body}</p>
          </>
        )}
      </div>
    </div>
  );
}

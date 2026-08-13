"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/useSession";

export default function AccountPage() {
  const { user, loading: sessionLoading } = useSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const input =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm";

  const submit = async () => {
    if (!currentPassword || newPassword.length < 4) return;
    setLoading(true);
    setError("");
    setSuccess(false);
    const res = await fetch("/api/auth/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "비밀번호 변경에 실패했어요.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setSuccess(true);
  };

  if (sessionLoading) return null;

  if (!user) {
    return (
      <div className="space-y-3 pt-10 text-center">
        <p className="text-sm text-zinc-500">로그인이 필요해요.</p>
        <Link href="/login" className="font-semibold text-blue-700">
          로그인하러 가기
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 pt-10">
      <h1 className="text-center text-lg font-bold">계정 설정</h1>
      <p className="text-center text-sm text-zinc-500">
        {user.displayName}님 ({user.username})
      </p>
      {user.role === "admin" && (
        <div className="space-y-2 rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
          <p className="text-sm font-bold text-blue-900">운영진</p>
          <Link href="/admin" className="block text-sm font-semibold text-blue-700">
            가입 승인 관리 →
          </Link>
        </div>
      )}

      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <div>
          <label className="text-xs font-semibold text-zinc-500">현재 비밀번호</label>
          <input
            type="password"
            className={input}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-500">새 비밀번호</label>
          <input
            type="password"
            className={input}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {success && <p className="text-sm text-blue-700">비밀번호가 변경됐어요.</p>}
        <button
          onClick={submit}
          disabled={loading || !currentPassword || newPassword.length < 4}
          className="w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {loading ? "변경 중…" : "비밀번호 변경"}
        </button>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function SignupPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingMsg, setPendingMsg] = useState("");

  const submit = async () => {
    if (username.trim().length < 3 || password.length < 4 || !displayName.trim())
      return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username.trim(),
        password,
        displayName: displayName.trim(),
      }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "가입에 실패했어요.");
      return;
    }
    if (data.autoApproved) {
      router.push("/");
      router.refresh();
      return;
    }
    setPendingMsg(
      "가입 요청이 접수됐어요. 운영진이 이름을 확인하고 승인하면 로그인할 수 있어요."
    );
  };

  const input =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm";

  if (pendingMsg) {
    return (
      <div className="mx-auto max-w-sm space-y-4 pt-10 text-center">
        <h1 className="text-lg font-bold">가입 신청 완료</h1>
        <p className="rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600">
          {pendingMsg}
        </p>
        <Link href="/login" className="font-semibold text-emerald-700">
          로그인 화면으로
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 pt-10">
      <h1 className="text-center text-lg font-bold">가입하기</h1>
      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <div>
          <label className="text-xs font-semibold text-zinc-500">이름</label>
          <input
            className={input}
            placeholder="실명 (운영진이 이걸 보고 승인해요)"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-500">아이디</label>
          <input
            className={input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-500">비밀번호</label>
          <input
            type="password"
            className={input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          onClick={submit}
          disabled={
            loading ||
            username.trim().length < 3 ||
            password.length < 4 ||
            !displayName.trim()
          }
          className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {loading ? "가입 중…" : "가입 신청"}
        </button>
      </div>
      <p className="text-center text-sm text-zinc-500">
        이미 계정이 있나요?{" "}
        <Link href="/login" className="font-semibold text-emerald-700">
          로그인
        </Link>
      </p>
    </div>
  );
}

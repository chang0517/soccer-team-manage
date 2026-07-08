"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), password }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "로그인에 실패했어요.");
      return;
    }
    router.push("/");
    router.refresh();
  };

  const input =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-sm space-y-4 pt-10">
      <h1 className="text-center text-lg font-bold">로그인</h1>
      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <div>
          <label className="text-xs font-semibold text-zinc-500">아이디</label>
          <input
            className={input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <div>
          <label className="text-xs font-semibold text-zinc-500">비밀번호</label>
          <input
            type="password"
            className={input}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        <button
          onClick={submit}
          disabled={loading || !username.trim() || !password}
          className="w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {loading ? "로그인 중…" : "로그인"}
        </button>
      </div>
      <p className="text-center text-sm text-zinc-500">
        계정이 없나요?{" "}
        <Link href="/signup" className="font-semibold text-blue-700">
          가입하기
        </Link>
      </p>
    </div>
  );
}

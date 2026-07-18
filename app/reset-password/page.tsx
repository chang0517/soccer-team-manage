"use client";

import { useState } from "react";
import Link from "next/link";

export default function ResetPasswordPage() {
  const [step, setStep] = useState<"username" | "code" | "result">("username");
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [phoneHint, setPhoneHint] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tempPassword, setTempPassword] = useState("");

  const input =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm";

  const requestCode = async () => {
    if (!username.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/reset-password/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "인증번호 발송에 실패했어요.");
      return;
    }
    setPhoneHint(data.phoneHint || "");
    setStep("code");
  };

  const verifyCode = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/reset-password/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), code: code.trim() }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "인증에 실패했어요.");
      return;
    }
    setTempPassword(data.tempPassword);
    setStep("result");
  };

  if (step === "result") {
    return (
      <div className="mx-auto max-w-sm space-y-4 pt-10 text-center">
        <h1 className="text-lg font-bold">임시 비밀번호 발급 완료</h1>
        <div className="space-y-2 rounded-2xl border border-zinc-200 bg-white p-4">
          <p className="text-2xl font-bold tracking-wider text-blue-700">
            {tempPassword}
          </p>
          <p className="text-xs text-zinc-500">
            이 비밀번호로 로그인한 뒤, 설정에서 바로 바꿔 주세요.
          </p>
        </div>
        <Link href="/login" className="font-semibold text-blue-700">
          로그인하러 가기
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-4 pt-10">
      <h1 className="text-center text-lg font-bold">비밀번호 찾기</h1>
      <div className="space-y-3 rounded-2xl border border-zinc-200 bg-white p-4">
        <div>
          <label className="text-xs font-semibold text-zinc-500">아이디</label>
          <input
            className={input}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={step === "code"}
            onKeyDown={(e) => e.key === "Enter" && step === "username" && requestCode()}
          />
        </div>
        {step === "username" && (
          <button
            onClick={requestCode}
            disabled={loading || !username.trim()}
            className="w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {loading ? "발송 중…" : "인증번호 받기"}
          </button>
        )}
        {step === "code" && (
          <>
            {phoneHint && (
              <p className="text-xs text-zinc-500">
                {phoneHint}(으)로 인증번호를 보냈어요.
              </p>
            )}
            <div>
              <label className="text-xs font-semibold text-zinc-500">인증번호</label>
              <input
                className={input}
                inputMode="numeric"
                placeholder="6자리 숫자"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyCode()}
              />
            </div>
            <button
              onClick={verifyCode}
              disabled={loading || !code.trim()}
              className="w-full rounded-xl bg-blue-700 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {loading ? "확인 중…" : "확인"}
            </button>
            <button
              onClick={() => {
                setStep("username");
                setCode("");
                setError("");
              }}
              className="w-full text-xs text-zinc-500"
            >
              아이디를 다시 입력할게요
            </button>
          </>
        )}
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
      <p className="text-center text-sm text-zinc-500">
        <Link href="/login" className="font-semibold text-blue-700">
          로그인으로 돌아가기
        </Link>
      </p>
    </div>
  );
}

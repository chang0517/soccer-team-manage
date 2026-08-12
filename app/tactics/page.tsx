"use client";

import { useEffect, useRef, useState } from "react";
import TacticsBoard from "@/components/TacticsBoard";
import { useSession } from "@/components/useSession";
import type { TacticsScene } from "@/lib/types";

const PLACEHOLDER =
  "예: 오른쪽 풀백이 오버래핑하면서 크로스를 올리고, 스트라이커가 니어포스트로 침투해서 헤더로 마무리";

const JOB_ID_KEY = "tactics-job-id";
const POLL_INTERVAL_MS = 2500;
// 서버 쪽 백그라운드 생성 예산(최대 280초)보다 여유 있게 잡는다 — 그보다
// 짧으면 서버가 아직 정상적으로 작업 중인데 클라이언트가 먼저 포기해버린다.
const POLL_GIVE_UP_MS = 5 * 60 * 1000;

// 새로고침하거나 앱을 다시 열었을 때도 이전에 만들던 작업이 있으면 이어서
// 확인한다 — 생성은 화면과 별개로 서버에서 계속 진행 중이었을 수 있다.
// 렌더 중(초기 state)에 읽어서, 이펙트에서 setState하는 걸 피한다.
function readSavedJobId(): number | null {
  if (typeof window === "undefined") return null;
  const saved = localStorage.getItem(JOB_ID_KEY);
  return saved ? Number(saved) : null;
}

export default function TacticsPage() {
  const { user } = useSession();
  const [description, setDescription] = useState("");
  const [jobId, setJobId] = useState<number | null>(readSavedJobId);
  const [status, setStatus] = useState<"idle" | "pending" | "done" | "error">(() =>
    readSavedJobId() != null ? "pending" : "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [scene, setScene] = useState<TacticsScene | null>(null);
  const [rawResponse, setRawResponse] = useState<string | null>(null);
  const pollStartRef = useRef<number>(0);

  useEffect(() => {
    if (jobId == null || status !== "pending") return;
    pollStartRef.current = Date.now();

    const timer = setInterval(async () => {
      if (Date.now() - pollStartRef.current > POLL_GIVE_UP_MS) {
        clearInterval(timer);
        setStatus("error");
        setError(
          "생성이 너무 오래 걸리네요. 서버에서는 계속 진행 중일 수 있으니, 잠시 후 이 페이지를 다시 열어보세요."
        );
        return;
      }
      try {
        const res = await fetch(`/api/tactics/${jobId}`);
        if (!res.ok) return; // 일시적 오류는 다음 폴링에서 재시도
        const data = await res.json();
        if (data.status === "done") {
          clearInterval(timer);
          localStorage.removeItem(JOB_ID_KEY);
          setScene(data.result);
          setRawResponse(data.rawResponse ?? null);
          setStatus("done");
        } else if (data.status === "error") {
          clearInterval(timer);
          localStorage.removeItem(JOB_ID_KEY);
          setError(data.error || "생성에 실패했어요.");
          setRawResponse(data.rawResponse ?? null);
          setStatus("error");
        }
      } catch {
        // 네트워크 순간 끊김은 무시하고 다음 폴링에서 재시도한다.
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [jobId, status]);

  const generate = async () => {
    if (!description.trim() || status === "pending") return;
    setError(null);
    setScene(null);
    setRawResponse(null);
    setStatus("pending");
    try {
      const res = await fetch("/api/tactics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성에 실패했어요.");
      localStorage.setItem(JOB_ID_KEY, String(data.jobId));
      pollStartRef.current = Date.now();
      setJobId(data.jobId);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "생성에 실패했어요.");
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 md:pb-10">
      <h1 className="mb-1 text-lg font-bold">전술 시뮬레이터</h1>
      <p className="mb-4 text-sm text-zinc-500">
        상황을 글로 설명하면 핵심 인물 몇 명과 움직임 화살표로 전술판 애니메이션을 만들어줘요.
        팀 맥미니에서 도는 로컬 AI가 만드는 거라 결과가 완벽하지 않을 수 있고, 최대
        1~2분 걸릴 수 있어요. 생성 중엔 앱을 나가거나 화면을 꺼도 서버에서 계속
        진행되고, 다시 열면 이어서 확인해요.
      </p>

      {!user && (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
          로그인 후 이용할 수 있어요.
        </p>
      )}

      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder={PLACEHOLDER}
        rows={4}
        disabled={status === "pending"}
        className="w-full rounded-xl border border-zinc-200 p-3 text-sm disabled:opacity-60"
      />
      <button
        onClick={generate}
        disabled={!user || status === "pending" || !description.trim()}
        className="mt-2 w-full rounded-xl bg-blue-700 py-2.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {status === "pending" ? "만드는 중… (최대 1~2분 걸릴 수 있어요)" : "전술 만들기"}
      </button>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-600">{error}</p>
      )}

      {scene && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
          <TacticsBoard scene={scene} />
        </div>
      )}

      {rawResponse && (
        <details className="mt-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
          <summary className="cursor-pointer font-semibold text-zinc-500">
            운영진 디버그: 모델 원본 응답
          </summary>
          <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-[11px] text-zinc-600">
            {rawResponse}
          </pre>
        </details>
      )}
    </main>
  );
}

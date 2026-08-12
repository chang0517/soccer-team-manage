"use client";

import { useEffect, useRef, useState } from "react";
import TacticsBoard from "@/components/TacticsBoard";
import { useSession } from "@/components/useSession";
import { PITCH_ZONES, ZONE_COLS, ZONE_ROWS } from "@/lib/tacticsZones";
import type { TacticsScene } from "@/lib/types";

const PLACEHOLDER =
  "예: B3에 있는 오른쪽 윙백이 C2의 미드필더에게 패스하고 A2로 침투해서 스트라이커에게 연결, 헤더로 마무리";

const JOB_ID_KEY = "tactics-job-id";
const POLL_INTERVAL_MS = 2500;
// 서버 쪽 백그라운드 생성 예산(최대 800초)보다 여유 있게 잡는다 — 그보다
// 짧으면 서버가 아직 정상적으로 작업 중인데 클라이언트가 먼저 포기해버린다.
const POLL_GIVE_UP_MS = 14 * 60 * 1000;
const SERVER_BUDGET_SEC = 800;

// 토큰 스트리밍이 아니라서 정확한 진행률은 알 수 없다 — 경과 시간대별로
// 지금 상황을 정직하게 설명해주는 문구만 보여준다.
function progressHint(elapsedSec: number): string {
  if (elapsedSec < 30) return "요청을 맥미니로 전달했어요.";
  if (elapsedSec < 120) return "맥미니가 생성 중이에요.";
  if (elapsedSec < 300) return "생각보다 오래 걸리고 있어요 — 모델이 크면 흔한 일이에요.";
  return "많이 걸리고 있어요. 맥미니가 메모리 압박으로 느려졌을 수 있어요. 계속 기다리거나 취소 후 다시 시도해보세요.";
}

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
  // 진행 상황 표시용 — 토큰 스트리밍이 아니라서 정확한 %는 못 보여주지만,
  // 최소한 "살아있고 얼마나 걸리고 있는지"는 보여준다.
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
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
        if (data.model) setModel(data.model);
        if (data.createdAt) setStartedAt(data.createdAt);
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

  // 진행 중일 때 1초마다 경과 시간을 갱신한다(폴링과는 별개 — 서버를
  // 다시 부르지 않고 화면 타이머만 움직인다).
  useEffect(() => {
    if (status !== "pending" || !startedAt) return;
    const start = new Date(startedAt).getTime();
    const timer = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [status, startedAt]);

  const generate = async () => {
    if (!description.trim() || status === "pending") return;
    setError(null);
    setScene(null);
    setRawResponse(null);
    setModel(null);
    setStartedAt(null);
    setElapsedSec(0);
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
      setModel(data.model ?? null);
      setStartedAt(data.createdAt ?? null);
      setJobId(data.jobId);
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : "생성에 실패했어요.");
    }
  };

  // 맥미니가 백그라운드에서 하던 연산 자체를 즉시 멈추진 못하지만(서버리스라
  // 실행 중인 작업을 취소할 채널이 없다), 화면에서는 즉시 기다리는 걸
  // 멈추고 작업을 'cancelled'로 표시해서 나중에 결과가 나와도 무시되게 한다.
  const cancel = () => {
    if (status !== "pending") return;
    localStorage.removeItem(JOB_ID_KEY);
    if (jobId != null) {
      fetch(`/api/tactics/${jobId}`, { method: "DELETE" }).catch(() => {});
    }
    setJobId(null);
    setStatus("idle");
    setModel(null);
    setStartedAt(null);
    setElapsedSec(0);
  };

  const elapsedLabel = `${Math.floor(elapsedSec / 60)}:${String(elapsedSec % 60).padStart(2, "0")}`;

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 md:pb-10">
      <h1 className="mb-1 text-lg font-bold">전술 시뮬레이터</h1>
      <p className="mb-4 text-sm text-zinc-500">
        상황을 글로 설명하면 핵심 인물 몇 명과 움직임 화살표로 전술판 애니메이션을 만들어줘요.
        경기장은 아래처럼 15개 구역(A1~E3)으로 나뉘어 있는데, 설명에 그 구역 코드를
        직접 넣으면(예: &quot;B3에서 C2로 패스&quot;) 더 정확하게 반영돼요. 팀 맥미니에서
        도는 로컬 AI가 만드는 거라 결과가 완벽하지 않을 수 있고, 모델 크기에 따라 몇
        분씩 걸릴 수 있어요. 생성 중엔 앱을 나가거나 화면을 꺼도 서버에서 계속
        진행되고, 다시 열면 이어서 확인해요.
      </p>

      <details open className="mb-4 rounded-2xl border border-zinc-200 bg-white p-3">
        <summary className="cursor-pointer text-sm font-bold text-zinc-700">
          구역 안내 — A열이 상대 골문 쪽, E열이 우리 골문 쪽
        </summary>
        <div className="mt-3 rounded-xl bg-blue-700 p-2">
          <div className="grid grid-cols-3 gap-1">
            {ZONE_ROWS.flatMap((row) =>
              ZONE_COLS.map((col) => {
                const code = `${row}${col}`;
                const zone = PITCH_ZONES[code];
                return (
                  <div key={code} className="rounded-lg bg-blue-600/70 py-1.5 text-center">
                    <p className="text-xs font-bold text-white">{code}</p>
                    <p className="text-[10px] leading-tight text-blue-100">{zone.label}</p>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </details>

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
      <div className="mt-2 flex gap-2">
        <button
          onClick={generate}
          disabled={!user || status === "pending" || !description.trim()}
          className="flex-1 rounded-xl bg-blue-700 py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {status === "pending" ? "만드는 중… (몇 분 걸릴 수 있어요)" : "전술 만들기"}
        </button>
        {status === "pending" && (
          <button
            onClick={cancel}
            className="rounded-xl bg-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-600"
          >
            취소
          </button>
        )}
      </div>

      {status === "pending" && (
        <div className="mt-3 rounded-xl bg-blue-50 p-3 text-xs text-blue-800">
          <p className="font-semibold">
            ⏱ {elapsedLabel} 경과{model && ` · ${model}`}
          </p>
          <p className="mt-1 text-blue-700">{progressHint(elapsedSec)}</p>
          <p className="mt-1 text-blue-700/70">
            최대 {Math.round(SERVER_BUDGET_SEC / 60)}분까지 기다려요 — 그 안에 안 끝나면
            자동으로 실패 처리돼요.
          </p>
        </div>
      )}

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

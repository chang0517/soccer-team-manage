"use client";

import { useEffect, useRef, useState } from "react";
import type { TacticsScene } from "@/lib/types";

const STEP_DURATION_MS = 1800;
// 선수/공 아이콘의 CSS transition 시간과 반드시 같아야 한다(아래 duration-[900ms]).
const MOVE_DURATION_MS = 900;

const TEAM_STYLE: Record<"A" | "B", string> = {
  A: "bg-blue-600 text-white",
  B: "bg-rose-500 text-white",
};

export default function TacticsBoard({ scene }: { scene: TacticsScene }) {
  const [stepIdx, setStepIdx] = useState(0);
  // 화살표는 stepIdx가 바로 바뀌어도 곧장 다음 단계 것으로 넘어가지 않고,
  // 공/선수가 실제로 슬라이드하는 동안(MOVE_DURATION_MS)은 "떠나는" 단계의
  // 화살표를 그대로 보여준다 — 그래야 공이 화살표를 따라 움직이는 것처럼
  // 보인다. 움직임이 끝나면 그제서야 새 단계 자신의 화살표로 바뀐다.
  const [arrowStepIdx, setArrowStepIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastStep = scene.steps.length - 1;

  useEffect(() => {
    const t = setTimeout(() => setArrowStepIdx(stepIdx), MOVE_DURATION_MS);
    return () => clearTimeout(t);
  }, [stepIdx]);

  useEffect(() => {
    if (!playing) return;
    timerRef.current = setInterval(() => {
      setStepIdx((i) => {
        if (i >= lastStep) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, STEP_DURATION_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [playing, lastStep]);

  const step = scene.steps[stepIdx];
  const arrowStep = scene.steps[arrowStepIdx];
  const togglePlay = () => {
    if (!playing && stepIdx >= lastStep) setStepIdx(0);
    setPlaying((p) => !p);
  };

  return (
    <div>
      <p className="mb-2 text-sm font-bold text-zinc-700">{scene.title}</p>
      <div
        className="relative mx-auto w-full max-w-sm overflow-hidden rounded-2xl bg-blue-700"
        style={{ aspectRatio: "2 / 3" }}
      >
        <div className="absolute inset-3 rounded-xl border-2 border-blue-300/50" />
        <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-300/50" />
        <div className="absolute left-3 right-3 top-1/2 border-t-2 border-blue-300/50" />
        <div className="absolute left-1/2 top-3 h-2 w-14 -translate-x-1/2 border-2 border-t-0 border-blue-300/50" />
        <div className="absolute bottom-3 left-1/2 h-2 w-14 -translate-x-1/2 border-2 border-b-0 border-blue-300/50" />

        <svg
          viewBox="0 0 100 150"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
        >
          <defs>
            <marker
              id="tactics-arrowhead"
              markerWidth="6"
              markerHeight="6"
              refX="4.5"
              refY="3"
              orient="auto"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill="#fde047" />
            </marker>
          </defs>
          {arrowStep.arrows.map((a, i) => {
            const from = arrowStep.positions[a.from];
            if (!from) return null;
            return (
              <line
                key={i}
                x1={from.x}
                y1={from.y * 1.5}
                x2={a.to.x}
                y2={a.to.y * 1.5}
                stroke="#fde047"
                strokeWidth="1"
                strokeDasharray="3 2"
                markerEnd="url(#tactics-arrowhead)"
              />
            );
          })}
        </svg>

        {scene.players.map((p) => {
          const pos = step.positions[p.id] ?? { x: 50, y: 50 };
          return (
            <div
              key={p.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 text-center transition-all duration-[900ms] ease-in-out"
              style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
            >
              <div
                className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-bold shadow ${TEAM_STYLE[p.team]}`}
              >
                {p.team}
              </div>
              <p className="mt-0.5 max-w-16 truncate rounded bg-blue-950/60 px-1 text-[10px] font-semibold text-white">
                {p.label}
              </p>
            </div>
          );
        })}

        {scene.hasBall && step.positions.ball && (
          <div
            className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow ring-1 ring-zinc-400 transition-all duration-[900ms] ease-in-out"
            style={{ left: `${step.positions.ball.x}%`, top: `${step.positions.ball.y}%` }}
          />
        )}
      </div>

      <p className="mt-2 min-h-8 text-center text-xs text-zinc-500">{step.note}</p>

      <div className="mt-2 flex items-center justify-center gap-3">
        <button
          onClick={() => {
            setPlaying(false);
            setStepIdx((i) => Math.max(0, i - 1));
          }}
          disabled={stepIdx === 0}
          className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 disabled:opacity-40"
        >
          ◀ 이전
        </button>
        <button
          onClick={togglePlay}
          className="rounded-full bg-blue-700 px-4 py-1.5 text-xs font-semibold text-white"
        >
          {playing ? "일시정지" : stepIdx >= lastStep ? "처음부터" : "재생"}
        </button>
        <button
          onClick={() => {
            setPlaying(false);
            setStepIdx((i) => Math.min(lastStep, i + 1));
          }}
          disabled={stepIdx === lastStep}
          className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600 disabled:opacity-40"
        >
          다음 ▶
        </button>
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {scene.steps.map((_, i) => (
          <button
            key={i}
            onClick={() => {
              setPlaying(false);
              setStepIdx(i);
            }}
            className={`h-1.5 w-1.5 rounded-full ${i === stepIdx ? "bg-blue-700" : "bg-zinc-300"}`}
            aria-label={`${i + 1}단계로 이동`}
          />
        ))}
      </div>
    </div>
  );
}

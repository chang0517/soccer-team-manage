"use client";

import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import TacticsBoard from "@/components/TacticsBoard";
import { useSession } from "@/components/useSession";
import {
  DEFAULT_ZONE,
  PITCH_ZONES,
  resolveZoneOrPos,
  separateOverlaps,
} from "@/lib/tacticsZones";
import type { TacticsArrowKind, TacticsScene } from "@/lib/types";

const JOB_ID_KEY = "tactics-job-id";

interface DraftPlayer {
  id: string;
  team: "A" | "B";
  label: string;
}

interface DraftArrow {
  from: string;
  toZone: string;
  kind: TacticsArrowKind;
}

interface DraftStep {
  note: string;
  positions: Record<string, string>; // id -> zone code
  arrows: DraftArrow[];
}

const ZONE_OPTIONS = Object.entries(PITCH_ZONES).map(([code, z]) => ({
  code,
  label: `${code} · ${z.label}`,
}));

function emptyStep(basedOn?: DraftStep): DraftStep {
  return {
    note: "",
    positions: basedOn ? { ...basedOn.positions } : {},
    arrows: [],
  };
}

export default function TacticsEditPage() {
  const { user, loading } = useSession();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [hasBall, setHasBall] = useState(true);
  const [players, setPlayers] = useState<DraftPlayer[]>([
    { id: "p1", team: "A", label: "선수 1" },
  ]);
  const [steps, setSteps] = useState<DraftStep[]>([
    { note: "시작 위치", positions: { p1: DEFAULT_ZONE, ball: DEFAULT_ZONE }, arrows: [] },
  ]);
  const [stepIdx, setStepIdx] = useState(0);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const step = steps[stepIdx];

  const setStep = (patch: Partial<DraftStep>) => {
    setSteps((prev) => prev.map((s, i) => (i === stepIdx ? { ...s, ...patch } : s)));
  };

  const addPlayer = () => {
    const id = `p${players.length + 1}`;
    setPlayers((prev) => [...prev, { id, team: "A", label: `선수 ${prev.length + 1}` }]);
    setSteps((prev) =>
      prev.map((s) => ({ ...s, positions: { ...s.positions, [id]: DEFAULT_ZONE } }))
    );
  };

  const removePlayer = (id: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
    setSteps((prev) =>
      prev.map((s) => {
        const positions = { ...s.positions };
        delete positions[id];
        return { ...s, positions, arrows: s.arrows.filter((a) => a.from !== id) };
      })
    );
  };

  const toggleHasBall = () => {
    const next = !hasBall;
    setHasBall(next);
    setSteps((prev) =>
      prev.map((s) => {
        if (next) return { ...s, positions: { ...s.positions, ball: DEFAULT_ZONE } };
        const positions = { ...s.positions };
        delete positions.ball;
        return { ...s, positions };
      })
    );
  };

  const addStep = () => {
    setSteps((prev) => [...prev, emptyStep(prev[stepIdx])]);
    setStepIdx(steps.length);
  };

  const removeStep = () => {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((_, i) => i !== stepIdx));
    setStepIdx((i) => Math.max(0, i - 1));
  };

  const addArrow = (from: string, toZone: string, kind: TacticsArrowKind) => {
    setStep({ arrows: [...step.arrows, { from, toZone, kind }] });
  };

  const removeArrow = (i: number) => {
    setStep({ arrows: step.arrows.filter((_, idx) => idx !== i) });
  };

  // 서버 저장 시 sanitizeScene이 기대하는 것과 같은 형태(구역 코드 그대로)
  // — 이 값을 그대로 /api/tactics/manual에 보낸다.
  const rawDraft = useMemo(
    () => ({
      title,
      players: players.map((p) => ({ id: p.id, team: p.team, label: p.label })),
      hasBall,
      steps: steps.map((s) => ({
        note: s.note,
        positions: s.positions,
        arrows: s.arrows.map((a) => ({ from: a.from, to: a.toZone, kind: a.kind })),
      })),
    }),
    [title, players, hasBall, steps]
  );

  // 저장 전에도 실제로 어떻게 보일지 바로 확인할 수 있도록, 서버와 같은
  // 구역→좌표 변환·겹침 방지 로직을 클라이언트에서 그대로 돌려 미리보기를 만든다.
  const previewScene: TacticsScene = useMemo(() => {
    const defaultPos = PITCH_ZONES[DEFAULT_ZONE];
    const knownIds = new Set(players.map((p) => p.id));
    if (hasBall) knownIds.add("ball");
    return {
      title: title.trim() || "전술 상황",
      players: players.map((p) => ({ id: p.id, team: p.team, label: p.label || "선수" })),
      hasBall,
      steps: steps.map((s, i) => {
        const positions: Record<string, { x: number; y: number }> = {};
        for (const id of knownIds) {
          positions[id] = resolveZoneOrPos(s.positions[id], defaultPos);
        }
        separateOverlaps(positions);
        return {
          note: s.note || `${i + 1}단계`,
          positions,
          arrows: s.arrows
            .filter((a) => knownIds.has(a.from))
            .map((a) => ({
              from: a.from,
              to: resolveZoneOrPos(a.toZone, defaultPos),
              kind: a.kind,
            })),
        };
      }),
    };
  }, [title, players, hasBall, steps]);

  const loadFromPaste = () => {
    setPasteError("");
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(pasteText);
    } catch {
      setPasteError("JSON 형식이 아니에요.");
      return;
    }
    const rawPlayers = Array.isArray(obj.players) ? obj.players : [];
    const nextPlayers: DraftPlayer[] = rawPlayers
      .filter((p: unknown): p is Record<string, unknown> => !!p && typeof p === "object")
      .map(
        (p: Record<string, unknown>): DraftPlayer => ({
          id: String(p.id ?? ""),
          team: p.team === "B" ? "B" : "A",
          label: typeof p.label === "string" ? p.label : "선수",
        })
      )
      .filter((p: DraftPlayer) => p.id);
    if (nextPlayers.length === 0) {
      setPasteError("players 배열을 찾지 못했어요.");
      return;
    }
    const nextHasBall = obj.hasBall === true;
    const rawSteps = Array.isArray(obj.steps) ? obj.steps : [];
    const nextSteps: DraftStep[] = rawSteps.map((s: unknown) => {
      const stepObj = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const rawPositions =
        stepObj.positions && typeof stepObj.positions === "object"
          ? (stepObj.positions as Record<string, unknown>)
          : {};
      const positions: Record<string, string> = {};
      for (const [k, v] of Object.entries(rawPositions)) {
        if (typeof v === "string") positions[k] = v.toUpperCase();
      }
      const rawArrows = Array.isArray(stepObj.arrows) ? stepObj.arrows : [];
      const arrows: DraftArrow[] = rawArrows
        .filter(
          (a: unknown): a is Record<string, unknown> =>
            !!a && typeof a === "object" && typeof (a as { from?: unknown }).from === "string"
        )
        .map((a: Record<string, unknown>) => ({
          from: String(a.from),
          toZone: typeof a.to === "string" ? a.to.toUpperCase() : DEFAULT_ZONE,
          kind: a.kind === "steal" ? "steal" : "pass",
        }));
      return {
        note: typeof stepObj.note === "string" ? stepObj.note : "",
        positions,
        arrows,
      };
    });
    setTitle(typeof obj.title === "string" ? obj.title : "");
    setPlayers(nextPlayers);
    setHasBall(nextHasBall);
    setSteps(nextSteps.length > 0 ? nextSteps : [emptyStep()]);
    setStepIdx(0);
    setPasteText("");
  };

  const save = async () => {
    setSaving(true);
    setSaveError("");
    const res = await fetch("/api/tactics/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rawDraft),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setSaveError(data.error ?? "저장에 실패했어요.");
      return;
    }
    localStorage.setItem(JOB_ID_KEY, String(data.jobId));
    router.push("/tactics");
  };

  if (loading) return null;
  if (!user || user.role !== "admin") {
    return (
      <div className="space-y-3 pt-10 text-center">
        <p className="text-sm text-zinc-500">운영진만 볼 수 있는 페이지예요.</p>
        <Link href="/" className="font-semibold text-blue-700">
          홈으로
        </Link>
      </div>
    );
  }

  const input = "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm";

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 md:pb-10">
      <Link href="/tactics" className="text-sm font-semibold text-blue-700">
        ← 전술 시뮬레이터
      </Link>
      <h1 className="mb-1 mt-1 text-lg font-bold">전술 직접 만들기</h1>
      <p className="mb-4 text-sm text-zinc-500">
        LLM 없이 구역·화살표를 직접 골라서 원하는 그대로 전술판을 만들어요. 아래에서
        바로 미리보기를 확인하면서 편집할 수 있어요.
      </p>

      <details className="mb-4 rounded-xl border border-zinc-200 bg-zinc-50 p-3 text-xs">
        <summary className="cursor-pointer font-semibold text-zinc-500">
          기존 결과의 원본 JSON 붙여넣어서 불러오기 (선택)
        </summary>
        <p className="mt-2 text-zinc-500">
          /tactics에서 생성한 결과의 &quot;모델 원본 응답&quot; 디버그 내용을 그대로
          붙여넣으면 여기서 이어서 수정할 수 있어요.
        </p>
        <textarea
          className={`${input} mt-2 resize-none`}
          rows={4}
          value={pasteText}
          onChange={(e) => setPasteText(e.target.value)}
          placeholder='{"title": "...", "players": [...], "steps": [...]}'
        />
        {pasteError && <p className="mt-1 text-red-500">{pasteError}</p>}
        <button
          onClick={loadFromPaste}
          disabled={!pasteText.trim()}
          className="mt-2 rounded-lg bg-zinc-200 px-3 py-1.5 font-semibold text-zinc-700 disabled:opacity-40"
        >
          불러오기
        </button>
      </details>

      <div className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <div>
          <label className="text-xs font-semibold text-zinc-500">제목</label>
          <input
            className={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 우측 윙백 오버래핑"
          />
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-600">
          <input
            type="checkbox"
            className="h-4 w-4 accent-blue-700"
            checked={hasBall}
            onChange={toggleHasBall}
          />
          공을 사용하는 상황이에요
        </label>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold">선수</p>
            <button
              onClick={addPlayer}
              className="rounded-lg bg-blue-700 px-3 py-1 text-xs font-semibold text-white"
            >
              + 선수 추가
            </button>
          </div>
          <div className="space-y-2">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-2">
                <select
                  className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  value={p.team}
                  onChange={(e) =>
                    setPlayers((prev) =>
                      prev.map((pl) =>
                        pl.id === p.id ? { ...pl, team: e.target.value as "A" | "B" } : pl
                      )
                    )
                  }
                >
                  <option value="A">A(우리)</option>
                  <option value="B">B(상대)</option>
                </select>
                <input
                  className="flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                  value={p.label}
                  onChange={(e) =>
                    setPlayers((prev) =>
                      prev.map((pl) => (pl.id === p.id ? { ...pl, label: e.target.value } : pl))
                    )
                  }
                />
                <button
                  onClick={() => removePlayer(p.id)}
                  disabled={players.length <= 1}
                  className="shrink-0 text-xs text-red-500 underline disabled:opacity-30"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-bold">스텝</p>
            <div className="flex gap-2">
              <button
                onClick={addStep}
                className="rounded-lg bg-blue-700 px-3 py-1 text-xs font-semibold text-white"
              >
                + 스텝 추가
              </button>
              <button
                onClick={removeStep}
                disabled={steps.length <= 1}
                className="rounded-lg bg-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-600 disabled:opacity-40"
              >
                현재 스텝 삭제
              </button>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {steps.map((_, i) => (
              <button
                key={i}
                onClick={() => setStepIdx(i)}
                className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                  i === stepIdx ? "bg-blue-900 text-white" : "bg-zinc-100 text-zinc-600"
                }`}
              >
                {i + 1}단계
              </button>
            ))}
          </div>

          <input
            className={`${input} mb-3`}
            placeholder="이 단계 설명"
            value={step.note}
            onChange={(e) => setStep({ note: e.target.value })}
          />

          <p className="mb-1.5 text-xs font-bold text-zinc-400">
            위치 — 선수나 공을 드래그해서 옮기세요
          </p>
          <div className="mb-3">
            <PositionPitch
              players={players}
              hasBall={hasBall}
              positions={step.positions}
              onMove={(id, zone) =>
                setStep({ positions: { ...step.positions, [id]: zone } })
              }
            />
          </div>

          <p className="mb-1.5 text-xs font-bold text-zinc-400">화살표</p>
          <div className="mb-2 space-y-1.5">
            {step.arrows.map((a, i) => {
              const fromLabel = players.find((p) => p.id === a.from)?.label ?? a.from;
              return (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-zinc-50 px-2 py-1.5 text-xs"
                >
                  <span>
                    {a.kind === "steal" ? "⚡ " : "➜ "}
                    {fromLabel} → {a.toZone}
                  </span>
                  <button onClick={() => removeArrow(i)} className="text-red-500 underline">
                    삭제
                  </button>
                </div>
              );
            })}
          </div>
          <ArrowBuilder players={players} onAdd={addArrow} />
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
        <p className="mb-2 text-sm font-bold text-zinc-500">미리보기</p>
        <TacticsBoard scene={previewScene} />
      </div>

      {saveError && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-600">{saveError}</p>
      )}
      <button
        onClick={save}
        disabled={saving || !title.trim()}
        className="mt-4 w-full rounded-xl bg-blue-700 py-2.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {saving ? "저장 중…" : "저장하고 전술 시뮬레이터에서 보기"}
      </button>
    </main>
  );
}

const TEAM_STYLE: Record<"A" | "B", string> = {
  A: "bg-blue-600 text-white",
  B: "bg-rose-500 text-white",
};

/** 드래그를 놓은 좌표(%)에서 가장 가까운 구역 코드를 찾는다 — 자유 좌표가
 * 아니라 항상 18개 구역(15개 필드 + 골대 안 3개) 중 하나로 스냅시켜서,
 * LLM 경로와 마찬가지로 데이터가 항상 구역 코드 기반으로 깔끔하게 유지된다. */
function pointToPercent(rect: DOMRect, clientX: number, clientY: number) {
  const x = ((clientX - rect.left) / rect.width) * 100;
  const y = ((clientY - rect.top) / rect.height) * 100;
  return { x: Math.min(100, Math.max(0, x)), y: Math.min(100, Math.max(0, y)) };
}

function nearestZone(x: number, y: number): string {
  let best = DEFAULT_ZONE;
  let bestDist = Infinity;
  for (const [code, z] of Object.entries(PITCH_ZONES)) {
    const d = (z.x - x) ** 2 + (z.y - y) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = code;
    }
  }
  return best;
}

/** 선수/공 토큰을 손가락(또는 마우스)으로 직접 끌어서 옮기는 미니 전술판.
 * 드래그 중에는 포인터를 그대로 따라가다가, 손을 떼는 순간 가장 가까운
 * 구역으로 스냅한다. Pointer Events를 쓰는 이유는 마우스·터치·펜을 같은
 * 코드로 다 처리해서 모바일에서도 그대로 동작하기 때문이다(이 앱의 기존
 * 스쿼드 드래그는 HTML5 네이티브 DnD라 터치에서는 잘 안 먹는다). */
function PositionPitch({
  players,
  hasBall,
  positions,
  onMove,
}: {
  players: DraftPlayer[];
  hasBall: boolean;
  positions: Record<string, string>;
  onMove: (id: string, zone: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);

  // JSX에서 onPointerDown={startDrag(id)}처럼 렌더 중에 함수를 즉시 호출해서
  // 핸들러를 만드는 방식은 리액트 컴파일러 lint가 "렌더 중 ref 접근"으로
  // 오탐하므로, id를 data 속성으로 읽는 단일 안정 핸들러를 쓴다.
  const handlePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const id = e.currentTarget.dataset.dragId;
    if (!id) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragId(id);
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setDragPos(pointToPercent(rect, e.clientX, e.clientY));
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragId) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) setDragPos(pointToPercent(rect, e.clientX, e.clientY));
  };

  const endDrag = () => {
    if (dragId && dragPos) onMove(dragId, nearestZone(dragPos.x, dragPos.y));
    setDragId(null);
    setDragPos(null);
  };

  const entityPos = (id: string) => {
    if (dragId === id && dragPos) return dragPos;
    return PITCH_ZONES[positions[id]] ?? PITCH_ZONES[DEFAULT_ZONE];
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className="relative mx-auto w-full max-w-xs overflow-hidden rounded-2xl bg-blue-700"
      style={{ aspectRatio: "2 / 3" }}
    >
      <div className="absolute inset-3 rounded-xl border-2 border-blue-300/50" />
      <div className="absolute left-1/2 top-1/2 h-16 w-16 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-300/50" />
      <div className="absolute left-3 right-3 top-1/2 border-t-2 border-blue-300/50" />
      <div className="absolute left-1/2 top-3 h-2 w-14 -translate-x-1/2 border-2 border-t-0 border-blue-300/50" />
      <div className="absolute bottom-3 left-1/2 h-2 w-14 -translate-x-1/2 border-2 border-b-0 border-blue-300/50" />

      {Object.values(PITCH_ZONES).map((z, i) => (
        <div
          key={i}
          className="pointer-events-none absolute h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/30"
          style={{ left: `${z.x}%`, top: `${z.y}%` }}
        />
      ))}

      {players.map((p) => {
        const pos = entityPos(p.id);
        return (
          <div
            key={p.id}
            className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          >
            <div
              data-drag-id={p.id}
              onPointerDown={handlePointerDown}
              style={{ touchAction: "none" }}
              className={`mx-auto flex h-8 w-8 cursor-grab items-center justify-center rounded-full text-[10px] font-bold shadow active:cursor-grabbing ${TEAM_STYLE[p.team]} ${dragId === p.id ? "z-10 scale-110 ring-2 ring-white" : ""}`}
            >
              {p.label.slice(0, 2)}
            </div>
            <p className="mt-0.5 max-w-14 truncate rounded bg-blue-950/60 px-1 text-[9px] font-semibold text-white">
              {p.label}
            </p>
          </div>
        );
      })}

      {hasBall && (
        <div
          data-drag-id="ball"
          onPointerDown={handlePointerDown}
          style={{
            // 공이 선수와 같은 구역(선수가 공을 갖고 있는 상태)이면 두 토큰이
            // 정확히 겹쳐서 공이 항상 위에서 선수 토큰의 드래그를 가로채
            // 버린다 — 편집 화면에서만 살짝 오프셋을 줘서 둘 다 따로 잡을
            // 수 있게 한다(저장되는 실제 위치·최종 미리보기는 그대로 정확한
            // 좌표를 쓴다).
            left: `calc(${entityPos("ball").x}% + 8px)`,
            top: `calc(${entityPos("ball").y}% - 8px)`,
            touchAction: "none",
          }}
          className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full bg-white shadow ring-1 ring-zinc-400 active:cursor-grabbing ${dragId === "ball" ? "z-10 scale-150" : ""}`}
        />
      )}
    </div>
  );
}

function ArrowBuilder({
  players,
  onAdd,
}: {
  players: DraftPlayer[];
  onAdd: (from: string, toZone: string, kind: TacticsArrowKind) => void;
}) {
  const [from, setFrom] = useState(players[0]?.id ?? "");
  const [toZone, setToZone] = useState(DEFAULT_ZONE);
  const [kind, setKind] = useState<TacticsArrowKind>("pass");

  const fromId = players.some((p) => p.id === from) ? from : players[0]?.id ?? "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        value={fromId}
        onChange={(e) => setFrom(e.target.value)}
      >
        {players.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <span className="text-xs text-zinc-400">→</span>
      <select
        className="rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
        value={toZone}
        onChange={(e) => setToZone(e.target.value)}
      >
        {ZONE_OPTIONS.map((z) => (
          <option key={z.code} value={z.code}>
            {z.label}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        <button
          onClick={() => setKind("pass")}
          className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${
            kind === "pass" ? "bg-blue-700 text-white" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          패스
        </button>
        <button
          onClick={() => setKind("steal")}
          className={`rounded-lg px-2 py-1.5 text-xs font-semibold ${
            kind === "steal" ? "bg-red-500 text-white" : "bg-zinc-100 text-zinc-600"
          }`}
        >
          스틸
        </button>
      </div>
      <button
        onClick={() => fromId && onAdd(fromId, toZone, kind)}
        disabled={!fromId}
        className="rounded-lg bg-zinc-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
      >
        + 화살표 추가
      </button>
    </div>
  );
}

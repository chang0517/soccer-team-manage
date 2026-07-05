"use client";

import { useState } from "react";
import type { Member } from "@/lib/types";

interface PreviewItem {
  token: string;
  candidates: Member[];
  selectedId: number | null;
  goals: number;
  assists: number;
}

interface ScoreGuess {
  scored: number | null;
  conceded: number | null;
}

function matchMembers(token: string, members: Member[]): Member[] {
  const exact = members.filter((m) => m.name === token);
  if (exact.length > 0) return exact;
  return members.filter((m) => m.name.includes(token) || token.includes(m.name));
}

export default function AiRecordImport({
  members,
  onApply,
}: {
  members: Member[];
  onApply: (
    results: { memberId: number; goals: number; assists: number }[],
    score: ScoreGuess | null
  ) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [scoreGuess, setScoreGuess] = useState<ScoreGuess | null>(null);
  const [appliedMsg, setAppliedMsg] = useState("");

  const analyze = async () => {
    if (!notes.trim()) return;
    setLoading(true);
    setError("");
    setPreview([]);
    setScoreGuess(null);
    try {
      const res = await fetch("/api/ai/parse-notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "분석에 실패했어요.");
      setPreview(
        result.players.map((it: { name: string; goals: number; assists: number }) => {
          const candidates = matchMembers(it.name, members);
          return {
            token: it.name,
            candidates,
            selectedId: candidates.length === 1 ? candidates[0].id : null,
            goals: it.goals,
            assists: it.assists,
          };
        })
      );
      if (result.scored != null || result.conceded != null) {
        setScoreGuess({ scored: result.scored, conceded: result.conceded });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석에 실패했어요.");
    } finally {
      setLoading(false);
    }
  };

  const apply = () => {
    const results = preview
      .filter((p) => p.selectedId != null)
      .map((p) => ({
        memberId: p.selectedId as number,
        goals: p.goals,
        assists: p.assists,
      }));
    if (results.length === 0 && !scoreGuess) return;
    onApply(results, scoreGuess);
    const scoreNote =
      scoreGuess && (scoreGuess.scored != null || scoreGuess.conceded != null)
        ? ` · 스코어 ${scoreGuess.scored ?? "?"}:${scoreGuess.conceded ?? "?"}`
        : "";
    setAppliedMsg(
      `${results.length}명 반영했어요${scoreNote}. 아래에서 확인 후 저장하세요.`
    );
    setPreview([]);
    setScoreGuess(null);
    setNotes("");
    setTimeout(() => setAppliedMsg(""), 4500);
  };

  const input =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm resize-none";
  const scoreInput =
    "w-16 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-center text-sm";

  return (
    <div className="mt-4 border-t border-zinc-100 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="text-sm font-semibold text-emerald-700"
      >
        {open ? "AI로 기록 입력 닫기" : "+ AI로 기록 입력"}
      </button>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl bg-zinc-50 p-3">
          <p className="text-xs text-zinc-500">
            메모를 붙여넣으면 우리 팀 서버가 맥미니의 Ollama로 분석해요. 폰이든
            어디서든 이 사이트에 접속만 하면 똑같이 동작해요.
          </p>
          <textarea
            className={input}
            rows={5}
            placeholder={
              "경기 기록 메모를 붙여넣으세요. 예)\n1Q: 동한 골 / 현민 어시\n종료 3:0 승 (무실점)"
            }
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            onClick={analyze}
            disabled={loading || !notes.trim()}
            className="w-full rounded-xl bg-emerald-700 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {loading ? "분석 중…" : "분석하기"}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}

          {(preview.length > 0 || scoreGuess) && (
            <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-3">
              {scoreGuess && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-100 pb-3">
                  <span className="text-xs font-semibold text-zinc-500">
                    인식된 스코어
                  </span>
                  <label className="flex items-center gap-1 text-xs text-zinc-500">
                    득점
                    <input
                      type="number"
                      min={0}
                      className={scoreInput}
                      value={scoreGuess.scored ?? ""}
                      onChange={(e) =>
                        setScoreGuess((s) => ({
                          scored: e.target.value === "" ? null : Number(e.target.value),
                          conceded: s?.conceded ?? null,
                        }))
                      }
                    />
                  </label>
                  <label className="flex items-center gap-1 text-xs text-zinc-500">
                    실점
                    <input
                      type="number"
                      min={0}
                      className={scoreInput}
                      value={scoreGuess.conceded ?? ""}
                      onChange={(e) =>
                        setScoreGuess((s) => ({
                          scored: s?.scored ?? null,
                          conceded:
                            e.target.value === "" ? null : Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                  {scoreGuess.conceded === 0 && (
                    <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-bold text-sky-700">
                      클린시트
                    </span>
                  )}
                </div>
              )}

              {preview.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-zinc-500">
                    골·어시 확인 — 선수가 잘못 매칭됐으면 직접 선택하세요.
                  </p>
                  {preview.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                      <span className="w-16 shrink-0 truncate text-zinc-500">
                        &ldquo;{p.token}&rdquo;
                      </span>
                      <select
                        className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-2 py-1.5 text-sm"
                        value={p.selectedId ?? ""}
                        onChange={(e) =>
                          setPreview((ps) =>
                            ps.map((x, xi) =>
                              xi === i
                                ? {
                                    ...x,
                                    selectedId: e.target.value
                                      ? Number(e.target.value)
                                      : null,
                                  }
                                : x
                            )
                          )
                        }
                      >
                        <option value="">선수 선택 안 함</option>
                        {members.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                            {m.isGuest ? " · 용병" : ""}
                          </option>
                        ))}
                      </select>
                      <span className="w-14 shrink-0 text-center text-xs text-zinc-500">
                        ⚽{p.goals} 🎯{p.assists}
                      </span>
                    </div>
                  ))}
                </>
              )}

              <button
                onClick={apply}
                className="w-full rounded-xl bg-emerald-700 py-2 text-sm font-semibold text-white"
              >
                아래 기록 초안에 반영
              </button>
            </div>
          )}
          {appliedMsg && (
            <p className="text-xs font-semibold text-emerald-700">{appliedMsg}</p>
          )}
        </div>
      )}
    </div>
  );
}

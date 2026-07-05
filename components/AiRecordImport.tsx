"use client";

import { useEffect, useState } from "react";
import { parseMatchNotesWithLocalLlm } from "@/lib/llm";
import type { Member } from "@/lib/types";

interface PreviewItem {
  token: string;
  candidates: Member[];
  selectedId: number | null;
  goals: number;
  assists: number;
}

const DEFAULT_ENDPOINT = "http://localhost:11434/v1/chat/completions";

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
  onApply: (results: { memberId: number; goals: number; assists: number }[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [endpoint, setEndpoint] = useState(DEFAULT_ENDPOINT);
  const [model, setModel] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<PreviewItem[]>([]);
  const [appliedMsg, setAppliedMsg] = useState("");

  useEffect(() => {
    setEndpoint(localStorage.getItem("ravenLlmEndpoint") || DEFAULT_ENDPOINT);
    setModel(localStorage.getItem("ravenLlmModel") || "");
  }, []);

  const saveSettings = (e: string, m: string) => {
    setEndpoint(e);
    setModel(m);
    localStorage.setItem("ravenLlmEndpoint", e);
    localStorage.setItem("ravenLlmModel", m);
  };

  const analyze = async () => {
    if (!notes.trim() || !model.trim()) return;
    setLoading(true);
    setError("");
    setPreview([]);
    try {
      const items = await parseMatchNotesWithLocalLlm(endpoint, model, notes);
      setPreview(
        items.map((it) => {
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
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "분석에 실패했어요. 로컬 LLM이 켜져 있는지, 이 브라우저가 그 컴퓨터에서 열려있는지 확인해 주세요."
      );
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
    if (results.length === 0) return;
    onApply(results);
    setAppliedMsg(`${results.length}명 반영했어요. 아래 표에서 확인 후 저장하세요.`);
    setPreview([]);
    setNotes("");
    setTimeout(() => setAppliedMsg(""), 4000);
  };

  const input =
    "w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm";

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
            이 기능은 이 브라우저를 열고 있는 컴퓨터에서 직접 로컬 LLM(예:
            Ollama)을 호출해요. 서버가 아니라 브라우저에서 나가는 요청이라,
            로컬 LLM이 실행 중인 바로 그 컴퓨터에서만 동작해요.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="text-xs font-semibold text-zinc-500">
                엔드포인트
              </label>
              <input
                className={input}
                value={endpoint}
                onChange={(e) => saveSettings(e.target.value, model)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500">
                모델명
              </label>
              <input
                className={input}
                placeholder="예: llama3.1"
                value={model}
                onChange={(e) => saveSettings(endpoint, e.target.value)}
              />
            </div>
          </div>
          <textarea
            className={`${input} resize-none`}
            rows={5}
            placeholder={"경기 기록 메모를 붙여넣으세요. 예)\n1Q: 동한 골 / 현민 어시"}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <button
            onClick={analyze}
            disabled={loading || !notes.trim() || !model.trim()}
            className="w-full rounded-xl bg-emerald-700 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {loading ? "분석 중…" : "분석하기"}
          </button>
          {error && <p className="text-xs text-red-500">{error}</p>}

          {preview.length > 0 && (
            <div className="space-y-2 rounded-xl border border-zinc-200 bg-white p-3">
              <p className="text-xs font-semibold text-zinc-500">
                결과 확인 — 선수가 잘못 매칭됐으면 직접 선택하세요.
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

"use client";

import { useState } from "react";
import TacticsBoard from "@/components/TacticsBoard";
import { useSession } from "@/components/useSession";
import type { TacticsScene } from "@/lib/tactics";

const PLACEHOLDER =
  "예: 오른쪽 풀백이 오버래핑하면서 크로스를 올리고, 스트라이커가 니어포스트로 침투해서 헤더로 마무리";

export default function TacticsPage() {
  const { user } = useSession();
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scene, setScene] = useState<TacticsScene | null>(null);

  const generate = async () => {
    if (!description.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/tactics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "생성에 실패했어요.");
      setScene(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성에 실패했어요.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 md:pb-10">
      <h1 className="mb-1 text-lg font-bold">전술 시뮬레이터</h1>
      <p className="mb-4 text-sm text-zinc-500">
        상황을 글로 설명하면 핵심 인물 몇 명과 움직임 화살표로 전술판 애니메이션을 만들어줘요.
        팀 맥미니에서 도는 로컬 AI가 만드는 거라 결과가 완벽하지 않을 수 있어요.
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
        className="w-full rounded-xl border border-zinc-200 p-3 text-sm"
      />
      <button
        onClick={generate}
        disabled={!user || loading || !description.trim()}
        className="mt-2 w-full rounded-xl bg-blue-700 py-2.5 text-sm font-bold text-white disabled:opacity-40"
      >
        {loading ? "만드는 중… (최대 1분 걸릴 수 있어요)" : "전술 만들기"}
      </button>

      {error && (
        <p className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-600">{error}</p>
      )}

      {scene && (
        <div className="mt-6 rounded-2xl border border-zinc-200 bg-white p-4">
          <TacticsBoard scene={scene} />
        </div>
      )}
    </main>
  );
}

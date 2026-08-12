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
    // 최대 1분 가까이 걸릴 수 있는데, 그 사이 화면이 꺼지거나 백그라운드로
    // 넘어가면 iOS Safari가 요청을 끊어버려 "Load failed"로 실패한다.
    // 화면 잠금만이라도 막아보려는 최선 노력(지원 안 하면 조용히 무시).
    let wakeLock: { release: () => Promise<void> } | null = null;
    try {
      wakeLock = await (
        navigator as { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } }
      ).wakeLock?.request("screen") ?? null;
    } catch {
      // 지원 안 하거나 거부돼도 생성 자체는 계속 진행한다.
    }
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
      const isNetworkError = e instanceof TypeError;
      setError(
        isNetworkError
          ? "연결이 끊겼어요. 화면이 꺼지거나 다른 앱으로 전환하면 요청이 끊길 수 있어요 — 화면을 켜둔 채로 다시 시도해 주세요."
          : e instanceof Error
            ? e.message
            : "생성에 실패했어요."
      );
    } finally {
      setLoading(false);
      wakeLock?.release().catch(() => {});
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-6 md:pb-10">
      <h1 className="mb-1 text-lg font-bold">전술 시뮬레이터</h1>
      <p className="mb-4 text-sm text-zinc-500">
        상황을 글로 설명하면 핵심 인물 몇 명과 움직임 화살표로 전술판 애니메이션을 만들어줘요.
        팀 맥미니에서 도는 로컬 AI가 만드는 거라 결과가 완벽하지 않을 수 있고, 최대
        1분 가까이 걸릴 수 있어요. 만드는 동안 화면이 꺼지거나 다른 앱으로 넘어가면
        요청이 끊길 수 있으니 화면을 켜둔 채 기다려 주세요.
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

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/useSession";
import type { GpsPitch, GpsSession } from "@/lib/types";

const input = "w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm";
const CORNER_HINTS = [
  "1번 (원점, 한쪽 골라인의 모서리)",
  "2번 (같은 터치라인을 따라 반대쪽 골라인 모서리, 길이 방향)",
  "3번 (2번의 맞은편 모서리)",
  "4번 (1번과 같은 골라인의 반대쪽 모서리, 폭 방향)",
];

export default function GpsPage() {
  const { user, loading } = useSession();
  const isAdmin = user?.role === "admin";
  const [sessions, setSessions] = useState<GpsSession[]>([]);
  const [pitches, setPitches] = useState<GpsPitch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [title, setTitle] = useState("");
  const [playedOn, setPlayedOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [pitchId, setPitchId] = useState("");
  const [busy, setBusy] = useState(false);
  const [pitchName, setPitchName] = useState("");
  const [corners, setCorners] = useState<string[]>(["", "", "", ""]);

  // 변경 후 목록을 다시 불러오려고 숫자를 올린다(이펙트가 이 값에 반응).
  const [version, setVersion] = useState(0);
  const load = () => setVersion((v) => v + 1);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    Promise.all([
      fetch("/api/gps/sessions").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/gps/pitches").then((r) => (r.ok ? r.json() : [])),
    ]).then(([s, p]) => {
      if (!alive) return;
      setSessions(s);
      setPitches(p);
      setLoaded(true);
    });
    return () => {
      alive = false;
    };
  }, [user, version]);

  if (loading) return null;
  if (!user) {
    return (
      <div className="space-y-3 pt-10 text-center">
        <p className="text-sm text-zinc-500">로그인이 필요해요.</p>
        <Link href="/login" className="font-semibold text-blue-700">
          로그인하러 가기
        </Link>
      </div>
    );
  }

  const post = async (url: string, body?: unknown) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error ?? "실패했어요.");
        return null;
      }
      return data;
    } finally {
      setBusy(false);
    }
  };

  const createSession = async () => {
    if (!title.trim()) return;
    const data = await post("/api/gps/sessions", { title, playedOn, pitchId: pitchId || null });
    if (data) {
      setTitle("");
      load();
    }
  };

  const createSample = async () => {
    const data = await post("/api/gps/sample");
    if (data) {
      load();
    }
  };

  const savePitch = async () => {
    // "위도, 경도" 한 줄씩 붙여 넣을 수 있게 쉼표·공백으로 나눈다.
    const parsed = corners.map((c) => {
      const [lat, lon] = c.split(/[,\s]+/).filter(Boolean).map(Number);
      return { lat, lon };
    });
    const data = await post("/api/gps/pitches", { name: pitchName, corners: parsed });
    if (data) {
      setPitchName("");
      setCorners(["", "", "", ""]);
      load();
    }
  };

  const removePitch = async (p: GpsPitch) => {
    if (!confirm(`'${p.name}' 구장을 지울까요?`)) return;
    const res = await fetch(`/api/gps/pitches?id=${p.id}`, { method: "DELETE" });
    if (res.ok) load();
    else alert("지우지 못했어요.");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">GPS 경기 분석</h1>
        <p className="mt-1 text-sm text-zinc-500">
          조끼 포드나 스마트폰·시계 GPS 기록을 올리면 이동거리, 스프린트, 히트맵을 분석해요.
        </p>
      </div>

      {isAdmin && (
        <div className="rounded-2xl border border-zinc-200 bg-white space-y-3 p-4">
          <p className="text-sm font-bold">새 경기 세션</p>
          <input className={input} placeholder="제목 (예: 10/25 연습경기)" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className={input} type="date" value={playedOn} onChange={(e) => setPlayedOn(e.target.value)} />
            <select className={input} value={pitchId} onChange={(e) => setPitchId(e.target.value)}>
              <option value="">구장 미지정</option>
              {pitches.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={createSession}
              disabled={busy || !title.trim()}
              className="flex-1 rounded-2xl bg-blue-900 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              세션 만들기
            </button>
            <button
              type="button"
              onClick={createSample}
              disabled={busy}
              className="rounded-2xl bg-zinc-100 px-4 py-2.5 text-sm font-semibold text-zinc-700 disabled:opacity-40"
            >
              예시 경기 만들기
            </button>
          </div>
          <p className="text-xs text-zinc-400">
            예시 경기는 시뮬레이션으로 만든 가짜 데이터예요. 화면 확인용이고 실제 선수 기록이 아니에요.
          </p>
        </div>
      )}

      <section className="space-y-2.5">
        <p className="text-sm font-bold text-zinc-700">경기 세션</p>
        {!loaded ? (
          <p className="py-6 text-center text-sm text-zinc-400">불러오는 중…</p>
        ) : sessions.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">
            아직 세션이 없어요.{isAdmin ? " 위에서 만들거나 예시 경기로 먼저 둘러보세요." : ""}
          </div>
        ) : (
          sessions.map((s) => (
            <Link key={s.id} href={`/gps/${s.id}`} className="rounded-2xl border border-zinc-200 bg-white block p-4">
              <p className="font-bold">
                {s.title}
                {s.isSample && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">예시</span>
                )}
              </p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {s.playedOn} · 분석된 선수 {s.trackCount}명
              </p>
            </Link>
          ))
        )}
      </section>

      {isAdmin && (
        <details className="rounded-2xl border border-zinc-200 bg-white p-4">
          <summary className="cursor-pointer text-sm font-bold">구장 등록 ({pitches.length})</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs text-zinc-500">
              구장 네 모서리에 포드를 1분쯤 가만히 두거나 폰 지도 앱에서 좌표를 읽어 &quot;위도, 경도&quot; 형식으로
              입력해요. 한 번 등록하면 모든 경기에서 같은 틀로 분석돼요.
            </p>
            <input className={input} placeholder="구장 이름" value={pitchName} onChange={(e) => setPitchName(e.target.value)} />
            {CORNER_HINTS.map((hint, i) => (
              <input
                key={i}
                className={input}
                placeholder={`${hint} — 예: 37.123456, 127.123456`}
                value={corners[i]}
                onChange={(e) => setCorners((cs) => cs.map((c, j) => (j === i ? e.target.value : c)))}
              />
            ))}
            <button
              type="button"
              onClick={savePitch}
              disabled={busy || !pitchName.trim() || corners.some((c) => !c.trim())}
              className="w-full rounded-2xl bg-blue-900 py-2.5 text-sm font-bold text-white disabled:opacity-40"
            >
              구장 저장
            </button>
            {pitches.length > 0 && (
              <ul className="space-y-1.5 pt-1">
                {pitches.map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span>{p.name}</span>
                    <button type="button" onClick={() => removePitch(p)} className="text-xs font-semibold text-red-600">
                      삭제
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

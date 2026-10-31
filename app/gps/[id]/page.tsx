"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import GpsHeatmap from "@/components/GpsHeatmap";
import GpsTeamMap from "@/components/GpsTeamMap";
import GpsTeamPanel from "@/components/GpsTeamPanel";
import GpsUpload from "@/components/GpsUpload";
import { useSession } from "@/components/useSession";
import { areaSummary, zoneBreakdown } from "@/lib/gps/zones";
import type { GpsPitch, GpsSession, GpsTrackDetail, GpsTrackSummary, Member } from "@/lib/types";

type TrackRow = GpsTrackSummary & { memberName: string | null };
type Detail = { session: GpsSession; pitch: GpsPitch | null; tracks: TrackRow[] };

const kmh = (ms: number) => (ms * 3.6).toFixed(1);
const km = (m: number) => (m / 1000).toFixed(2);

function trackLabel(t: TrackRow) {
  return t.memberName ?? (t.deviceId ? `기기 ${t.deviceId}` : `기록 #${t.id}`);
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl bg-zinc-50 p-3">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-xs font-semibold text-zinc-400">{unit}</span>}
      </p>
    </div>
  );
}

export default function GpsSessionPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, loading } = useSession();
  const isAdmin = user?.role === "admin";
  const [detail, setDetail] = useState<Detail | null>(null);
  const [missing, setMissing] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [pitches, setPitches] = useState<GpsPitch[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [track, setTrack] = useState<GpsTrackDetail | null>(null);
  const [showPath, setShowPath] = useState(false);
  const [view, setView] = useState<"player" | "team">("player");

  // 변경 후 다시 불러오려고 숫자를 올린다(이펙트가 이 값에 반응).
  const [version, setVersion] = useState(0);
  const load = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetch(`/api/gps/sessions/${id}`).then(async (res) => {
      if (!alive) return;
      if (!res.ok) {
        setMissing(true);
        return;
      }
      const d: Detail = await res.json();
      if (!alive) return;
      setDetail(d);
      setSelected((cur) => (cur !== null && d.tracks.some((t) => t.id === cur) ? cur : (d.tracks[0]?.id ?? null)));
    });
    return () => {
      alive = false;
    };
  }, [user, id, version]);

  useEffect(() => {
    if (!user) return;
    fetch("/api/members").then((r) => (r.ok ? r.json() : [])).then(setMembers);
    fetch("/api/gps/pitches").then((r) => (r.ok ? r.json() : [])).then(setPitches);
  }, [user]);

  useEffect(() => {
    if (selected === null) return;
    let alive = true;
    fetch(`/api/gps/sessions/${id}/tracks/${selected}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((t) => alive && setTrack(t));
    return () => {
      alive = false;
    };
  }, [id, selected, detail]);

  const dots = useMemo(() => {
    if (!detail) return [];
    return detail.tracks
      .filter((t) => t.metrics.avgPos && t.frame.source === "pitch")
      .map((t) => ({ id: t.id, label: trackLabel(t), x: t.metrics.avgPos!.x, y: t.metrics.avgPos!.y }));
  }, [detail]);

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
  if (missing) {
    return (
      <div className="space-y-3 pt-10 text-center">
        <p className="text-sm text-zinc-500">세션을 찾을 수 없어요.</p>
        <Link href="/gps" className="font-semibold text-blue-700">
          목록으로
        </Link>
      </div>
    );
  }
  if (!detail) return <p className="py-10 text-center text-sm text-zinc-400">불러오는 중…</p>;

  const { session, pitch, tracks } = detail;
  const current = tracks.find((t) => t.id === selected) ?? null;

  const changePitch = async (value: string) => {
    const res = await fetch(`/api/gps/sessions/${session.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pitchId: value || null }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data.error ?? "구장을 바꾸지 못했어요.");
      return;
    }
    load();
  };

  const removeTrack = async (t: TrackRow) => {
    if (!confirm(`${trackLabel(t)}의 기록을 지울까요?`)) return;
    const res = await fetch(`/api/gps/sessions/${session.id}/tracks/${t.id}`, { method: "DELETE" });
    if (res.ok) {
      setTrack(null);
      load();
    } else alert("지우지 못했어요.");
  };

  const removeSession = async () => {
    if (!confirm("이 세션과 모든 선수 기록을 지울까요?")) return;
    const res = await fetch(`/api/gps/sessions/${session.id}`, { method: "DELETE" });
    if (res.ok) router.push("/gps");
    else alert("지우지 못했어요.");
  };

  const m = current?.metrics;
  const zoneTotal = m ? Object.values(m.zones).reduce((a, b) => a + b, 0) || 1 : 1;
  const maxMinute = m ? Math.max(1, ...m.perMinuteM) : 1;

  return (
    <div className="space-y-5">
      <div>
        <Link href="/gps" className="text-sm font-semibold text-blue-700">
          ← 목록
        </Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
          {session.title}
          {session.isSample && (
            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-xs font-bold text-amber-800">예시</span>
          )}
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          {session.playedOn} · 구장: {pitch?.name ?? "미지정(궤적에서 자동 추정)"}
        </p>
      </div>

      {tracks.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-500">아직 올라온 로그가 없어요.</div>
      ) : (
        <>
          <div className="flex gap-1 rounded-2xl bg-zinc-200/60 p-1">
            {(
              [
                ["player", "선수별"],
                ["team", "팀 비교"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                className={`flex-1 rounded-xl py-2 text-sm font-bold ${view === key ? "bg-white text-blue-900 shadow-sm" : "text-zinc-500"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {view === "team" && (
            <>
              <GpsTeamPanel sessionId={session.id} refreshKey={version} />
              {dots.length >= 2 && pitch && (
                <div className="rounded-2xl border border-zinc-200 bg-white space-y-2 p-4">
                  <p className="text-sm font-bold">팀 평균 위치</p>
                  <GpsTeamMap dots={dots} lengthM={tracks[0].frame.lengthM} widthM={tracks[0].frame.widthM} />
                </div>
              )}
            </>
          )}

          {view === "player" && (
          <>
          <div className="flex flex-wrap gap-1.5">
            {tracks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelected(t.id)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                  t.id === selected ? "bg-blue-900 text-white" : "bg-zinc-100 text-zinc-700"
                }`}
              >
                {trackLabel(t)}
              </button>
            ))}
          </div>

          {current && m && (
            <div className="rounded-2xl border border-zinc-200 bg-white space-y-4 p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <Stat label="이동거리" value={km(m.distanceM)} unit="km" />
                <Stat label="최고속도" value={kmh(m.maxSpeedMs)} unit="km/h" />
                <Stat label="스프린트" value={String(m.sprintCount)} unit="회" />
                <Stat label="스프린트 거리" value={Math.round(m.sprintDistanceM).toString()} unit="m" />
                <Stat label="가속 / 감속" value={`${m.accelCount} / ${m.decelCount}`} unit="회" />
                <Stat label="기록 시간" value={Math.round(m.durationS / 60).toString()} unit="분" />
              </div>

              {track && track.id === current.id && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold">히트맵</p>
                    <label className="flex items-center gap-1.5 text-xs text-zinc-500">
                      <input type="checkbox" checked={showPath} onChange={(e) => setShowPath(e.target.checked)} />
                      이동 경로 겹쳐 보기
                    </label>
                  </div>
                  <GpsHeatmap
                    heatmap={track.heatmap}
                    lengthM={track.frame.lengthM}
                    widthM={track.frame.widthM}
                    path={showPath ? track.path : null}
                  />
                  {current.frame.source === "auto" && (
                    <p className="text-xs text-amber-700">
                      구장이 등록되지 않아 이 선수의 궤적으로 구장 범위를 추정했어요. 선수끼리 위치를 비교하려면 구장을 지정하세요.
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <p className="text-sm font-bold">속도 구간 비율</p>
                {zoneBreakdown(m).map((z) => (
                  <div key={z.key} className="flex items-center gap-2 text-xs">
                    <span className="w-24 shrink-0 text-zinc-600">
                      {z.label}
                      <i className="block not-italic text-[10px] text-zinc-400">{z.hint}</i>
                    </span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100">
                      <div
                        className={`h-full ${z.color}`}
                        style={{ width: `${z.share !== null ? z.share * 100 : (z.distanceM / zoneTotal) * 100}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right tabular-nums">
                      {z.share !== null && <b>{Math.round(z.share * 100)}% </b>}
                      <span className="text-zinc-400">{Math.round(z.distanceM)}m</span>
                    </span>
                  </div>
                ))}
                <p className="text-[11px] text-zinc-400">
                  {m.zonesS ? "퍼센트는 뛴 시간 기준, 미터는 그 구간에서 움직인 거리예요." : "예전 분석이라 거리 기준으로만 보여요. 구장을 다시 지정하면 시간 비율도 채워져요."}
                </p>
              </div>

              {m.areaShare && current.frame.source === "pitch" && (
                <p className="text-xs text-zinc-600">
                  <b>주로 뛴 곳</b> · {areaSummary(m.areaShare)}
                </p>
              )}

              <div className="space-y-1.5">
                <p className="text-sm font-bold">분당 이동거리</p>
                <div className="flex h-24 items-end gap-px">
                  {m.perMinuteM.map((d, i) => (
                    <div
                      key={i}
                      title={`${i + 1}분: ${Math.round(d)}m`}
                      className="flex-1 rounded-t bg-blue-700/80"
                      style={{ height: `${Math.max(2, (d / maxMinute) * 100)}%` }}
                    />
                  ))}
                </div>
              </div>

              <p className="text-xs text-zinc-400">
                사용한 위치 {m.pointCount.toLocaleString()}개 (제외 {m.droppedCount.toLocaleString()}개) · 기기 {current.deviceId || "-"}
              </p>
              {isAdmin && (
                <button type="button" onClick={() => removeTrack(current)} className="text-xs font-semibold text-red-600">
                  이 선수 기록 삭제
                </button>
              )}
            </div>
          )}

          </>
          )}
        </>
      )}

      {isAdmin && (
        <>
          <GpsUpload sessionId={session.id} members={members} onUploaded={load} />
          <div className="rounded-2xl border border-zinc-200 bg-white space-y-2 p-4">
            <p className="text-sm font-bold">구장</p>
            <select
              className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm"
              value={session.pitchId ?? ""}
              onChange={(e) => changePitch(e.target.value)}
            >
              <option value="">미지정 (자동 추정)</option>
              {pitches.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-zinc-400">바꾸면 보관해 둔 원본으로 모든 선수를 다시 분석해요.</p>
          </div>
          <button type="button" onClick={removeSession} className="text-sm font-semibold text-red-600">
            세션 삭제
          </button>
        </>
      )}
    </div>
  );
}

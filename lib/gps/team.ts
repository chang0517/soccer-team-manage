import type { GpsTrackDetail } from "../types";
import type { AreaShare, Heatmap } from "./types";
import { THIRD_LENGTH, THIRD_WIDTH } from "./zones";

// 한 경기(세션)에서 같이 뛴 선수들의 기록을 합쳐 비교·요약한다.

/** 화면에 보이는 네 가지 구분. 달리기와 고강도 러닝(4~7m/s)은 "빠른 달리기"로 묶는다. */
export type ZoneShare = { walk: number; jog: number; fast: number; sprint: number };

export type TeamRow = {
  trackId: number;
  memberId: number | null;
  name: string;
  distanceM: number;
  /** 뛴 시간이 선수마다 달라서 같이 비교할 수 있게 분당 거리도 둔다. */
  distancePerMin: number;
  maxSpeedKmh: number;
  sprintCount: number;
  sprintDistanceM: number;
  accelCount: number;
  decelCount: number;
  recordedMin: number;
  /** 시간 기준 비율(합 1). 예전 분석처럼 구간별 시간이 없으면 null. */
  zoneShare: ZoneShare | null;
};

export type TeamSummary = {
  rows: TeamRow[];
  totals: {
    players: number;
    distanceM: number;
    avgDistanceM: number;
    sprintCount: number;
    zoneShare: ZoneShare | null;
  };
  insights: string[];
  heatmap: Heatmap | null;
  frame: { lengthM: number; widthM: number } | null;
  notes: string[];
};

function shareOf(t: GpsTrackDetail): ZoneShare | null {
  const z = t.metrics.zonesS;
  if (!z) return null;
  const total = z.walkS + z.jogS + z.runS + z.hsrS + z.sprintS;
  if (total <= 0) return null;
  return {
    walk: z.walkS / total,
    jog: z.jogS / total,
    fast: (z.runS + z.hsrS) / total,
    sprint: z.sprintS / total,
  };
}

function mergeHeatmaps(tracks: GpsTrackDetail[]): Heatmap | null {
  const first = tracks[0]?.heatmap;
  if (!first) return null;
  const { cols, rows } = first;
  const acc = new Float64Array(cols * rows);
  for (const t of tracks) {
    const bytes = Buffer.from(t.heatmap.data, "base64");
    // 체류 시간(초)으로 되돌려 더한다. 기준값이 없는 예전 분석은 1초로 본다.
    const scale = (t.heatmap.refS ?? 1) / 255;
    for (let i = 0; i < acc.length; i++) acc[i] += bytes[i] * scale;
  }
  const nz = Array.from(acc).filter((v) => v > 1e-9).sort((a, b) => a - b);
  const ref = nz.length ? nz[Math.min(nz.length - 1, Math.floor(nz.length * 0.995))] : 1;
  const out = new Uint8Array(acc.length);
  for (let i = 0; i < acc.length; i++) out[i] = Math.max(0, Math.min(255, Math.round((acc[i] / ref) * 255)));
  return { cols, rows, cellM: first.cellM, data: Buffer.from(out).toString("base64"), refS: ref };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
const km = (m: number) => `${(m / 1000).toFixed(1)}km`;

function biggest(shares: [number, number, number], labels: string[]): string {
  let k = 0;
  for (let i = 1; i < 3; i++) if (shares[i] > shares[k]) k = i;
  return `${labels[k]} ${pct(shares[k])}`;
}

export function summarizeTeam(entries: { track: GpsTrackDetail; name: string }[]): TeamSummary {
  const notes: string[] = [];
  const rows: TeamRow[] = entries.map(({ track: t, name }) => ({
    trackId: t.id,
    memberId: t.memberId,
    name,
    distanceM: t.metrics.distanceM,
    distancePerMin: t.metrics.activeS > 0 ? t.metrics.distanceM / (t.metrics.activeS / 60) : 0,
    maxSpeedKmh: t.metrics.maxSpeedMs * 3.6,
    sprintCount: t.metrics.sprintCount,
    sprintDistanceM: t.metrics.sprintDistanceM,
    accelCount: t.metrics.accelCount,
    decelCount: t.metrics.decelCount,
    recordedMin: t.metrics.durationS / 60,
    zoneShare: shareOf(t),
  }));
  rows.sort((a, b) => b.distanceM - a.distanceM);

  // 구장이 등록돼 같은 틀로 분석된 기록만 한 구장 위에 겹친다.
  const aligned = entries.map((e) => e.track).filter((t) => t.frame.source === "pitch");
  const sameGrid = aligned.filter(
    (t) => t.heatmap.cols === aligned[0].heatmap.cols && t.heatmap.rows === aligned[0].heatmap.rows
  );
  if (aligned.length < entries.length) {
    notes.push(`구장이 지정되지 않은 ${entries.length - aligned.length}명은 팀 히트맵과 구역 분석에서 뺐어요.`);
  }
  const heatmap = sameGrid.length ? mergeHeatmaps(sameGrid) : null;
  const frame = sameGrid.length ? { lengthM: sameGrid[0].frame.lengthM, widthM: sameGrid[0].frame.widthM } : null;

  const minutes = rows.map((r) => r.recordedMin);
  if (rows.length > 1 && Math.max(...minutes) > Math.min(...minutes) * 1.2) {
    notes.push("기록된 시간이 선수마다 달라요. 이동거리 순위는 분당 거리와 함께 보세요.");
  }

  const players = rows.length;
  const totalDistance = rows.reduce((s, r) => s + r.distanceM, 0);
  const totalSprints = rows.reduce((s, r) => s + r.sprintCount, 0);

  // 팀 전체 속도 구간 비율: 선수별 시간을 합쳐서 계산한다.
  const sec = { walk: 0, jog: 0, fast: 0, sprint: 0 };
  for (const { track: t } of entries) {
    const z = t.metrics.zonesS;
    if (!z) continue;
    sec.walk += z.walkS;
    sec.jog += z.jogS;
    sec.fast += z.runS + z.hsrS;
    sec.sprint += z.sprintS;
  }
  const secTotal = sec.walk + sec.jog + sec.fast + sec.sprint;
  const zoneShare: ZoneShare | null =
    secTotal > 0
      ? { walk: sec.walk / secTotal, jog: sec.jog / secTotal, fast: sec.fast / secTotal, sprint: sec.sprint / secTotal }
      : null;

  const insights: string[] = [];
  if (players > 0) {
    const topDist = rows[0];
    insights.push(`가장 많이 뛴 선수는 ${topDist.name}님이에요 (${km(topDist.distanceM)}).`);
    const topSpeed = [...rows].sort((a, b) => b.maxSpeedKmh - a.maxSpeedKmh)[0];
    insights.push(`가장 빠른 선수는 ${topSpeed.name}님이에요 (최고 ${topSpeed.maxSpeedKmh.toFixed(1)}km/h).`);
    const topSprint = [...rows].sort((a, b) => b.sprintCount - a.sprintCount)[0];
    if (topSprint.sprintCount > 0) {
      insights.push(`스프린트를 가장 많이 한 선수는 ${topSprint.name}님이에요 (${topSprint.sprintCount}회).`);
    }
    if (players > 1) {
      insights.push(
        `${players}명 평균 이동거리는 ${km(totalDistance / players)}, 평균 스프린트는 ${(totalSprints / players).toFixed(1)}회예요.`
      );
    }
  }
  if (zoneShare) {
    insights.push(
      `팀 전체 시간의 ${pct(zoneShare.walk)}는 걷기, ${pct(zoneShare.jog)}는 조깅, ${pct(zoneShare.fast)}는 빠른 달리기, ${pct(zoneShare.sprint)}는 스프린트였어요.`
    );
  }

  // 팀이 많이 머문 구역(시간 가중 평균).
  let areaW = 0;
  const thirds: [number, number, number] = [0, 0, 0];
  const lanes: [number, number, number] = [0, 0, 0];
  for (const t of sameGrid) {
    const a: AreaShare | null | undefined = t.metrics.areaShare;
    if (!a) continue;
    const w = t.metrics.activeS;
    areaW += w;
    for (let i = 0; i < 3; i++) {
      thirds[i] += a.thirds[i] * w;
      lanes[i] += a.lanes[i] * w;
    }
  }
  if (areaW > 0) {
    const tn = thirds.map((v) => v / areaW) as [number, number, number];
    const ln = lanes.map((v) => v / areaW) as [number, number, number];
    insights.push(
      `팀이 가장 오래 머문 곳은 길이 방향으로 ${biggest(tn, THIRD_LENGTH)}, 폭 방향으로 ${biggest(ln, THIRD_WIDTH)}이에요.`
    );
  }

  return {
    rows,
    totals: { players, distanceM: totalDistance, avgDistanceM: players ? totalDistance / players : 0, sprintCount: totalSprints, zoneShare },
    insights,
    heatmap,
    frame,
    notes,
  };
}

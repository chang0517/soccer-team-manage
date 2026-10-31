import type { AreaShare, TrackMetrics } from "./types";

// 화면에 보이는 속도 구분. 분석에서는 달리기(4–5.5)와 고강도 러닝(5.5–7)을
// 따로 세지만, 보여줄 때는 "빠른 달리기"로 묶는다.
export const ZONE_ROWS = [
  { key: "walk", label: "걷기", hint: "2m/s 미만", color: "bg-zinc-300" },
  { key: "jog", label: "조깅", hint: "2–4m/s", color: "bg-sky-300" },
  { key: "fast", label: "빠른 달리기", hint: "4–7m/s", color: "bg-emerald-400" },
  { key: "sprint", label: "스프린트", hint: "7m/s 이상", color: "bg-red-500" },
] as const;

export type ZoneKey = (typeof ZONE_ROWS)[number]["key"];

export const THIRD_LENGTH = ["1번 골라인 쪽", "중앙", "반대쪽 골라인 쪽"];
export const THIRD_WIDTH = ["1–2번 터치라인 쪽", "가운데", "반대쪽 터치라인 쪽"];

/** 한 선수의 구간별 거리와 시간 비율(시간 정보가 없는 예전 분석이면 share는 null). */
export function zoneBreakdown(m: TrackMetrics) {
  const dist: Record<ZoneKey, number> = {
    walk: m.zones.walkM,
    jog: m.zones.jogM,
    fast: m.zones.runM + m.zones.hsrM,
    sprint: m.zones.sprintM,
  };
  const z = m.zonesS;
  const total = z ? z.walkS + z.jogS + z.runS + z.hsrS + z.sprintS : 0;
  const share: Record<ZoneKey, number> | null =
    z && total > 0
      ? { walk: z.walkS / total, jog: z.jogS / total, fast: (z.runS + z.hsrS) / total, sprint: z.sprintS / total }
      : null;
  return ZONE_ROWS.map((r) => ({ ...r, distanceM: dist[r.key], share: share ? share[r.key] : null }));
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function top(shares: [number, number, number], labels: string[]): string {
  let k = 0;
  for (let i = 1; i < 3; i++) if (shares[i] > shares[k]) k = i;
  return `${labels[k]} ${pct(shares[k])}`;
}

export function areaSummary(a: AreaShare): string {
  return `길이 방향 ${top(a.thirds, THIRD_LENGTH)}, 폭 방향 ${top(a.lanes, THIRD_WIDTH)}`;
}

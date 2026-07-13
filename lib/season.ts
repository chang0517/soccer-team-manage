import { todayStr } from "./format";

/**
 * Raven FC 시즌은 매년 12월 15일에 시작해서 다음 해 12월 14일까지다.
 * 예: 2026-12-15 ~ 2027-12-14 경기는 모두 "2027 시즌" 기록으로 묶인다.
 */
export function seasonOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return m === 12 && d >= 15 ? y + 1 : y;
}

export function currentSeason(): number {
  return seasonOf(todayStr());
}

export function seasonLabel(season: number): string {
  return `${season} 시즌`;
}

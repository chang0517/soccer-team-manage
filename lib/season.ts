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

/**
 * historical_stats(앱 이전 스프레드시트 누적 기록)는 시즌 구분 없이 한
 * 회원당 한 줄로만 저장돼 있는데, 그 안의 경기들이 실제로는 전부 2026
 * 시즌(2025-12-15~2026-12-14) 안에 열린 경기라서 이 시즌에 한해서만
 * 시즌별 랭킹에도 반영한다.
 */
export const HISTORICAL_BASELINE_SEASON = 2026;

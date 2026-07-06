// 투표 마감 규칙: 경기 3일 전까지만 투표 가능하고, 참석 인원이 20명이
// 차면 그 전이라도 자동으로 마감한다. 운영진은 마감 후에도 예외적으로
// 투표를 대신 추가할 수 있다.
export const VOTE_DEADLINE_DAYS = 3;
export const ATTEND_CAP = 20;

export function isVotingClosed(daysUntilMatch: number, attendCount: number): boolean {
  return daysUntilMatch < VOTE_DEADLINE_DAYS || attendCount >= ATTEND_CAP;
}

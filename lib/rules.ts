// 투표 마감 규칙: 경기 3일 전까지만 투표 가능하고, 참석 인원이 30명이
// 차면 그 전이라도 자동으로 마감한다. 운영진은 마감 후에도 예외적으로
// 투표를 대신 추가할 수 있다.
export const VOTE_DEADLINE_DAYS = 3;
export const ATTEND_CAP = 30;

// 비품(공가방·물/음료·아이스박스) 담당자 입력 알림을 보내는 기준 — 경기
// 시작 시각으로부터 이 시간이 지나면 "경기 종료"로 본다(별도 종료 시각 필드가
// 없어 시작 시각 기준으로 추정).
export const MATCH_DURATION_HOURS = 2;

export function isVotingClosed(daysUntilMatch: number, attendCount: number): boolean {
  return daysUntilMatch < VOTE_DEADLINE_DAYS || attendCount >= ATTEND_CAP;
}

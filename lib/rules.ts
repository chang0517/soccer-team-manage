// 투표 마감 규칙: 경기 3일 전까지만 투표 가능하고, 참석 인원이 30명이
// 차면 그 전이라도 자동으로 마감한다. 운영진은 마감 후에도 예외적으로
// 투표를 대신 추가할 수 있다.
export const VOTE_DEADLINE_DAYS = 3;
export const ATTEND_CAP = 30;

// 경기 시작 시각으로부터 이 시간이 지나면 "경기 종료"로 본다(별도 종료
// 시각 필드가 없어 시작 시각 기준으로 추정). 캘린더 피드의 이벤트 종료
// 시각 계산에도 쓰인다.
export const MATCH_DURATION_HOURS = 2;

// 비품(공가방·물/음료·아이스박스) 담당자 입력 알림은 경기 종료 후 이만큼
// 더 기다렸다가 보낸다 — 끝나자마자 바로 재촉하지 않고 직접 입력할 여유를
// 준다.
export const EQUIPMENT_REMINDER_DELAY_MINUTES = 30;

export function isVotingClosed(daysUntilMatch: number, attendCount: number): boolean {
  return daysUntilMatch < VOTE_DEADLINE_DAYS || attendCount >= ATTEND_CAP;
}

export function formatDate(date: string, time?: string): string {
  const d = new Date(`${date}T00:00:00`);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
  return time ? `${base} ${time}` : base;
}

// 서버가 어느 시간대에서 돌든 항상 한국 시간(KST) 기준 "오늘"을 반환한다.
export function todayStr(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(
    new Date()
  );
}

export function daysUntil(date: string): number {
  const t = new Date(`${todayStr()}T00:00:00`).getTime();
  const e = new Date(`${date}T00:00:00`).getTime();
  return Math.round((e - t) / 86400000);
}

export function dDayLabel(date: string): string {
  const n = daysUntil(date);
  if (n === 0) return "D-DAY";
  return n > 0 ? `D-${n}` : `종료`;
}

import type { EventItem } from "./types";

// 우리 팀 홈 유니폼(하늘색 + 검정) 기준, 멀리서도 확실히 구별되는 색깔 위주로
// "추천"을 표시한다. 하늘색·검정 둘 다와 명도·색상이 크게 달라서 헷갈릴 일이
// 적은 색들이다. 나머지는 선택은 가능하되 추천 표시는 하지 않는다.
export interface KitColorOption {
  name: string;
  hex: string;
  recommended: boolean;
}

export const KIT_COLOR_OPTIONS: KitColorOption[] = [
  { name: "흰색", hex: "#ffffff", recommended: true },
  { name: "노란색", hex: "#eab308", recommended: true },
  { name: "주황색", hex: "#f97316", recommended: true },
  { name: "형광연두", hex: "#84cc16", recommended: true },
  { name: "빨간색", hex: "#dc2626", recommended: false },
  { name: "초록색", hex: "#16a34a", recommended: false },
  { name: "보라색", hex: "#7c3aed", recommended: false },
  { name: "분홍색", hex: "#ec4899", recommended: false },
  { name: "남색", hex: "#1e3a8a", recommended: false },
  { name: "회색", hex: "#6b7280", recommended: false },
];

/**
 * 같은 이름(대소문자/공백 무시)의 상대팀과 이전에 경기한 기록이 있으면,
 * 가장 최근에 저장해둔 유니폼 색깔을 돌려준다. 없으면 빈 문자열.
 */
export function findRememberedKitColor(
  events: EventItem[],
  opponentName: string,
  excludeEventId?: number
): string {
  const key = opponentName.trim().toLowerCase();
  if (!key) return "";
  const matches = events
    .filter(
      (e) =>
        e.id !== excludeEventId &&
        e.opponentKitColor?.trim() &&
        e.opponent.trim().toLowerCase() === key
    )
    .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  return matches[0]?.opponentKitColor ?? "";
}

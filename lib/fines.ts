import type { EventItem, Member, VoteRow } from "./types";

export interface FineNotice {
  memberId: number;
  name: string;
  phone: string | null;
  missedEvents: { id: number; title: string; date: string }[];
  message: string;
}

const FINE_ACCOUNT = "28991047394507 하나은행 (임성환)";
const FINE_AMOUNT = "20,000원";

export function buildFineMessage(name: string): string {
  return `[Raven FC 벌금 안내]

안녕하세요, ${name}님.

레이븐 회칙상 매월 1일까지 투표를 완료해야 하나, 이번 투표 기한 내 참여가 확인되지 않았습니다.

이에 따라 벌금 ${FINE_AMOUNT}이 부과되었음을 안내드립니다.

- 입금 계좌: ${FINE_ACCOUNT}
- 입금 금액: ${FINE_AMOUNT}

빠른 시일 내 입금 부탁드리며, 앞으로는 투표 기한을 꼭 지켜주시기 바랍니다.

감사합니다.`;
}

/**
 * 주어진 연/월에 열리는 경기 일정(type=match) 전부에 대해, 한 번이라도
 * 투표(참석/미정/불참 중 아무거나)하지 않은 정식 멤버(용병 제외)를 찾는다.
 * 레이븐 회칙: 그 달 경기 투표는 그 달 1일 자정까지 완료해야 함.
 */
export function computeMonthlyNonVoters(
  year: number,
  month: number,
  events: EventItem[],
  votesByEvent: Map<number, VoteRow[]>,
  members: Member[]
): FineNotice[] {
  const prefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthEvents = events.filter(
    (e) => e.type === "match" && e.date.startsWith(prefix)
  );
  if (monthEvents.length === 0) return [];

  const votedMembers = new Map<number, Set<number>>(); // eventId -> voted memberIds
  for (const e of monthEvents) {
    votedMembers.set(
      e.id,
      new Set((votesByEvent.get(e.id) ?? []).map((v) => v.memberId))
    );
  }

  const realMembers = members.filter((m) => !m.isGuest);
  const notices: FineNotice[] = [];
  for (const m of realMembers) {
    const missed = monthEvents.filter((e) => !votedMembers.get(e.id)?.has(m.id));
    if (missed.length === 0) continue;
    notices.push({
      memberId: m.id,
      name: m.name,
      phone: m.phone,
      missedEvents: missed.map((e) => ({ id: e.id, title: e.title, date: e.date })),
      message: buildFineMessage(m.name),
    });
  }
  return notices;
}

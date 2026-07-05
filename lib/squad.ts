import type { Member, PosGroup, QuarterSquad, SquadData } from "./types";

export const QUARTER_COUNT = 4;

export interface SlotDef {
  id: string;
  accepts: PosGroup[];
  label: string;
  x: number;
  y: number;
}

// 4-1-2-1-2 (다이아몬드): GK 1 / CB·WB 4 / DM 1 / (DM·AM) 2 / AM 1 / (ST·WG) 2
// 다이아몬드형 미드필더에는 순수 측면 자리가 없어, 좌우 CM은 수미·공미 겸업으로,
// 최전방 2자리는 스트라이커·윙어 겸업으로 받는다. 폭은 윙백이 담당한다.
export const FORMATION_SLOTS: SlotDef[] = [
  { id: "GK", accepts: ["GK"], label: "GK", x: 50, y: 91 },
  { id: "LB", accepts: ["WB"], label: "LB", x: 13, y: 72 },
  { id: "LCB", accepts: ["CB"], label: "CB", x: 37, y: 77 },
  { id: "RCB", accepts: ["CB"], label: "CB", x: 63, y: 77 },
  { id: "RB", accepts: ["WB"], label: "RB", x: 87, y: 72 },
  { id: "DM", accepts: ["DM"], label: "DM", x: 50, y: 58 },
  { id: "LCM", accepts: ["DM", "AM"], label: "CM", x: 26, y: 44 },
  { id: "RCM", accepts: ["DM", "AM"], label: "CM", x: 74, y: 44 },
  { id: "AM", accepts: ["AM"], label: "AM", x: 50, y: 31 },
  { id: "LST", accepts: ["ST", "WG"], label: "ST", x: 33, y: 13 },
  { id: "RST", accepts: ["ST", "WG"], label: "ST", x: 67, y: 13 },
];

export function slotAccepts(slotId: string): PosGroup[] {
  return FORMATION_SLOTS.find((s) => s.id === slotId)?.accepts ?? [];
}

/**
 * 슬롯에 배정된 선수의 실제 선호 포지션을 반환한다 (1순위가 슬롯과 맞으면 1순위,
 * 아니면 2순위, 그것도 아니면 슬롯이 받는 포지션 중 첫 번째).
 */
export function slotPositionFor(slotId: string, member: Member): PosGroup | "" {
  const accepts = slotAccepts(slotId);
  if (accepts.includes(member.pos1)) return member.pos1;
  if (accepts.includes(member.pos2)) return member.pos2;
  return accepts[0] ?? "";
}

/**
 * 참석자를 포지션 선호도에 따라 쿼터 하나의 스쿼드를 채운다.
 * 1차: 1순위 포지션이 해당 슬롯에 맞는 사람으로 채우고
 * 2차: 남은 슬롯을 2순위 희망자로, 3차: 남은 참석자 아무나로 채운다.
 * 같은 조건이면 이번 경기에서 지금까지 덜 뛴 사람을 우선한다(로테이션).
 */
function fillQuarter(
  attendees: Member[],
  playCount: Map<number, number>
): QuarterSquad {
  const assigned = new Map<string, number>();
  const used = new Set<number>();

  const fill = (matches: (m: Member, slot: SlotDef) => boolean) => {
    for (const slot of FORMATION_SLOTS) {
      if (assigned.has(slot.id)) continue;
      const candidates = attendees
        .filter((m) => !used.has(m.id) && matches(m, slot))
        .sort((a, b) => (playCount.get(a.id) ?? 0) - (playCount.get(b.id) ?? 0));
      const pick = candidates[0];
      if (pick) {
        assigned.set(slot.id, pick.id);
        used.add(pick.id);
      }
    }
  };

  fill((m, slot) => slot.accepts.includes(m.pos1));
  fill((m, slot) => slot.accepts.includes(m.pos2));
  fill(() => true);

  for (const id of used) playCount.set(id, (playCount.get(id) ?? 0) + 1);

  return {
    starters: FORMATION_SLOTS.map((s) => ({
      slotId: s.id,
      memberId: assigned.get(s.id) ?? null,
    })),
    bench: attendees.filter((m) => !used.has(m.id)).map((m) => m.id),
  };
}

/**
 * 참석자를 포지션 선호도 기반으로 4쿼터 각각 독립된 스쿼드로 배치한다.
 * 쿼터가 진행될수록 아직 덜 뛴 참석자를 우선 배치해 출전 기회를 고르게 나눈다.
 */
export function generateSquad(attendees: Member[]): SquadData {
  const playCount = new Map<number, number>(attendees.map((m) => [m.id, 0]));
  const quarters: QuarterSquad[] = [];
  for (let q = 0; q < QUARTER_COUNT; q++) {
    quarters.push(fillQuarter(attendees, playCount));
  }
  return { quarters, generatedAt: new Date().toISOString() };
}

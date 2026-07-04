import type { Member, PosGroup, SquadData } from "./types";

export interface SlotDef {
  id: string;
  group: PosGroup;
  label: string;
  x: number;
  y: number;
}

// 4-1-2-1-2 (다이아몬드): GK 1 / DF 4 / DM 1 / CM 2 / AM 1 / FW 2
export const FORMATION_SLOTS: SlotDef[] = [
  { id: "GK", group: "GK", label: "GK", x: 50, y: 91 },
  { id: "LB", group: "DF", label: "LB", x: 13, y: 72 },
  { id: "LCB", group: "DF", label: "CB", x: 37, y: 77 },
  { id: "RCB", group: "DF", label: "CB", x: 63, y: 77 },
  { id: "RB", group: "DF", label: "RB", x: 87, y: 72 },
  { id: "DM", group: "DM", label: "DM", x: 50, y: 58 },
  { id: "LCM", group: "CM", label: "CM", x: 26, y: 44 },
  { id: "RCM", group: "CM", label: "CM", x: 74, y: 44 },
  { id: "AM", group: "AM", label: "AM", x: 50, y: 31 },
  { id: "LST", group: "FW", label: "ST", x: 33, y: 13 },
  { id: "RST", group: "FW", label: "ST", x: 67, y: 13 },
];

export function slotGroup(slotId: string): PosGroup | "" {
  return FORMATION_SLOTS.find((s) => s.id === slotId)?.group ?? "";
}

/**
 * 참석자를 포지션 선호도에 따라 자동 배치한다.
 * 1차: 1순위 포지션이 해당 그룹인 사람으로 슬롯을 채우고
 * 2차: 남은 슬롯을 2순위 희망자로, 3차: 남은 참석자 아무나로 채운다.
 * 남는 인원은 벤치(교체 명단).
 */
export function generateSquad(attendees: Member[]): SquadData {
  const assigned = new Map<string, number>();
  const used = new Set<number>();
  const groups: PosGroup[] = ["GK", "DF", "DM", "CM", "AM", "FW"];

  const fill = (pref: (m: Member, g: PosGroup) => boolean) => {
    for (const g of groups) {
      const slots = FORMATION_SLOTS.filter(
        (s) => s.group === g && !assigned.has(s.id)
      );
      if (slots.length === 0) continue;
      const candidates = attendees.filter((m) => !used.has(m.id) && pref(m, g));
      for (const slot of slots) {
        const pick = candidates.shift();
        if (!pick) break;
        assigned.set(slot.id, pick.id);
        used.add(pick.id);
      }
    }
  };

  fill((m, g) => m.pos1 === g);
  fill((m, g) => m.pos2 === g);
  fill(() => true);

  return {
    starters: FORMATION_SLOTS.map((s) => ({
      slotId: s.id,
      memberId: assigned.get(s.id) ?? null,
    })),
    bench: attendees.filter((m) => !used.has(m.id)).map((m) => m.id),
    generatedAt: new Date().toISOString(),
  };
}

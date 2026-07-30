import type { Member, PosGroup, QuarterSquad, SquadData } from "./types";
import { POS_SHORT } from "./types";

export const QUARTER_COUNT = 4;

// 깃헙 PR 승인처럼, 운영진이 이 인원수 이상 승인해야 스쿼드가 확정(잠금)된다.
export const SQUAD_APPROVAL_THRESHOLD = 3;

// 스쿼드가 확정(잠금) 상태인지 판단한다. 예전 방식(confirmed 플래그를 운영진
// 1명이 직접 켬)으로 이미 확정된 과거 데이터는 그대로 확정 상태로 인정하고,
// 그 외에는 approvedBy에 쌓인 운영진 승인 수로 판단한다.
export function isSquadConfirmed(squad: SquadData | null | undefined): boolean {
  if (!squad) return false;
  if (squad.confirmed) return true;
  return (squad.approvedBy?.length ?? 0) >= SQUAD_APPROVAL_THRESHOLD;
}

export type SlotCategory = "GK" | "DF" | "MF" | "FW";

export interface SlotDef {
  id: string;
  accepts: PosGroup[];
  label: string;
  category: SlotCategory;
  x: number;
  y: number;
}

// 4-1-2-2-1: GK 1 / CB·WB 4 / DM 1 / (DM·AM) 2 / (WG·AM) 2 / ST 1
// 수미 한 명이 뒤에서 지키고 그 앞 두 명의 CM이 박스투박스, 좌우 두 명은
// 공미·윙어 겸업으로 폭과 침투를 담당, 최전방엔 스트라이커 한 명만 둔다.
export const FORMATION_SLOTS: SlotDef[] = [
  { id: "GK", accepts: ["GK"], label: "GK", category: "GK", x: 50, y: 91 },
  { id: "LB", accepts: ["WB"], label: "LB", category: "DF", x: 13, y: 72 },
  { id: "LCB", accepts: ["CB"], label: "CB", category: "DF", x: 37, y: 77 },
  { id: "RCB", accepts: ["CB"], label: "CB", category: "DF", x: 63, y: 77 },
  { id: "RB", accepts: ["WB"], label: "RB", category: "DF", x: 87, y: 72 },
  { id: "DM", accepts: ["DM"], label: "DM", category: "MF", x: 50, y: 60 },
  { id: "LCM", accepts: ["DM", "AM"], label: "CM", category: "MF", x: 30, y: 46 },
  { id: "RCM", accepts: ["DM", "AM"], label: "CM", category: "MF", x: 70, y: 46 },
  { id: "LW", accepts: ["WG", "AM"], label: "LW", category: "FW", x: 16, y: 26 },
  { id: "RW", accepts: ["WG", "AM"], label: "RW", category: "FW", x: 84, y: 26 },
  { id: "ST", accepts: ["ST"], label: "ST", category: "FW", x: 50, y: 13 },
];

export const SLOT_CATEGORY_COLORS: Record<
  SlotCategory,
  { bg: string; text: string }
> = {
  GK: { bg: "bg-amber-400", text: "text-amber-950" },
  DF: { bg: "bg-sky-400", text: "text-sky-950" },
  MF: { bg: "bg-violet-300", text: "text-violet-950" },
  FW: { bg: "bg-rose-400", text: "text-rose-950" },
};

export function slotAccepts(slotId: string): PosGroup[] {
  return FORMATION_SLOTS.find((s) => s.id === slotId)?.accepts ?? [];
}

/**
 * 슬롯 표시용 라벨. 받는 포지션이 하나뿐이고 그게 슬롯 라벨과 같으면
 * ("GK · GK", "CB · CB" 같은 중복) 라벨 하나만 보여준다.
 */
export function slotDisplayLabel(slot: SlotDef): string {
  if (slot.accepts.length === 1 && POS_SHORT[slot.accepts[0]] === slot.label) {
    return slot.label;
  }
  return `${slot.label} · ${slot.accepts.map((g) => POS_SHORT[g]).join("/")}`;
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
 * 클린시트 판정용 "최종 확정 포지션". 선수의 선호 포지션과 무관하게, 그 쿼터에
 * 실제로 배정된 슬롯 자체가 무엇인지로만 판단한다 — LCM·RCM은 DM·AM을 겸업으로
 * 받는 슬롯이라 선수의 1순위가 DM(수미)이어도, 그 쿼터의 확정 포지션은 항상
 * CM이라 클린시트 대상(GK·CB·WB·DM)에 들지 않는다. 오직 슬롯 id가 "DM"인
 * 경우에만 수미로 인정한다.
 */
export function slotFinalPosition(slotId: string): PosGroup | "" {
  if (slotId === "GK") return "GK";
  if (slotId === "LB" || slotId === "RB") return "WB";
  if (slotId === "LCB" || slotId === "RCB") return "CB";
  if (slotId === "DM") return "DM";
  return "";
}

function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 포지션(PosGroup)이 속한 슬롯 카테고리(수비/미드필더/공격/GK). */
export function categoryOf(pos: PosGroup): SlotCategory {
  if (pos === "GK") return "GK";
  if (pos === "CB" || pos === "WB") return "DF";
  if (pos === "DM" || pos === "AM") return "MF";
  return "FW"; // WG, ST
}

/**
 * 쿼터 하나의 스쿼드를 슬롯 단위로 채운다. 같은 카테고리(수비/미드필더/공격)
 * 안에서만 배치가 이루어지도록 고정한다 — 수비수가 공격 슬롯에, 공격수가
 * 수비 슬롯에 들어가는 일이 없다: 1차 1순위 포지션이 슬롯과 정확히
 * 일치하는 사람, 2차 2순위 포지션이 일치하는 사람, 3차 카테고리만
 * 같으면(예: CB가 WB 자리, AM이 DM 자리) 허용. 카테고리를 벗어나는
 * 배치는 하지 않는다 — 해당 카테고리에 뛸 사람이 부족하면 슬롯은 빈다.
 * 우선순위는 그 카테고리에서 지금까지 덜 뛴 사람 순 — 그래서 포지션마다
 * 쿼터 수는 달라도 "같은 포지션끼리는" 고르게 나뉜다.
 */
function fillQuarter(
  attendees: Member[],
  catPlayCount: Map<string, number>
): QuarterSquad {
  const assigned = new Map<string, number>();
  const used = new Set<number>();
  const key = (memberId: number, cat: SlotCategory) => `${memberId}:${cat}`;
  const countFor = (memberId: number, cat: SlotCategory) =>
    catPlayCount.get(key(memberId, cat)) ?? 0;

  const fill = (matches: (m: Member, slot: SlotDef) => boolean) => {
    for (const slot of shuffle(FORMATION_SLOTS)) {
      if (assigned.has(slot.id)) continue;
      const candidates = shuffle(
        attendees.filter((m) => !used.has(m.id) && matches(m, slot))
      ).sort(
        (a, b) => countFor(a.id, slot.category) - countFor(b.id, slot.category)
      );
      const pick = candidates[0];
      if (pick) {
        assigned.set(slot.id, pick.id);
        used.add(pick.id);
      }
    }
  };

  // slot.accepts는 겸업 조합(예: LW/RW가 WG·AM 겸용)을 허용하지만, 카테고리
  // 자체를 넘나드는 겸업(AM=미드필더가 LW/RW=공격 자리에 들어가는 것)은
  // 자동생성에서는 막는다 — 그래서 매 패스마다 카테고리 일치까지 같이 본다.
  fill(
    (m, slot) => slot.accepts.includes(m.pos1) && categoryOf(m.pos1) === slot.category
  );
  fill(
    (m, slot) => slot.accepts.includes(m.pos2) && categoryOf(m.pos2) === slot.category
  );
  fill(
    (m, slot) =>
      categoryOf(m.pos1) === slot.category || categoryOf(m.pos2) === slot.category
  );

  for (const [slotId, memberId] of assigned) {
    const slot = FORMATION_SLOTS.find((s) => s.id === slotId)!;
    const k = key(memberId, slot.category);
    catPlayCount.set(k, (catPlayCount.get(k) ?? 0) + 1);
  }

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
 * 카테고리(수비/미드필더/공격)별로 출전 횟수를 따로 세어, 쿼터가
 * 진행될수록 그 카테고리에서 아직 덜 뛴 참석자를 우선 배치한다.
 */
export function generateSquad(attendees: Member[]): SquadData {
  const catPlayCount = new Map<string, number>();
  const quarters: QuarterSquad[] = [];
  for (let q = 0; q < QUARTER_COUNT; q++) {
    quarters.push(fillQuarter(attendees, catPlayCount));
  }
  return { quarters, generatedAt: new Date().toISOString() };
}

/**
 * 내전(자체 훈련용 2팀 스크리미지)을 위해 참석자를 포지션 균형을 맞춰 두
 * 팀으로 나눈다. 카테고리(수비/미드필더/공격)별로 따로 섞어서 절반씩 두
 * 팀에 번갈아 배정하므로, 인원이 맞으면 양 팀이 비슷한 포지션 구성을 갖는다.
 */
export function splitScrimmageTeams(attendees: Member[]): {
  teamA: Member[];
  teamB: Member[];
} {
  const byCategory = new Map<SlotCategory, Member[]>();
  for (const m of attendees) {
    const cat = categoryOf(m.pos1);
    const list = byCategory.get(cat) ?? [];
    list.push(m);
    byCategory.set(cat, list);
  }

  const teamA: Member[] = [];
  const teamB: Member[] = [];
  for (const list of byCategory.values()) {
    shuffle(list).forEach((m, i) => (i % 2 === 0 ? teamA : teamB).push(m));
  }
  return { teamA, teamB };
}

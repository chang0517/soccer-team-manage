import type { EventItem, Member, RankingRow, RecordRow } from "./types";

export const RULES = {
  goal: 1,
  assist: 1,
  cleanSheetDefence: 1, // GK · DF
  cleanSheetDm: 0.5, // 수비형 미드필더(수미)
};

/**
 * 점수 규칙: 골 1점, 어시스트 1점.
 * 무실점(클린시트) 경기에 출전한 GK·수비수는 1점, 수미는 0.5점.
 */
export function computeRanking(
  members: Member[],
  events: EventItem[],
  records: RecordRow[]
): RankingRow[] {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const rows = new Map<number, RankingRow>(
    members.map((m) => [
      m.id,
      { member: m, played: 0, goals: 0, assists: 0, cleanPts: 0, total: 0 },
    ])
  );

  for (const r of records) {
    const row = rows.get(r.memberId);
    if (!row) continue;
    const ev = eventById.get(r.eventId);
    if (r.played) row.played += 1;
    row.goals += r.goals;
    row.assists += r.assists;
    if (r.played && ev && ev.conceded === 0) {
      if (r.position === "GK" || r.position === "DF")
        row.cleanPts += RULES.cleanSheetDefence;
      else if (r.position === "DM") row.cleanPts += RULES.cleanSheetDm;
    }
  }

  const out = [...rows.values()];
  for (const row of out) {
    row.total =
      row.goals * RULES.goal + row.assists * RULES.assist + row.cleanPts;
  }
  out.sort(
    (a, b) =>
      b.total - a.total ||
      b.goals - a.goals ||
      b.assists - a.assists ||
      a.member.name.localeCompare(b.member.name, "ko")
  );
  return out;
}

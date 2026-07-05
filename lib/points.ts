import type { EventItem, Member, MvpVoteRow, RankingRow, RecordRow } from "./types";

export const RULES = {
  participation: 1, // 경기 출전 자체
  goal: 1,
  assist: 1,
  cleanSheetDefence: 1, // GK · 센터백 · 윙백
  cleanSheetDm: 0.5, // 수비형 미드필더(수미)
};

/**
 * 경기별 MVP 투표를 집계해 각 경기의 최다 득표자(동률이면 모두)를 찾고,
 * 선수별로 MVP로 뽑힌 경기 수를 센다.
 */
export function computeMvpCounts(mvpVotes: MvpVoteRow[]): Map<number, number> {
  const votesByEvent = new Map<number, MvpVoteRow[]>();
  for (const v of mvpVotes) {
    const list = votesByEvent.get(v.eventId) ?? [];
    list.push(v);
    votesByEvent.set(v.eventId, list);
  }

  const mvpCounts = new Map<number, number>();
  for (const votes of votesByEvent.values()) {
    const tally = new Map<number, number>();
    for (const v of votes) tally.set(v.voteeId, (tally.get(v.voteeId) ?? 0) + 1);
    const max = Math.max(...tally.values());
    if (max <= 0) continue;
    for (const [voteeId, count] of tally) {
      if (count === max) mvpCounts.set(voteeId, (mvpCounts.get(voteeId) ?? 0) + 1);
    }
  }
  return mvpCounts;
}

/**
 * 점수 규칙: 출전 1점, 골 1점, 어시스트 1점.
 * 무실점(클린시트) 경기에 출전한 GK·센터백·윙백은 1점, 수미는 0.5점.
 * MVP 선정 횟수는 총점에는 반영하지 않고 별도로 집계한다.
 */
export function computeRanking(
  members: Member[],
  events: EventItem[],
  records: RecordRow[],
  mvpVotes: MvpVoteRow[] = []
): RankingRow[] {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const mvpCounts = computeMvpCounts(mvpVotes);
  const rows = new Map<number, RankingRow>(
    members.map((m) => [
      m.id,
      {
        member: m,
        played: 0,
        goals: 0,
        assists: 0,
        cleanPts: 0,
        mvpCount: mvpCounts.get(m.id) ?? 0,
        total: 0,
      },
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
      if (r.position === "GK" || r.position === "CB" || r.position === "WB")
        row.cleanPts += RULES.cleanSheetDefence;
      else if (r.position === "DM") row.cleanPts += RULES.cleanSheetDm;
    }
  }

  const out = [...rows.values()];
  for (const row of out) {
    row.total =
      row.played * RULES.participation +
      row.goals * RULES.goal +
      row.assists * RULES.assist +
      row.cleanPts;
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

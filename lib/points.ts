import type {
  EventItem,
  HistoricalStats,
  Member,
  MvpVoteRow,
  RankingRow,
  RecordRow,
} from "./types";

// 기존에 스프레드시트로 관리하던 시절 SCORE 공식(참여1.5·골1.4·어시1.25·클린1.25/0.625)을
// 그대로 이어받아 적용한다. historical_stats(과거 누적) 값도 이 가중치 기준으로 저장된다.
export const RULES = {
  participation: 1.5, // 경기 출전 자체
  goal: 1.4,
  assist: 1.25,
  cleanSheetDefence: 1.25, // GK · 센터백 · 윙백 (C(1) 풀 클린)
  cleanSheetDm: 0.625, // 수비형 미드필더(수미) (C(0.5) 하프 클린)
};

const FIRE_STREAK_THRESHOLD = 3;

export interface StreakInfo {
  count: number; // 3 이상일 때만 값이 채워짐 (그 미만이면 0)
  type: "goal" | "assist" | null;
}

/**
 * 각 선수가 실제로 출전한 경기들을 시간순으로 놓고, 가장 최근 경기부터
 * 거슬러 올라가며 "골을 넣은 경기"가 이어진 횟수와 "어시스트한 경기"가
 * 이어진 횟수를 각각 센다. 둘 중 하나라도 3경기 이상 이어지면 그 값을 반환한다.
 */
export function computeStreaks(
  events: EventItem[],
  records: RecordRow[]
): Map<number, StreakInfo> {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const byMember = new Map<number, RecordRow[]>();
  for (const r of records) {
    if (!r.played || !eventById.has(r.eventId)) continue;
    const list = byMember.get(r.memberId) ?? [];
    list.push(r);
    byMember.set(r.memberId, list);
  }

  const streaks = new Map<number, StreakInfo>();
  for (const [memberId, recs] of byMember) {
    const sorted = recs
      .slice()
      .sort((a, b) => {
        const ea = eventById.get(a.eventId)!;
        const eb = eventById.get(b.eventId)!;
        return `${ea.date}${ea.time}`.localeCompare(`${eb.date}${eb.time}`);
      });

    const streakFrom = (hit: (r: RecordRow) => boolean) => {
      let n = 0;
      for (let i = sorted.length - 1; i >= 0; i--) {
        if (!hit(sorted[i])) break;
        n++;
      }
      return n;
    };
    const goalStreak = streakFrom((r) => r.goals > 0);
    const assistStreak = streakFrom((r) => r.assists > 0);

    if (goalStreak >= FIRE_STREAK_THRESHOLD || assistStreak >= FIRE_STREAK_THRESHOLD) {
      const isGoal = goalStreak >= assistStreak;
      streaks.set(memberId, {
        count: isGoal ? goalStreak : assistStreak,
        type: isGoal ? "goal" : "assist",
      });
    } else {
      streaks.set(memberId, { count: 0, type: null });
    }
  }
  return streaks;
}

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
 * 점수 규칙: 출전 1.5점, 골 1.4점, 어시스트 1.25점.
 * 무실점(클린시트) 경기에 출전한 GK·센터백·윙백은 1.25점, 수미는 0.625점.
 * MVP 선정 횟수는 총점에는 반영하지 않고 별도로 집계한다.
 * historical(과거 스프레드시트 누적 기록)이 있으면 기준치로 더한다.
 */
export function computeRanking(
  members: Member[],
  events: EventItem[],
  records: RecordRow[],
  mvpVotes: MvpVoteRow[] = [],
  historical: HistoricalStats[] = []
): RankingRow[] {
  const eventById = new Map(events.map((e) => [e.id, e]));
  const mvpCounts = computeMvpCounts(mvpVotes);
  const streaks = computeStreaks(events, records);
  const historicalById = new Map(historical.map((h) => [h.memberId, h]));
  const rows = new Map<number, RankingRow>(
    members.map((m) => {
      const h = historicalById.get(m.id);
      return [
        m.id,
        {
          member: m,
          played: h?.games ?? 0,
          goals: h?.goals ?? 0,
          assists: h?.assists ?? 0,
          cleanPts: h?.cleanPts ?? 0,
          mvpCount: mvpCounts.get(m.id) ?? 0,
          total: 0,
          streak: streaks.get(m.id)?.count ?? 0,
          streakType: streaks.get(m.id)?.type ?? null,
        },
      ];
    })
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

  // 소수 가중치(1.5·1.4·1.25·0.625)를 더하다 보면 부동소수점 오차로
  // 24.299999999999997 같은 값이 나올 수 있어 소수 3자리에서 반올림한다.
  const round3 = (n: number) => Math.round(n * 1000) / 1000;

  const out = [...rows.values()];
  for (const row of out) {
    const bonus = historicalById.get(row.member.id)?.bonusPts ?? 0;
    row.cleanPts = round3(row.cleanPts);
    row.total = round3(
      row.played * RULES.participation +
        row.goals * RULES.goal +
        row.assists * RULES.assist +
        row.cleanPts +
        bonus
    );
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

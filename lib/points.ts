import { HISTORICAL_BASELINE_SEASON, seasonOf } from "./season";
import { QUARTER_COUNT, slotPositionFor } from "./squad";
import type {
  EventItem,
  HistoricalStats,
  Member,
  MvpVoteRow,
  PosGroup,
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

// 클린시트를 "쿼터 하나를 지켰으면 1회"로 센다. GK·센터백·윙백은 온전한
// 한 쿼터를 지키면 1회, 수비형 미드필더(수미)는 그 절반인 0.5회 — 0.5는
// 오직 수미일 때만 나온다(하프 분할 슬롯은 별개로 그 지분만큼만 받는다).
// 점수로 바꿀 때는 이 횟수에 쿼터당 단가(RULES.cleanSheetDefence ÷ 쿼터 수)를
// 곱하기만 하면 되므로, 가중치 적용 지점을 한 곳(computeRanking)으로 모은다.
function cleanSheetUnitFor(pos: PosGroup): number {
  if (pos === "GK" || pos === "CB" || pos === "WB") return 1;
  if (pos === "DM") return 0.5;
  return 0;
}

/**
 * 클린시트는 경기 전체가 아니라 "그 쿼터에 실제로 뛰었는지"를 기준으로 준다.
 * 스쿼드(쿼터별 출전 명단)와 쿼터별 기록(recordLog의 쿼터별 실점)이 모두 있는
 * 경기에 한해, 무실점인 쿼터에 뛴 GK·센터백·윙백에게 1회, 수미에게 0.5회를
 * 쿼터마다 준다. 하프 분할 슬롯은 그 절반만 받는다. 점수 단가는 곱하지 않고
 * 횟수만 반환한다 — computeRanking이 이 횟수를 cleanCount로 그대로 보여주고,
 * cleanPts(점수) 계산 시에만 단가를 곱한다.
 * 스쿼드나 쿼터 기록이 없는 경기(과거 기록 일괄 입력 등)는 이 계산에서
 * 제외되고, computeRanking이 경기 전체 무실점 여부로 대신 처리한다.
 */
export function computeQuarterCleanUnits(
  events: EventItem[],
  members: Member[]
): Map<number, number> {
  const memberById = new Map(members.map((m) => [m.id, m]));
  const result = new Map<number, number>();

  for (const ev of events) {
    if (!ev.squad || !ev.recordLog) continue;
    for (let i = 0; i < ev.squad.quarters.length; i++) {
      const log = ev.recordLog[i];
      if (!log || log.conceded !== 0) continue;
      for (const slot of ev.squad.quarters[i].starters) {
        const isSplit = slot.memberId2 !== undefined && slot.memberId2 !== null;
        const shares: { memberId: number; weight: number }[] = isSplit
          ? [
              ...(slot.memberId != null ? [{ memberId: slot.memberId, weight: 0.5 }] : []),
              { memberId: slot.memberId2 as number, weight: 0.5 },
            ]
          : slot.memberId != null
            ? [{ memberId: slot.memberId, weight: 1 }]
            : [];
        for (const { memberId, weight } of shares) {
          const member = memberById.get(memberId);
          if (!member) continue;
          const pos = slotPositionFor(slot.slotId, member);
          if (!pos) continue;
          const unit = cleanSheetUnitFor(pos);
          if (unit === 0) continue;
          const add = unit * weight;
          result.set(memberId, (result.get(memberId) ?? 0) + add);
        }
      }
    }
  }
  return result;
}

/**
 * 점수 규칙: 출전 1.5점, 골 1.4점, 어시스트 1.25점.
 * 무실점(클린시트) 경기에 출전한 GK·센터백·윙백은 1.25점, 수미는 0.625점.
 * MVP 선정 횟수는 총점에는 반영하지 않고 별도로 집계한다.
 * historical(과거 스프레드시트 누적 기록)이 있으면 기준치로 더한다 —
 * 이 기록은 전부 HISTORICAL_BASELINE_SEASON(2026) 시즌 안에 열린 경기라
 * "전체"(season=null)뿐 아니라 그 시즌을 볼 때도 함께 더하고, 그 외
 * 시즌에서는 제외한다.
 * season을 지정하면 그 시즌(매년 12월 15일~다음해 12월 14일)의 경기·
 * 기록만으로 계산하고, null(기본값)이면 역대 전체를 합산한다.
 */
export function computeRanking(
  members: Member[],
  events: EventItem[],
  records: RecordRow[],
  mvpVotes: MvpVoteRow[] = [],
  historical: HistoricalStats[] = [],
  season: number | null = null
): RankingRow[] {
  const scopedEvents =
    season == null ? events : events.filter((e) => seasonOf(e.date) === season);
  const scopedEventIds = new Set(scopedEvents.map((e) => e.id));
  const scopedRecords = records.filter((r) => scopedEventIds.has(r.eventId));
  const scopedMvpVotes = mvpVotes.filter((v) => scopedEventIds.has(v.eventId));

  const eventById = new Map(scopedEvents.map((e) => [e.id, e]));
  const mvpCounts = computeMvpCounts(scopedMvpVotes);
  const streaks = computeStreaks(scopedEvents, scopedRecords);
  const historicalById =
    season == null || season === HISTORICAL_BASELINE_SEASON
      ? new Map(historical.map((h) => [h.memberId, h]))
      : new Map();
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
          // 앱 도입 이전 스프레드시트 누적치(h?.cleanPts)는 이미 점수로만
          // 남아있어 유닛으로 되돌릴 수 없으므로 cleanPts의 시작값으로만
          // 반영하고, cleanCount(화면 표시용)는 앱에서 추적한 경기부터 센다.
          cleanCount: 0,
          cleanPts: h?.cleanPts ?? 0,
          mvpCount: mvpCounts.get(m.id) ?? 0,
          total: 0,
          streak: streaks.get(m.id)?.count ?? 0,
          streakType: streaks.get(m.id)?.type ?? null,
        },
      ];
    })
  );

  for (const r of scopedRecords) {
    const row = rows.get(r.memberId);
    if (!row) continue;
    const ev = eventById.get(r.eventId);
    if (r.played) row.played += 1;
    row.goals += r.goals;
    row.assists += r.assists;
    // 스쿼드+쿼터별 기록이 있는 경기는 아래 computeQuarterCleanUnits가 쿼터
    // 단위로 따로 계산하므로, 그 데이터가 없는 경기(과거 기록 일괄 입력 등)에
    // 한해서만 경기 전체 무실점 여부로 클린시트 횟수를 매긴다 — 경기 전체
    // 무실점이면 4쿼터 전부 지킨 것과 같으므로 QUARTER_COUNT만큼 준다.
    if (r.played && ev && !(ev.squad && ev.recordLog) && ev.conceded === 0) {
      if (r.position === "GK" || r.position === "CB" || r.position === "WB")
        row.cleanCount += QUARTER_COUNT;
      else if (r.position === "DM") row.cleanCount += QUARTER_COUNT / 2;
    }
  }

  for (const [memberId, units] of computeQuarterCleanUnits(scopedEvents, members)) {
    const row = rows.get(memberId);
    if (row) row.cleanCount += units;
  }

  // 소수 가중치(1.5·1.4·1.25·0.625)를 더하다 보면 부동소수점 오차로
  // 24.299999999999997 같은 값이 나올 수 있어 소수 3자리에서 반올림한다.
  const round3 = (n: number) => Math.round(n * 1000) / 1000;

  const out = [...rows.values()];
  for (const row of out) {
    const bonus = historicalById.get(row.member.id)?.bonusPts ?? 0;
    row.cleanCount = round3(row.cleanCount);
    // 가중치는 여기서만 적용한다: 쿼터당 단가(1쿼터=RULES.cleanSheetDefence÷
    // 쿼터 수) × 지킨 횟수. 온 경기(4쿼터)를 지키면 결국 1.25점(수미는
    // 0.625점)으로, 예전 "경기당" 점수 체계와 총점은 동일하게 맞춰진다.
    row.cleanPts = round3(
      row.cleanPts + row.cleanCount * (RULES.cleanSheetDefence / QUARTER_COUNT)
    );
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

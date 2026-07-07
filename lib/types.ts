export type PosGroup = "GK" | "CB" | "WB" | "DM" | "AM" | "WG" | "ST";

export const POS_GROUPS: PosGroup[] = ["GK", "CB", "WB", "DM", "AM", "WG", "ST"];

export const POS_LABELS: Record<PosGroup, string> = {
  GK: "골키퍼",
  CB: "센터백",
  WB: "윙백",
  DM: "수비형 미드필더",
  AM: "공격형 미드필더",
  WG: "윙어",
  ST: "스트라이커",
};

export const POS_SHORT: Record<PosGroup, string> = {
  GK: "GK",
  CB: "CB",
  WB: "WB",
  DM: "DM",
  AM: "AM",
  WG: "WG",
  ST: "ST",
};

export type PosCategory = "ATT" | "MID" | "DEF";

export const POS_CATEGORY: Record<PosGroup, PosCategory> = {
  GK: "DEF",
  CB: "DEF",
  WB: "DEF",
  DM: "MID",
  AM: "MID",
  WG: "ATT",
  ST: "ATT",
};

export const POS_CATEGORY_LABELS: Record<PosCategory, string> = {
  ATT: "공격",
  MID: "미드필더",
  DEF: "수비",
};

export interface Member {
  id: number;
  name: string;
  backNo: number | null;
  pos1: PosGroup;
  pos2: PosGroup;
  isGuest: boolean;
}

export type UserRole = "admin" | "player";
export type UserStatus = "pending" | "approved" | "rejected";

export interface AppUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  memberId: number | null;
  createdAt: string;
}

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  memberId: number | null;
}

export type VoteStatus = "attend" | "maybe" | "absent";

export interface SquadSlotAssign {
  slotId: string;
  memberId: number | null;
  // 하프 분할: 있으면 전반=memberId, 후반=memberId2 로 한 슬롯을 반씩 나눠 뛴다.
  memberId2?: number | null;
}

export interface QuarterSquad {
  starters: SquadSlotAssign[];
  bench: number[];
}

export interface SquadData {
  quarters: QuarterSquad[]; // 1~4쿼터, 각각 독립된 스쿼드
  generatedAt: string;
}

export interface EventItem {
  id: number;
  title: string;
  type: "match" | "social";
  date: string;
  time: string;
  location: string;
  opponent: string;
  scored: number | null;
  conceded: number | null;
  squad: SquadData | null;
  notes: string;
  dutyOffense: string;
  dutyDefense: string;
  waterDuty: string;
  iceboxDuty: string;
}

export interface VoteRow {
  eventId: number;
  memberId: number;
  status: VoteStatus;
}

export interface CommentRow {
  id: number;
  eventId: number;
  memberId: number;
  body: string;
  createdAt: string;
}

export interface RecordRow {
  eventId: number;
  memberId: number;
  played: number;
  goals: number;
  assists: number;
  position: PosGroup | "";
}

export interface MvpVoteRow {
  eventId: number;
  voterId: number;
  voteeId: number;
}

export interface RankingRow {
  member: Member;
  played: number;
  goals: number;
  assists: number;
  cleanPts: number;
  mvpCount: number;
  total: number;
  streak: number; // 3경기 이상일 때만 값이 채워짐(그 미만이면 0) — 연속 골 또는 연속 어시
  streakType: "goal" | "assist" | null;
}

// 앱 도입 이전(스프레드시트로 관리하던 시절) 누적 기록. 랭킹 계산 시 기준치로 더해진다.
export interface HistoricalStats {
  memberId: number;
  games: number;
  goals: number;
  assists: number;
  cleanPts: number;
  bonusPts: number; // 스프레드시트의 수동 가산점 (예: 이현재 +1)
}

export interface AnnouncementRow {
  id: number;
  title: string;
  body: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

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

export interface Member {
  id: number;
  name: string;
  backNo: number | null;
  pos1: PosGroup;
  pos2: PosGroup;
  isGuest: boolean;
}

export type VoteStatus = "attend" | "maybe" | "absent";

export interface SquadSlotAssign {
  slotId: string;
  memberId: number | null;
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
}

export interface VoteRow {
  eventId: number;
  memberId: number;
  status: VoteStatus;
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
}

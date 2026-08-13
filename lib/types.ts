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
  // 벌금 문자 발송 등에 쓰는 연락처. 없으면 null(발송 대상에서 자동 제외).
  phone: string | null;
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
  // 회원가입 때 본인이 입력한 값 — 운영진이 "새 멤버로 추가"로 승인할 때
  // 미리 채워주는 용도로만 쓰고, 승인 후(Member 생성 후)에는 의미가 없다.
  draftPos1: PosGroup | null;
  draftPos2: PosGroup | null;
  draftBackNo: number | null;
  draftPhone: string | null;
}

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  role: UserRole;
  memberId: number | null;
}

// 아이디/비밀번호 찾기용 휴대폰 SMS 인증번호.
export type VerificationPurpose = "find_id" | "reset_password";

export interface PhoneVerificationRow {
  id: number;
  phone: string;
  purpose: VerificationPurpose;
  code: string;
  attempts: number;
  consumed: boolean;
  expiresAt: string;
  createdAt: string;
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
  // 예전 방식(운영진 1명이 누르면 즉시 확정)의 흔적 — 새로 생기는 스쿼드는
  // 더 이상 이 필드를 쓰지 않고 approvedBy 기반으로 확정 여부를 계산하지만,
  // 이미 이 값으로 확정된 과거 데이터는 계속 확정 상태로 유지하기 위해 남겨둔다.
  confirmed?: boolean;
  // 이 스쿼드를 승인한 운영진들의 memberId. SQUAD_APPROVAL_THRESHOLD(3)명
  // 이상 모이면 자동으로 확정(잠금)된다 — 깃헙 PR 승인과 비슷한 방식.
  // 스쿼드 구성이 바뀌면(재생성·슬롯 수정 등) 다시 비워져서 재승인이 필요하다.
  approvedBy?: number[];
}

export interface QuarterGoalEntry {
  scorerId: number | null;
  assistId: number | null;
}

// 쿼터별 경기 기록 입력 원본(스코어 + 골/어시 로그). 저장 시 이 로그를 합산해서
// records 테이블(선수별 누적 골·어시)과 event.scored/conceded를 채운다.
export interface QuarterRecordEntry {
  scored: number | null;
  conceded: number | null;
  goals: QuarterGoalEntry[];
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
  // 내전(자체 2팀 스크리미지)일 때 B팀 스쿼드. null이면 평소처럼 squad
  // 하나만 쓰는 단일 팀 모드다.
  scrimmageSquad: SquadData | null;
  notes: string;
  // 경기 준비물/역할 비고 4칸: 공가방1·공가방2·물/음료·아이스박스 담당자.
  // 홈 화면 카드에서 평소엔 읽기 전용으로 보이고 "수정"을 누르면 편집,
  // "확인"을 누르면 저장 후 다시 읽기 전용으로 돌아간다.
  dutyOffense: string;
  dutyDefense: string;
  waterDuty: string;
  iceboxDuty: string;
  // 쿼터별 기록 입력 화면의 원본 로그(스코어+골/어시). 없으면 아직 입력 전.
  recordLog: QuarterRecordEntry[] | null;
  // 경기 종료(시작 시각 + MATCH_DURATION_HOURS) 시점 비품 담당자 입력 알림을
  // 이미 보냈는지. 크론이 매 실행마다 같은 경기에 중복 발송하지 않게 막는다.
  equipmentReminderSent: boolean;
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
  // 클린시트 기여 횟수(유닛). GK·센터백·윙백은 1유닛, 수비형 미드필더는
  // 0.5유닛 — 화면에는 이 값을 그대로 보여주고, 점수 계산에서만 cleanPts로
  // 환산한다(앱 도입 이전 스프레드시트 누적치는 유닛을 알 수 없어 미포함).
  cleanCount: number;
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

// "coach_feedback"은 게시판 안의 별도 하위 페이지(코치 피드백)에 실리는
// 글이고, feedbackDate는 그 피드백이 해당하는 날짜(작성일이 아니라 훈련/
// 경기가 있었던 날짜)로 그 하위 페이지에서 날짜별로 묶어서 보여줄 때 쓴다.
// "notice"(일반 공지)에서는 항상 null.
export type AnnouncementCategory = "notice" | "coach_feedback";

export interface AnnouncementRow {
  id: number;
  title: string;
  body: string;
  authorName: string;
  category: AnnouncementCategory;
  feedbackDate: string | null;
  createdAt: string;
  updatedAt: string;
}

// 명예의 전당: 연도별 주장·부주장·총무와 그 해 득점왕·어시왕·클린시트 1등·종합 1위.
// 연도당 한 행만 있고(연도 UNIQUE), 값은 전부 멤버 참조(없으면 null).
export interface HallOfFameRow {
  id: number;
  year: number;
  captainId: number | null;
  viceCaptainId: number | null;
  managerId: number | null;
  topScorerId: number | null;
  topAssistId: number | null;
  cleanSheetFirstId: number | null;
  overallFirstId: number | null;
}

// 이벤트 투표(월드컵 우승팀 예측 등 자유 주제 투표). 로그인한 회원이면
// 누구나 만들 수 있고, 보기는 복수 선택이 가능하며 결과는 항상 실시간 공개된다.
export interface Poll {
  id: number;
  title: string;
  createdBy: number; // memberId
  createdAt: string;
  closed: boolean;
  multiSelect: boolean; // 생성 시 고정, 이후 수정 불가
}

export interface PollOption {
  id: number;
  pollId: number;
  label: string;
  order: number;
}

export interface PollVoteRow {
  pollId: number;
  memberId: number;
  optionId: number;
}

export interface PollDetail extends Poll {
  creatorName: string;
  options: PollOption[];
  voteCounts: Record<number, number>;
  optionVoters: Record<number, string[]>;
  voterCount: number;
  myOptionIds: number[];
}

// 전술 시뮬레이터 — 텍스트로 설명한 상황을 맥미니 로컬 LLM이 전술판
// 애니메이션 장면(TacticsScene)으로 만든다. 생성이 오래 걸릴 수 있어
// (최대 1~2분) 요청-응답 한 번에 묶지 않고 작업(job)을 만들어두고
// 클라이언트가 폴링해서 결과를 가져가는 방식을 쓴다.
export interface TacticsPlayer {
  id: string;
  team: "A" | "B";
  label: string;
}

// "steal"은 상대에게서 공을 뺏는(인터셉트·태클) 동작 — 화면에서 패스와
// 시각적으로 구분해서(빨간 실선 vs 노란 점선) "공을 뺏었다"는 걸 텍스트
// note에만 의존하지 않고 그림으로도 바로 알아볼 수 있게 한다.
export type TacticsArrowKind = "pass" | "steal";

export interface TacticsArrow {
  from: string;
  to: { x: number; y: number };
  kind: TacticsArrowKind;
}

export interface TacticsStep {
  note: string;
  positions: Record<string, { x: number; y: number }>;
  arrows: TacticsArrow[];
}

export interface TacticsScene {
  title: string;
  players: TacticsPlayer[];
  hasBall: boolean;
  steps: TacticsStep[];
}

export type TacticsJobStatus = "pending" | "done" | "error" | "cancelled";

export interface TacticsJobRow {
  id: number;
  userId: number;
  description: string;
  status: TacticsJobStatus;
  result: TacticsScene | null;
  error: string | null;
  // 로컬 모델이 실제로 뱉은 원문(성공/실패 관계없이 저장) — 결과물이
  // 이상할 때 운영진이 무엇이 잘못됐는지 직접 들여다볼 수 있게 한다.
  rawResponse: string | null;
  // 이 작업을 만들 때 OLLAMA_MODEL이 뭐였는지(진행 상황 표시·타이밍 비교용).
  model: string;
  createdAt: string;
}

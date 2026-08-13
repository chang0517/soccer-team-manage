import * as sqlite from "./sqlite";
import * as pg from "./pg";
import type {
  AnnouncementRow,
  AppUser,
  CommentRow,
  EventItem,
  HallOfFameRow,
  HistoricalStats,
  Member,
  MvpVoteRow,
  PhoneVerificationRow,
  Poll,
  PollOption,
  PollVoteRow,
  PosGroup,
  RecordRow,
  TacticsJobRow,
  TacticsScene,
  UserRole,
  UserStatus,
  VerificationPurpose,
  VoteRow,
  VoteStatus,
} from "./types";

// DATABASE_URL이 있으면 Postgres(Supabase), 없으면 로컬 SQLite를 쓴다.
const usePg = !!process.env.DATABASE_URL;

export async function listMembers(): Promise<Member[]> {
  return usePg ? pg.listMembers() : sqlite.listMembers();
}
export async function createMember(m: Omit<Member, "id">): Promise<Member> {
  return usePg ? pg.createMember(m) : sqlite.createMember(m);
}
export async function updateMember(id: number, m: Omit<Member, "id">) {
  return usePg ? pg.updateMember(id, m) : sqlite.updateMember(id, m);
}
export async function deleteMember(id: number) {
  return usePg ? pg.deleteMember(id) : sqlite.deleteMember(id);
}

export async function listEvents(): Promise<EventItem[]> {
  return usePg ? pg.listEvents() : sqlite.listEvents();
}
export async function getEvent(id: number): Promise<EventItem | null> {
  return usePg ? pg.getEvent(id) : sqlite.getEvent(id);
}
export async function createEvent(
  e: Omit<
    EventItem,
    "id" | "squad" | "scrimmageSquad" | "scored" | "conceded" | "equipmentReminderSent"
  >
): Promise<EventItem> {
  return usePg ? pg.createEvent(e) : sqlite.createEvent(e);
}
export async function updateEvent(id: number, patch: Partial<EventItem>) {
  return usePg ? pg.updateEvent(id, patch) : sqlite.updateEvent(id, patch);
}
export async function deleteEvent(id: number) {
  return usePg ? pg.deleteEvent(id) : sqlite.deleteEvent(id);
}

export async function getVotes(eventId: number): Promise<VoteRow[]> {
  return usePg ? pg.getVotes(eventId) : sqlite.getVotes(eventId);
}
export async function getVotesForEvents(eventIds: number[]): Promise<VoteRow[]> {
  return usePg
    ? pg.getVotesForEvents(eventIds)
    : sqlite.getVotesForEvents(eventIds);
}
export async function setVote(
  eventId: number,
  memberId: number,
  status: VoteStatus
) {
  return usePg
    ? pg.setVote(eventId, memberId, status)
    : sqlite.setVote(eventId, memberId, status);
}

export async function getRecords(eventId: number): Promise<RecordRow[]> {
  return usePg ? pg.getRecords(eventId) : sqlite.getRecords(eventId);
}
export async function saveRecords(eventId: number, records: RecordRow[]) {
  return usePg
    ? pg.saveRecords(eventId, records)
    : sqlite.saveRecords(eventId, records);
}
export async function getAllRecords(): Promise<RecordRow[]> {
  return usePg ? pg.getAllRecords() : sqlite.getAllRecords();
}

export async function getMvpVotes(eventId: number): Promise<MvpVoteRow[]> {
  return usePg ? pg.getMvpVotes(eventId) : sqlite.getMvpVotes(eventId);
}
export async function setMvpVote(eventId: number, voterId: number, voteeId: number) {
  return usePg
    ? pg.setMvpVote(eventId, voterId, voteeId)
    : sqlite.setMvpVote(eventId, voterId, voteeId);
}
export async function getAllMvpVotes(): Promise<MvpVoteRow[]> {
  return usePg ? pg.getAllMvpVotes() : sqlite.getAllMvpVotes();
}

export async function countUsers(): Promise<number> {
  return usePg ? pg.countUsers() : sqlite.countUsers();
}
export async function countUsersByDisplayName(displayName: string): Promise<number> {
  return usePg
    ? pg.countUsersByDisplayName(displayName)
    : sqlite.countUsersByDisplayName(displayName);
}
export async function getUserByUsername(
  username: string
): Promise<(AppUser & { passwordHash: string }) | null> {
  return usePg ? pg.getUserByUsername(username) : sqlite.getUserByUsername(username);
}
export async function getUserById(id: number): Promise<AppUser | null> {
  return usePg ? pg.getUserById(id) : sqlite.getUserById(id);
}
export async function listUsersByStatus(status: UserStatus): Promise<AppUser[]> {
  return usePg ? pg.listUsersByStatus(status) : sqlite.listUsersByStatus(status);
}
export async function getUsersByMemberId(memberId: number): Promise<AppUser[]> {
  return usePg ? pg.getUsersByMemberId(memberId) : sqlite.getUsersByMemberId(memberId);
}
export async function createUser(u: {
  username: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  memberId: number | null;
  draftPos1?: PosGroup | null;
  draftPos2?: PosGroup | null;
  draftBackNo?: number | null;
  draftPhone?: string | null;
}): Promise<AppUser> {
  return usePg ? pg.createUser(u) : sqlite.createUser(u);
}
export async function updateUserStatus(
  id: number,
  status: UserStatus,
  memberId: number | null,
  role?: UserRole
) {
  return usePg
    ? pg.updateUserStatus(id, status, memberId, role)
    : sqlite.updateUserStatus(id, status, memberId, role);
}
export async function updateUserPassword(id: number, passwordHash: string) {
  return usePg
    ? pg.updateUserPassword(id, passwordHash)
    : sqlite.updateUserPassword(id, passwordHash);
}

export async function createPhoneVerification(v: {
  phone: string;
  purpose: VerificationPurpose;
  code: string;
  expiresAt: string;
}): Promise<PhoneVerificationRow> {
  return usePg ? pg.createPhoneVerification(v) : sqlite.createPhoneVerification(v);
}
export async function getLatestPhoneVerification(
  phone: string,
  purpose: VerificationPurpose
): Promise<PhoneVerificationRow | null> {
  return usePg
    ? pg.getLatestPhoneVerification(phone, purpose)
    : sqlite.getLatestPhoneVerification(phone, purpose);
}
export async function incrementPhoneVerificationAttempts(id: number) {
  return usePg
    ? pg.incrementPhoneVerificationAttempts(id)
    : sqlite.incrementPhoneVerificationAttempts(id);
}
export async function consumePhoneVerification(id: number) {
  return usePg
    ? pg.consumePhoneVerification(id)
    : sqlite.consumePhoneVerification(id);
}

export async function createTacticsJob(
  userId: number,
  description: string,
  model: string
): Promise<TacticsJobRow> {
  return usePg
    ? pg.createTacticsJob(userId, description, model)
    : sqlite.createTacticsJob(userId, description, model);
}
export async function getTacticsJob(id: number): Promise<TacticsJobRow | null> {
  return usePg ? pg.getTacticsJob(id) : sqlite.getTacticsJob(id);
}
export async function completeTacticsJob(
  id: number,
  result: TacticsScene,
  rawResponse: string | null
) {
  return usePg
    ? pg.completeTacticsJob(id, result, rawResponse)
    : sqlite.completeTacticsJob(id, result, rawResponse);
}
export async function failTacticsJob(id: number, error: string, rawResponse: string | null) {
  return usePg
    ? pg.failTacticsJob(id, error, rawResponse)
    : sqlite.failTacticsJob(id, error, rawResponse);
}
export async function cancelTacticsJob(id: number) {
  return usePg ? pg.cancelTacticsJob(id) : sqlite.cancelTacticsJob(id);
}

export async function getComments(eventId: number): Promise<CommentRow[]> {
  return usePg ? pg.getComments(eventId) : sqlite.getComments(eventId);
}
export async function addComment(
  eventId: number,
  memberId: number,
  body: string
): Promise<CommentRow> {
  return usePg
    ? pg.addComment(eventId, memberId, body)
    : sqlite.addComment(eventId, memberId, body);
}
export async function getComment(id: number): Promise<CommentRow | null> {
  return usePg ? pg.getComment(id) : sqlite.getComment(id);
}
export async function deleteComment(id: number) {
  return usePg ? pg.deleteComment(id) : sqlite.deleteComment(id);
}

export async function getAllHistoricalStats(): Promise<HistoricalStats[]> {
  return usePg ? pg.getAllHistoricalStats() : sqlite.getAllHistoricalStats();
}
export async function upsertHistoricalStats(stats: HistoricalStats) {
  return usePg
    ? pg.upsertHistoricalStats(stats)
    : sqlite.upsertHistoricalStats(stats);
}
export async function deleteHistoricalStats(memberId: number) {
  return usePg
    ? pg.deleteHistoricalStats(memberId)
    : sqlite.deleteHistoricalStats(memberId);
}

export async function listAnnouncements(): Promise<AnnouncementRow[]> {
  return usePg ? pg.listAnnouncements() : sqlite.listAnnouncements();
}
export async function getAnnouncement(id: number): Promise<AnnouncementRow | null> {
  return usePg ? pg.getAnnouncement(id) : sqlite.getAnnouncement(id);
}
export async function createAnnouncement(
  a: Omit<AnnouncementRow, "id" | "createdAt" | "updatedAt">
): Promise<AnnouncementRow> {
  return usePg ? pg.createAnnouncement(a) : sqlite.createAnnouncement(a);
}
export async function updateAnnouncement(
  id: number,
  patch: { title: string; body: string; feedbackDate?: string | null }
) {
  return usePg
    ? pg.updateAnnouncement(id, patch)
    : sqlite.updateAnnouncement(id, patch);
}
export async function deleteAnnouncement(id: number) {
  return usePg ? pg.deleteAnnouncement(id) : sqlite.deleteAnnouncement(id);
}

export async function listHallOfFame(): Promise<HallOfFameRow[]> {
  return usePg ? pg.listHallOfFame() : sqlite.listHallOfFame();
}
export async function upsertHallOfFame(
  entry: Omit<HallOfFameRow, "id">
): Promise<HallOfFameRow> {
  return usePg ? pg.upsertHallOfFame(entry) : sqlite.upsertHallOfFame(entry);
}
export async function deleteHallOfFame(id: number) {
  return usePg ? pg.deleteHallOfFame(id) : sqlite.deleteHallOfFame(id);
}

export async function savePushSubscription(sub: {
  endpoint: string;
  p256dh: string;
  auth: string;
  memberId: number | null;
}) {
  return usePg ? pg.savePushSubscription(sub) : sqlite.savePushSubscription(sub);
}
export async function getAllPushSubscriptions() {
  return usePg ? pg.getAllPushSubscriptions() : sqlite.getAllPushSubscriptions();
}
export async function deletePushSubscription(endpoint: string) {
  return usePg ? pg.deletePushSubscription(endpoint) : sqlite.deletePushSubscription(endpoint);
}

export async function listPolls(): Promise<Poll[]> {
  return usePg ? pg.listPolls() : sqlite.listPolls();
}
export async function getPoll(id: number): Promise<Poll | null> {
  return usePg ? pg.getPoll(id) : sqlite.getPoll(id);
}
export async function getAllPollOptions(): Promise<PollOption[]> {
  return usePg ? pg.getAllPollOptions() : sqlite.getAllPollOptions();
}
export async function createPoll(
  title: string,
  options: string[],
  createdBy: number,
  multiSelect: boolean
): Promise<Poll> {
  return usePg
    ? pg.createPoll(title, options, createdBy, multiSelect)
    : sqlite.createPoll(title, options, createdBy, multiSelect);
}
export async function setPollClosed(id: number, closed: boolean) {
  return usePg ? pg.setPollClosed(id, closed) : sqlite.setPollClosed(id, closed);
}
export async function addPollOption(
  pollId: number,
  label: string
): Promise<PollOption> {
  return usePg
    ? pg.addPollOption(pollId, label)
    : sqlite.addPollOption(pollId, label);
}
export async function deletePoll(id: number) {
  return usePg ? pg.deletePoll(id) : sqlite.deletePoll(id);
}
export async function getAllPollVotes(): Promise<PollVoteRow[]> {
  return usePg ? pg.getAllPollVotes() : sqlite.getAllPollVotes();
}
export async function setPollVote(
  pollId: number,
  memberId: number,
  optionIds: number[]
) {
  return usePg
    ? pg.setPollVote(pollId, memberId, optionIds)
    : sqlite.setPollVote(pollId, memberId, optionIds);
}

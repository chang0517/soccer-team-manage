import * as sqlite from "./sqlite";
import * as pg from "./pg";
import type {
  EventItem,
  Member,
  MvpVoteRow,
  RecordRow,
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
  e: Omit<EventItem, "id" | "squad" | "scored" | "conceded">
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

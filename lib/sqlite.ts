import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { ROSTER } from "./roster";
import type {
  EventItem,
  Member,
  PosGroup,
  RecordRow,
  SquadData,
  VoteRow,
  VoteStatus,
} from "./types";

const globalForDb = globalThis as unknown as { ravenDb?: Database.Database };

function createDb(): Database.Database {
  const dir = path.join(process.cwd(), "data");
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "raven.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      back_no INTEGER,
      pos1 TEXT NOT NULL DEFAULT 'CM',
      pos2 TEXT NOT NULL DEFAULT 'DF'
    );
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'match',
      date TEXT NOT NULL,
      time TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      opponent TEXT NOT NULL DEFAULT '',
      scored INTEGER,
      conceded INTEGER,
      squad TEXT,
      notes TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS votes (
      event_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY (event_id, member_id)
    );
    CREATE TABLE IF NOT EXISTS records (
      event_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      played INTEGER NOT NULL DEFAULT 0,
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      position TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (event_id, member_id)
    );
  `);
  seedIfEmpty(db);
  return db;
}

export function getDb(): Database.Database {
  if (!globalForDb.ravenDb) globalForDb.ravenDb = createDb();
  return globalForDb.ravenDb;
}

function seedIfEmpty(db: Database.Database) {
  const count = db.prepare("SELECT COUNT(*) AS c FROM members").get() as {
    c: number;
  };
  if (count.c > 0) return;

  const insM = db.prepare(
    "INSERT INTO members (name, back_no, pos1, pos2) VALUES (?, NULL, ?, ?)"
  );
  for (const [name, p1, p2] of ROSTER) insM.run(name, p1, p2);
}

// ---------- members ----------
type MemberDbRow = {
  id: number;
  name: string;
  back_no: number | null;
  pos1: PosGroup;
  pos2: PosGroup;
};

function toMember(r: MemberDbRow): Member {
  return { id: r.id, name: r.name, backNo: r.back_no, pos1: r.pos1, pos2: r.pos2 };
}

export function listMembers(): Member[] {
  const rows = getDb()
    .prepare("SELECT * FROM members ORDER BY name")
    .all() as MemberDbRow[];
  return rows.map(toMember);
}

export function createMember(m: Omit<Member, "id">): Member {
  const r = getDb()
    .prepare("INSERT INTO members (name, back_no, pos1, pos2) VALUES (?, ?, ?, ?)")
    .run(m.name, m.backNo, m.pos1, m.pos2);
  return { id: Number(r.lastInsertRowid), ...m };
}

export function updateMember(id: number, m: Omit<Member, "id">) {
  getDb()
    .prepare("UPDATE members SET name=?, back_no=?, pos1=?, pos2=? WHERE id=?")
    .run(m.name, m.backNo, m.pos1, m.pos2, id);
}

export function deleteMember(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM members WHERE id=?").run(id);
  db.prepare("DELETE FROM votes WHERE member_id=?").run(id);
  db.prepare("DELETE FROM records WHERE member_id=?").run(id);
}

// ---------- events ----------
type EventDbRow = {
  id: number;
  title: string;
  type: "match" | "social";
  date: string;
  time: string;
  location: string;
  opponent: string;
  scored: number | null;
  conceded: number | null;
  squad: string | null;
  notes: string;
};

function toEvent(r: EventDbRow): EventItem {
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    date: r.date,
    time: r.time,
    location: r.location,
    opponent: r.opponent,
    scored: r.scored,
    conceded: r.conceded,
    squad: r.squad ? (JSON.parse(r.squad) as SquadData) : null,
    notes: r.notes,
  };
}

export function listEvents(): EventItem[] {
  const rows = getDb()
    .prepare("SELECT * FROM events ORDER BY date DESC, time DESC")
    .all() as EventDbRow[];
  return rows.map(toEvent);
}

export function getEvent(id: number): EventItem | null {
  const r = getDb().prepare("SELECT * FROM events WHERE id=?").get(id) as
    | EventDbRow
    | undefined;
  return r ? toEvent(r) : null;
}

export function createEvent(
  e: Omit<EventItem, "id" | "squad" | "scored" | "conceded">
): EventItem {
  const r = getDb()
    .prepare(
      "INSERT INTO events (title, type, date, time, location, opponent, notes) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(e.title, e.type, e.date, e.time, e.location, e.opponent, e.notes);
  return getEvent(Number(r.lastInsertRowid))!;
}

export function updateEvent(id: number, patch: Partial<EventItem>) {
  const cur = getEvent(id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  getDb()
    .prepare(
      "UPDATE events SET title=?, type=?, date=?, time=?, location=?, opponent=?, scored=?, conceded=?, squad=?, notes=? WHERE id=?"
    )
    .run(
      next.title,
      next.type,
      next.date,
      next.time,
      next.location,
      next.opponent,
      next.scored,
      next.conceded,
      next.squad ? JSON.stringify(next.squad) : null,
      next.notes,
      id
    );
}

export function deleteEvent(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM events WHERE id=?").run(id);
  db.prepare("DELETE FROM votes WHERE event_id=?").run(id);
  db.prepare("DELETE FROM records WHERE event_id=?").run(id);
}

// ---------- votes ----------
export function getVotes(eventId: number): VoteRow[] {
  const rows = getDb()
    .prepare("SELECT event_id, member_id, status FROM votes WHERE event_id=?")
    .all(eventId) as { event_id: number; member_id: number; status: VoteStatus }[];
  return rows.map((r) => ({
    eventId: r.event_id,
    memberId: r.member_id,
    status: r.status,
  }));
}

export function setVote(eventId: number, memberId: number, status: VoteStatus) {
  getDb()
    .prepare(
      "INSERT INTO votes (event_id, member_id, status) VALUES (?, ?, ?) ON CONFLICT(event_id, member_id) DO UPDATE SET status=excluded.status"
    )
    .run(eventId, memberId, status);
}

// ---------- records ----------
export function getRecords(eventId: number): RecordRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM records WHERE event_id=?")
    .all(eventId) as {
    event_id: number;
    member_id: number;
    played: number;
    goals: number;
    assists: number;
    position: PosGroup | "";
  }[];
  return rows.map((r) => ({
    eventId: r.event_id,
    memberId: r.member_id,
    played: r.played,
    goals: r.goals,
    assists: r.assists,
    position: r.position,
  }));
}

export function saveRecords(eventId: number, records: RecordRow[]) {
  const db = getDb();
  const del = db.prepare("DELETE FROM records WHERE event_id=?");
  const ins = db.prepare(
    "INSERT INTO records (event_id, member_id, played, goals, assists, position) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const tx = db.transaction(() => {
    del.run(eventId);
    for (const r of records) {
      if (!r.played && r.goals === 0 && r.assists === 0) continue;
      ins.run(eventId, r.memberId, r.played ? 1 : 0, r.goals, r.assists, r.position);
    }
  });
  tx();
}

export function getAllRecords(): RecordRow[] {
  const rows = getDb().prepare("SELECT * FROM records").all() as {
    event_id: number;
    member_id: number;
    played: number;
    goals: number;
    assists: number;
    position: PosGroup | "";
  }[];
  return rows.map((r) => ({
    eventId: r.event_id,
    memberId: r.member_id,
    played: r.played,
    goals: r.goals,
    assists: r.assists,
    position: r.position,
  }));
}

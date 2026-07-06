import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { ROSTER } from "./roster";
import type {
  AnnouncementRow,
  AppUser,
  CommentRow,
  EventItem,
  HistoricalStats,
  Member,
  MvpVoteRow,
  PosGroup,
  RecordRow,
  SquadData,
  UserRole,
  UserStatus,
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
      pos1 TEXT NOT NULL DEFAULT 'CB',
      pos2 TEXT NOT NULL DEFAULT 'WB',
      is_guest INTEGER NOT NULL DEFAULT 0
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
    CREATE TABLE IF NOT EXISTS mvp_votes (
      event_id INTEGER NOT NULL,
      voter_id INTEGER NOT NULL,
      votee_id INTEGER NOT NULL,
      PRIMARY KEY (event_id, voter_id)
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player',
      status TEXT NOT NULL DEFAULT 'pending',
      member_id INTEGER,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS historical_stats (
      member_id INTEGER PRIMARY KEY,
      games INTEGER NOT NULL DEFAULT 0,
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      clean_pts REAL NOT NULL DEFAULT 0,
      bonus_pts REAL NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      author_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  const memberCols = db.prepare("PRAGMA table_info(members)").all() as { name: string }[];
  if (!memberCols.some((c) => c.name === "is_guest")) {
    db.exec("ALTER TABLE members ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0");
  }
  const histCols = db.prepare("PRAGMA table_info(historical_stats)").all() as {
    name: string;
  }[];
  if (histCols.length > 0 && !histCols.some((c) => c.name === "bonus_pts")) {
    db.exec("ALTER TABLE historical_stats ADD COLUMN bonus_pts REAL NOT NULL DEFAULT 0");
  }
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
    "INSERT INTO members (name, back_no, pos1, pos2, is_guest) VALUES (?, NULL, ?, ?, 0)"
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
  is_guest: number;
};

function toMember(r: MemberDbRow): Member {
  return {
    id: r.id,
    name: r.name,
    backNo: r.back_no,
    pos1: r.pos1,
    pos2: r.pos2,
    isGuest: !!r.is_guest,
  };
}

export function listMembers(): Member[] {
  const rows = getDb()
    .prepare("SELECT * FROM members ORDER BY name")
    .all() as MemberDbRow[];
  return rows.map(toMember);
}

export function createMember(m: Omit<Member, "id">): Member {
  const r = getDb()
    .prepare(
      "INSERT INTO members (name, back_no, pos1, pos2, is_guest) VALUES (?, ?, ?, ?, ?)"
    )
    .run(m.name, m.backNo, m.pos1, m.pos2, m.isGuest ? 1 : 0);
  return { id: Number(r.lastInsertRowid), ...m };
}

export function updateMember(id: number, m: Omit<Member, "id">) {
  getDb()
    .prepare(
      "UPDATE members SET name=?, back_no=?, pos1=?, pos2=?, is_guest=? WHERE id=?"
    )
    .run(m.name, m.backNo, m.pos1, m.pos2, m.isGuest ? 1 : 0, id);
}

export function deleteMember(id: number) {
  const db = getDb();
  db.prepare("DELETE FROM members WHERE id=?").run(id);
  db.prepare("DELETE FROM votes WHERE member_id=?").run(id);
  db.prepare("DELETE FROM records WHERE member_id=?").run(id);
  db.prepare("DELETE FROM mvp_votes WHERE voter_id=? OR votee_id=?").run(id, id);
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
  db.prepare("DELETE FROM mvp_votes WHERE event_id=?").run(id);
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

// ---------- mvp votes ----------
type MvpVoteDbRow = { event_id: number; voter_id: number; votee_id: number };

function toMvpVote(r: MvpVoteDbRow): MvpVoteRow {
  return { eventId: r.event_id, voterId: r.voter_id, voteeId: r.votee_id };
}

export function getMvpVotes(eventId: number): MvpVoteRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM mvp_votes WHERE event_id=?")
    .all(eventId) as MvpVoteDbRow[];
  return rows.map(toMvpVote);
}

export function setMvpVote(eventId: number, voterId: number, voteeId: number) {
  getDb()
    .prepare(
      "INSERT INTO mvp_votes (event_id, voter_id, votee_id) VALUES (?, ?, ?) ON CONFLICT(event_id, voter_id) DO UPDATE SET votee_id=excluded.votee_id"
    )
    .run(eventId, voterId, voteeId);
}

export function getAllMvpVotes(): MvpVoteRow[] {
  const rows = getDb().prepare("SELECT * FROM mvp_votes").all() as MvpVoteDbRow[];
  return rows.map(toMvpVote);
}

// ---------- users ----------
type UserDbRow = {
  id: number;
  username: string;
  password_hash: string;
  display_name: string;
  role: UserRole;
  status: UserStatus;
  member_id: number | null;
  created_at: string;
};

function toUser(r: UserDbRow): AppUser {
  return {
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    status: r.status,
    memberId: r.member_id,
    createdAt: r.created_at,
  };
}

export function countUsers(): number {
  const row = getDb().prepare("SELECT COUNT(*) AS c FROM users").get() as {
    c: number;
  };
  return row.c;
}

export function getUserByUsername(
  username: string
): (AppUser & { passwordHash: string }) | null {
  const r = getDb()
    .prepare("SELECT * FROM users WHERE username=?")
    .get(username) as UserDbRow | undefined;
  return r ? { ...toUser(r), passwordHash: r.password_hash } : null;
}

export function getUserById(id: number): AppUser | null {
  const r = getDb().prepare("SELECT * FROM users WHERE id=?").get(id) as
    | UserDbRow
    | undefined;
  return r ? toUser(r) : null;
}

export function listUsersByStatus(status: UserStatus): AppUser[] {
  const rows = getDb()
    .prepare("SELECT * FROM users WHERE status=? ORDER BY created_at")
    .all(status) as UserDbRow[];
  return rows.map(toUser);
}

export function createUser(u: {
  username: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  memberId: number | null;
}): AppUser {
  const createdAt = new Date().toISOString();
  const r = getDb()
    .prepare(
      "INSERT INTO users (username, password_hash, display_name, role, status, member_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .run(
      u.username,
      u.passwordHash,
      u.displayName,
      u.role,
      u.status,
      u.memberId,
      createdAt
    );
  return getUserById(Number(r.lastInsertRowid))!;
}

export function updateUserStatus(
  id: number,
  status: UserStatus,
  memberId: number | null,
  role?: UserRole
) {
  if (role) {
    getDb()
      .prepare("UPDATE users SET status=?, member_id=?, role=? WHERE id=?")
      .run(status, memberId, role, id);
  } else {
    getDb()
      .prepare("UPDATE users SET status=?, member_id=? WHERE id=?")
      .run(status, memberId, id);
  }
}

// ---------- comments ----------
type CommentDbRow = {
  id: number;
  event_id: number;
  member_id: number;
  body: string;
  created_at: string;
};

function toComment(r: CommentDbRow): CommentRow {
  return {
    id: r.id,
    eventId: r.event_id,
    memberId: r.member_id,
    body: r.body,
    createdAt: r.created_at,
  };
}

export function getComments(eventId: number): CommentRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM comments WHERE event_id=? ORDER BY created_at")
    .all(eventId) as CommentDbRow[];
  return rows.map(toComment);
}

export function addComment(eventId: number, memberId: number, body: string): CommentRow {
  const createdAt = new Date().toISOString();
  const r = getDb()
    .prepare(
      "INSERT INTO comments (event_id, member_id, body, created_at) VALUES (?, ?, ?, ?)"
    )
    .run(eventId, memberId, body, createdAt);
  return {
    id: Number(r.lastInsertRowid),
    eventId,
    memberId,
    body,
    createdAt,
  };
}

// ---------- historical stats (앱 도입 이전 누적 기록) ----------
type HistoricalDbRow = {
  member_id: number;
  games: number;
  goals: number;
  assists: number;
  clean_pts: number;
  bonus_pts: number;
};

function toHistorical(r: HistoricalDbRow): HistoricalStats {
  return {
    memberId: r.member_id,
    games: r.games,
    goals: r.goals,
    assists: r.assists,
    cleanPts: r.clean_pts,
    bonusPts: r.bonus_pts,
  };
}

export function getAllHistoricalStats(): HistoricalStats[] {
  const rows = getDb().prepare("SELECT * FROM historical_stats").all() as HistoricalDbRow[];
  return rows.map(toHistorical);
}

export function upsertHistoricalStats(stats: HistoricalStats) {
  getDb()
    .prepare(
      `INSERT INTO historical_stats (member_id, games, goals, assists, clean_pts, bonus_pts)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(member_id) DO UPDATE SET
         games=excluded.games, goals=excluded.goals,
         assists=excluded.assists, clean_pts=excluded.clean_pts,
         bonus_pts=excluded.bonus_pts`
    )
    .run(
      stats.memberId,
      stats.games,
      stats.goals,
      stats.assists,
      stats.cleanPts,
      stats.bonusPts
    );
}

// ---------- announcements ----------
type AnnouncementDbRow = {
  id: number;
  title: string;
  body: string;
  author_name: string;
  created_at: string;
  updated_at: string;
};

function toAnnouncement(r: AnnouncementDbRow): AnnouncementRow {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    authorName: r.author_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function listAnnouncements(): AnnouncementRow[] {
  const rows = getDb()
    .prepare("SELECT * FROM announcements ORDER BY created_at DESC")
    .all() as AnnouncementDbRow[];
  return rows.map(toAnnouncement);
}

export function getAnnouncement(id: number): AnnouncementRow | null {
  const r = getDb().prepare("SELECT * FROM announcements WHERE id=?").get(id) as
    | AnnouncementDbRow
    | undefined;
  return r ? toAnnouncement(r) : null;
}

export function createAnnouncement(
  a: Omit<AnnouncementRow, "id" | "createdAt" | "updatedAt">
): AnnouncementRow {
  const now = new Date().toISOString();
  const r = getDb()
    .prepare(
      "INSERT INTO announcements (title, body, author_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)"
    )
    .run(a.title, a.body, a.authorName, now, now);
  return getAnnouncement(Number(r.lastInsertRowid))!;
}

export function updateAnnouncement(id: number, patch: { title: string; body: string }) {
  getDb()
    .prepare("UPDATE announcements SET title=?, body=?, updated_at=? WHERE id=?")
    .run(patch.title, patch.body, new Date().toISOString(), id);
}

export function deleteAnnouncement(id: number) {
  getDb().prepare("DELETE FROM announcements WHERE id=?").run(id);
}

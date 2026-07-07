import { Pool } from "pg";
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

const globalForPg = globalThis as unknown as {
  ravenPool?: Pool;
  ravenPgReady?: Promise<void>;
};

function getPool(): Pool {
  if (!globalForPg.ravenPool) {
    const connectionString = process.env.DATABASE_URL!;
    globalForPg.ravenPool = new Pool({
      connectionString,
      max: 5,
      ssl: /supabase|sslmode=require/.test(connectionString)
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return globalForPg.ravenPool;
}

async function init() {
  const pool = getPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      back_no INTEGER,
      pos1 TEXT NOT NULL DEFAULT 'CB',
      pos2 TEXT NOT NULL DEFAULT 'WB',
      is_guest BOOLEAN NOT NULL DEFAULT false
    );
    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'match',
      date TEXT NOT NULL,
      time TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      opponent TEXT NOT NULL DEFAULT '',
      scored INTEGER,
      conceded INTEGER,
      squad JSONB,
      notes TEXT NOT NULL DEFAULT '',
      duty_offense TEXT NOT NULL DEFAULT '',
      duty_defense TEXT NOT NULL DEFAULT '',
      water_duty TEXT NOT NULL DEFAULT '',
      icebox_duty TEXT NOT NULL DEFAULT ''
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
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player',
      status TEXT NOT NULL DEFAULT 'pending',
      member_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS comments (
      id SERIAL PRIMARY KEY,
      event_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS historical_stats (
      member_id INTEGER PRIMARY KEY,
      games INTEGER NOT NULL DEFAULT 0,
      goals INTEGER NOT NULL DEFAULT 0,
      assists INTEGER NOT NULL DEFAULT 0,
      clean_pts DOUBLE PRECISION NOT NULL DEFAULT 0,
      bonus_pts DOUBLE PRECISION NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      author_name TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(
    "ALTER TABLE historical_stats ADD COLUMN IF NOT EXISTS bonus_pts DOUBLE PRECISION NOT NULL DEFAULT 0"
  );
  await pool.query(
    "ALTER TABLE members ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false"
  );
  for (const col of ["duty_offense", "duty_defense", "water_duty", "icebox_duty"]) {
    await pool.query(
      `ALTER TABLE events ADD COLUMN IF NOT EXISTS ${col} TEXT NOT NULL DEFAULT ''`
    );
  }
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM members");
  if (rows[0].c === 0) {
    for (const [name, p1, p2] of ROSTER) {
      await pool.query(
        "INSERT INTO members (name, back_no, pos1, pos2, is_guest) VALUES ($1, NULL, $2, $3, false)",
        [name, p1, p2]
      );
    }
  }
}

async function ready(): Promise<Pool> {
  if (!globalForPg.ravenPgReady) globalForPg.ravenPgReady = init();
  await globalForPg.ravenPgReady;
  return getPool();
}

type MemberDbRow = {
  id: number;
  name: string;
  back_no: number | null;
  pos1: PosGroup;
  pos2: PosGroup;
  is_guest: boolean;
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

export async function listMembers(): Promise<Member[]> {
  const pool = await ready();
  const { rows } = await pool.query("SELECT * FROM members ORDER BY name");
  return (rows as MemberDbRow[]).map(toMember);
}

export async function createMember(m: Omit<Member, "id">): Promise<Member> {
  const pool = await ready();
  const { rows } = await pool.query(
    "INSERT INTO members (name, back_no, pos1, pos2, is_guest) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [m.name, m.backNo, m.pos1, m.pos2, !!m.isGuest]
  );
  return { id: rows[0].id, ...m };
}

export async function updateMember(id: number, m: Omit<Member, "id">) {
  const pool = await ready();
  await pool.query(
    "UPDATE members SET name=$1, back_no=$2, pos1=$3, pos2=$4, is_guest=$5 WHERE id=$6",
    [m.name, m.backNo, m.pos1, m.pos2, !!m.isGuest, id]
  );
}

export async function deleteMember(id: number) {
  const pool = await ready();
  await pool.query("DELETE FROM members WHERE id=$1", [id]);
  await pool.query("DELETE FROM votes WHERE member_id=$1", [id]);
  await pool.query("DELETE FROM records WHERE member_id=$1", [id]);
  await pool.query(
    "DELETE FROM mvp_votes WHERE voter_id=$1 OR votee_id=$1",
    [id]
  );
}

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
  squad: SquadData | null;
  notes: string;
  duty_offense: string;
  duty_defense: string;
  water_duty: string;
  icebox_duty: string;
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
    squad: r.squad,
    notes: r.notes,
    dutyOffense: r.duty_offense,
    dutyDefense: r.duty_defense,
    waterDuty: r.water_duty,
    iceboxDuty: r.icebox_duty,
  };
}

export async function listEvents(): Promise<EventItem[]> {
  const pool = await ready();
  const { rows } = await pool.query(
    "SELECT * FROM events ORDER BY date DESC, time DESC"
  );
  return (rows as EventDbRow[]).map(toEvent);
}

export async function getEvent(id: number): Promise<EventItem | null> {
  const pool = await ready();
  const { rows } = await pool.query("SELECT * FROM events WHERE id=$1", [id]);
  return rows[0] ? toEvent(rows[0] as EventDbRow) : null;
}

export async function createEvent(
  e: Omit<EventItem, "id" | "squad" | "scored" | "conceded">
): Promise<EventItem> {
  const pool = await ready();
  const { rows } = await pool.query(
    "INSERT INTO events (title, type, date, time, location, opponent, notes, duty_offense, duty_defense, water_duty, icebox_duty) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id",
    [
      e.title,
      e.type,
      e.date,
      e.time,
      e.location,
      e.opponent,
      e.notes,
      e.dutyOffense ?? "",
      e.dutyDefense ?? "",
      e.waterDuty ?? "",
      e.iceboxDuty ?? "",
    ]
  );
  return (await getEvent(rows[0].id))!;
}

export async function updateEvent(id: number, patch: Partial<EventItem>) {
  const cur = await getEvent(id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  const pool = await ready();
  await pool.query(
    "UPDATE events SET title=$1, type=$2, date=$3, time=$4, location=$5, opponent=$6, scored=$7, conceded=$8, squad=$9, notes=$10, duty_offense=$11, duty_defense=$12, water_duty=$13, icebox_duty=$14 WHERE id=$15",
    [
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
      next.dutyOffense ?? "",
      next.dutyDefense ?? "",
      next.waterDuty ?? "",
      next.iceboxDuty ?? "",
      id,
    ]
  );
}

export async function deleteEvent(id: number) {
  const pool = await ready();
  await pool.query("DELETE FROM events WHERE id=$1", [id]);
  await pool.query("DELETE FROM votes WHERE event_id=$1", [id]);
  await pool.query("DELETE FROM records WHERE event_id=$1", [id]);
  await pool.query("DELETE FROM mvp_votes WHERE event_id=$1", [id]);
}

export async function getVotes(eventId: number): Promise<VoteRow[]> {
  const pool = await ready();
  const { rows } = await pool.query("SELECT * FROM votes WHERE event_id=$1", [
    eventId,
  ]);
  return rows.map((r) => ({
    eventId: r.event_id,
    memberId: r.member_id,
    status: r.status as VoteStatus,
  }));
}

export async function getVotesForEvents(eventIds: number[]): Promise<VoteRow[]> {
  if (eventIds.length === 0) return [];
  const pool = await ready();
  const { rows } = await pool.query(
    "SELECT * FROM votes WHERE event_id = ANY($1::int[])",
    [eventIds]
  );
  return rows.map((r) => ({
    eventId: r.event_id,
    memberId: r.member_id,
    status: r.status as VoteStatus,
  }));
}

export async function setVote(
  eventId: number,
  memberId: number,
  status: VoteStatus
) {
  const pool = await ready();
  await pool.query(
    "INSERT INTO votes (event_id, member_id, status) VALUES ($1, $2, $3) ON CONFLICT (event_id, member_id) DO UPDATE SET status=EXCLUDED.status",
    [eventId, memberId, status]
  );
}

function toRecord(r: {
  event_id: number;
  member_id: number;
  played: number;
  goals: number;
  assists: number;
  position: PosGroup | "";
}): RecordRow {
  return {
    eventId: r.event_id,
    memberId: r.member_id,
    played: r.played,
    goals: r.goals,
    assists: r.assists,
    position: r.position,
  };
}

export async function getRecords(eventId: number): Promise<RecordRow[]> {
  const pool = await ready();
  const { rows } = await pool.query("SELECT * FROM records WHERE event_id=$1", [
    eventId,
  ]);
  return rows.map(toRecord);
}

export async function saveRecords(eventId: number, records: RecordRow[]) {
  const pool = await ready();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM records WHERE event_id=$1", [eventId]);
    for (const r of records) {
      if (!r.played && r.goals === 0 && r.assists === 0) continue;
      await client.query(
        "INSERT INTO records (event_id, member_id, played, goals, assists, position) VALUES ($1, $2, $3, $4, $5, $6)",
        [eventId, r.memberId, r.played ? 1 : 0, r.goals, r.assists, r.position]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function getAllRecords(): Promise<RecordRow[]> {
  const pool = await ready();
  const { rows } = await pool.query("SELECT * FROM records");
  return rows.map(toRecord);
}

function toMvpVote(r: {
  event_id: number;
  voter_id: number;
  votee_id: number;
}): MvpVoteRow {
  return { eventId: r.event_id, voterId: r.voter_id, voteeId: r.votee_id };
}

export async function getMvpVotes(eventId: number): Promise<MvpVoteRow[]> {
  const pool = await ready();
  const { rows } = await pool.query(
    "SELECT * FROM mvp_votes WHERE event_id=$1",
    [eventId]
  );
  return rows.map(toMvpVote);
}

export async function setMvpVote(
  eventId: number,
  voterId: number,
  voteeId: number
) {
  const pool = await ready();
  await pool.query(
    "INSERT INTO mvp_votes (event_id, voter_id, votee_id) VALUES ($1, $2, $3) ON CONFLICT (event_id, voter_id) DO UPDATE SET votee_id=EXCLUDED.votee_id",
    [eventId, voterId, voteeId]
  );
}

export async function getAllMvpVotes(): Promise<MvpVoteRow[]> {
  const pool = await ready();
  const { rows } = await pool.query("SELECT * FROM mvp_votes");
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

export async function countUsers(): Promise<number> {
  const pool = await ready();
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM users");
  return rows[0].c;
}

export async function countUsersByDisplayName(displayName: string): Promise<number> {
  const pool = await ready();
  const { rows } = await pool.query(
    "SELECT COUNT(*)::int AS c FROM users WHERE display_name=$1",
    [displayName]
  );
  return rows[0].c;
}

export async function getUserByUsername(
  username: string
): Promise<(AppUser & { passwordHash: string }) | null> {
  const pool = await ready();
  const { rows } = await pool.query("SELECT * FROM users WHERE username=$1", [
    username,
  ]);
  const r = rows[0] as UserDbRow | undefined;
  return r ? { ...toUser(r), passwordHash: r.password_hash } : null;
}

export async function getUserById(id: number): Promise<AppUser | null> {
  const pool = await ready();
  const { rows } = await pool.query("SELECT * FROM users WHERE id=$1", [id]);
  return rows[0] ? toUser(rows[0] as UserDbRow) : null;
}

export async function listUsersByStatus(status: UserStatus): Promise<AppUser[]> {
  const pool = await ready();
  const { rows } = await pool.query(
    "SELECT * FROM users WHERE status=$1 ORDER BY created_at",
    [status]
  );
  return (rows as UserDbRow[]).map(toUser);
}

export async function createUser(u: {
  username: string;
  passwordHash: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  memberId: number | null;
}): Promise<AppUser> {
  const pool = await ready();
  const { rows } = await pool.query(
    "INSERT INTO users (username, password_hash, display_name, role, status, member_id) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
    [u.username, u.passwordHash, u.displayName, u.role, u.status, u.memberId]
  );
  return (await getUserById(rows[0].id))!;
}

export async function updateUserStatus(
  id: number,
  status: UserStatus,
  memberId: number | null,
  role?: UserRole
) {
  const pool = await ready();
  if (role) {
    await pool.query(
      "UPDATE users SET status=$1, member_id=$2, role=$3 WHERE id=$4",
      [status, memberId, role, id]
    );
  } else {
    await pool.query("UPDATE users SET status=$1, member_id=$2 WHERE id=$3", [
      status,
      memberId,
      id,
    ]);
  }
}

// ---------- comments ----------
function toComment(r: {
  id: number;
  event_id: number;
  member_id: number;
  body: string;
  created_at: string;
}): CommentRow {
  return {
    id: r.id,
    eventId: r.event_id,
    memberId: r.member_id,
    body: r.body,
    createdAt: r.created_at,
  };
}

export async function getComments(eventId: number): Promise<CommentRow[]> {
  const pool = await ready();
  const { rows } = await pool.query(
    "SELECT * FROM comments WHERE event_id=$1 ORDER BY created_at",
    [eventId]
  );
  return rows.map(toComment);
}

export async function addComment(
  eventId: number,
  memberId: number,
  body: string
): Promise<CommentRow> {
  const pool = await ready();
  const { rows } = await pool.query(
    "INSERT INTO comments (event_id, member_id, body) VALUES ($1, $2, $3) RETURNING *",
    [eventId, memberId, body]
  );
  return toComment(rows[0]);
}

function toHistorical(r: {
  member_id: number;
  games: number;
  goals: number;
  assists: number;
  clean_pts: number;
  bonus_pts: number;
}): HistoricalStats {
  return {
    memberId: r.member_id,
    games: r.games,
    goals: r.goals,
    assists: r.assists,
    cleanPts: r.clean_pts,
    bonusPts: r.bonus_pts,
  };
}

export async function getAllHistoricalStats(): Promise<HistoricalStats[]> {
  const pool = await ready();
  const { rows } = await pool.query("SELECT * FROM historical_stats");
  return rows.map(toHistorical);
}

export async function upsertHistoricalStats(stats: HistoricalStats) {
  const pool = await ready();
  await pool.query(
    `INSERT INTO historical_stats (member_id, games, goals, assists, clean_pts, bonus_pts)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (member_id) DO UPDATE SET
       games=EXCLUDED.games, goals=EXCLUDED.goals,
       assists=EXCLUDED.assists, clean_pts=EXCLUDED.clean_pts,
       bonus_pts=EXCLUDED.bonus_pts`,
    [
      stats.memberId,
      stats.games,
      stats.goals,
      stats.assists,
      stats.cleanPts,
      stats.bonusPts,
    ]
  );
}

function toAnnouncement(r: {
  id: number;
  title: string;
  body: string;
  author_name: string;
  created_at: string;
  updated_at: string;
}): AnnouncementRow {
  return {
    id: r.id,
    title: r.title,
    body: r.body,
    authorName: r.author_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export async function listAnnouncements(): Promise<AnnouncementRow[]> {
  const pool = await ready();
  const { rows } = await pool.query(
    "SELECT * FROM announcements ORDER BY created_at DESC"
  );
  return rows.map(toAnnouncement);
}

export async function getAnnouncement(id: number): Promise<AnnouncementRow | null> {
  const pool = await ready();
  const { rows } = await pool.query("SELECT * FROM announcements WHERE id=$1", [id]);
  return rows[0] ? toAnnouncement(rows[0]) : null;
}

export async function createAnnouncement(
  a: Omit<AnnouncementRow, "id" | "createdAt" | "updatedAt">
): Promise<AnnouncementRow> {
  const pool = await ready();
  const { rows } = await pool.query(
    "INSERT INTO announcements (title, body, author_name) VALUES ($1, $2, $3) RETURNING id",
    [a.title, a.body, a.authorName]
  );
  return (await getAnnouncement(rows[0].id))!;
}

export async function updateAnnouncement(
  id: number,
  patch: { title: string; body: string }
) {
  const pool = await ready();
  await pool.query(
    "UPDATE announcements SET title=$1, body=$2, updated_at=now() WHERE id=$3",
    [patch.title, patch.body, id]
  );
}

export async function deleteAnnouncement(id: number) {
  const pool = await ready();
  await pool.query("DELETE FROM announcements WHERE id=$1", [id]);
}

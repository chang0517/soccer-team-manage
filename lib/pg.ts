import { Pool } from "pg";
import { ROSTER } from "./roster";
import type {
  EventItem,
  Member,
  MvpVoteRow,
  PosGroup,
  RecordRow,
  SquadData,
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
      max: 3,
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
  `);
  await pool.query(
    "ALTER TABLE members ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT false"
  );
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
};

function toEvent(r: EventDbRow): EventItem {
  return { ...r };
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
    "INSERT INTO events (title, type, date, time, location, opponent, notes) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
    [e.title, e.type, e.date, e.time, e.location, e.opponent, e.notes]
  );
  return (await getEvent(rows[0].id))!;
}

export async function updateEvent(id: number, patch: Partial<EventItem>) {
  const cur = await getEvent(id);
  if (!cur) return;
  const next = { ...cur, ...patch };
  const pool = await ready();
  await pool.query(
    "UPDATE events SET title=$1, type=$2, date=$3, time=$4, location=$5, opponent=$6, scored=$7, conceded=$8, squad=$9, notes=$10 WHERE id=$11",
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

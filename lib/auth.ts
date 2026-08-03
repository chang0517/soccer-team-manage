import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { getUserById } from "./db";
import type { SessionUser } from "./types";

const SESSION_COOKIE = "raven_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 180; // 180일

function getSecret(): string {
  return process.env.SESSION_SECRET || "raven-fc-dev-secret-change-me";
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("base64url");
}

export function createSessionToken(user: SessionUser): string {
  const payload = Buffer.from(
    JSON.stringify({ ...user, exp: Date.now() + SESSION_MAX_AGE * 1000 })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function parseSessionToken(token: string | undefined | null): SessionUser | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  if (sign(payload) !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (typeof data.exp !== "number" || data.exp < Date.now()) return null;
    return {
      id: data.id,
      username: data.username,
      displayName: data.displayName,
      role: data.role,
      memberId: data.memberId ?? null,
    };
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies();
  return parseSessionToken(store.get(SESSION_COOKIE)?.value);
}

export async function setSessionCookie(user: SessionUser) {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(user), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * 관리자 전용 API에서 쓰는 가드. 쿠키뿐 아니라 DB의 최신 role/status까지
 * 확인해서, 승인 취소나 강등이 즉시 반영되게 한다.
 */
export async function requireAdmin(): Promise<SessionUser | null> {
  const session = await getSessionUser();
  if (!session) return null;
  const user = await getUserById(session.id);
  if (!user || user.status !== "approved" || user.role !== "admin") return null;
  return session;
}

/**
 * "로그인한 멤버라면 누구나" 허용하는 액션(스쿼드 편집, 댓글 등)에서 쓰는
 * 가드. requireAdmin과 달리 세션 토큰만 확인하고 DB를 다시 조회하지
 * 않는다 — 댓글 작성 체크와 같은 수준.
 */
export async function requireMember(): Promise<SessionUser | null> {
  const session = await getSessionUser();
  if (!session?.memberId) return null;
  return session;
}

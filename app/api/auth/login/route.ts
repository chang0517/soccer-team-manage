import { setSessionCookie, verifyPassword } from "@/lib/auth";
import { getUserByUsername } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json();
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");

  const user = await getUserByUsername(username);
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return Response.json(
      { error: "아이디 또는 비밀번호가 올바르지 않아요." },
      { status: 401 }
    );
  }
  if (user.status === "pending") {
    return Response.json(
      { error: "아직 운영진 승인 대기 중이에요." },
      { status: 403 }
    );
  }
  if (user.status === "rejected") {
    return Response.json({ error: "가입이 거절됐어요." }, { status: 403 });
  }

  await setSessionCookie({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    memberId: user.memberId,
  });
  return Response.json({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    memberId: user.memberId,
  });
}

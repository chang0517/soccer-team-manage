import { hashPassword, setSessionCookie } from "@/lib/auth";
import { countUsers, createUser, getUserByUsername } from "@/lib/db";
import { isWhitelistedAdminName } from "@/lib/roles";

export async function POST(request: Request) {
  const body = await request.json();
  const username = String(body?.username ?? "").trim();
  const password = String(body?.password ?? "");
  const displayName = String(body?.displayName ?? "").trim();

  if (username.length < 3 || password.length < 4 || !displayName) {
    return Response.json(
      { error: "아이디는 3자 이상, 비밀번호는 4자 이상, 이름을 입력해 주세요." },
      { status: 400 }
    );
  }
  if (await getUserByUsername(username)) {
    return Response.json({ error: "이미 사용 중인 아이디예요." }, { status: 409 });
  }

  const isFirstUser = (await countUsers()) === 0;
  const passwordHash = await hashPassword(password);
  const role =
    isFirstUser || isWhitelistedAdminName(displayName) ? "admin" : "player";
  const user = await createUser({
    username,
    passwordHash,
    displayName,
    role,
    status: isFirstUser ? "approved" : "pending",
    memberId: null,
  });

  if (isFirstUser) {
    await setSessionCookie({
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      memberId: user.memberId,
    });
    return Response.json({ autoApproved: true, user });
  }

  return Response.json({ autoApproved: false });
}

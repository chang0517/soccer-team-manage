import { hashPassword, setSessionCookie } from "@/lib/auth";
import {
  countUsers,
  countUsersByDisplayName,
  createUser,
  getUserByUsername,
  listMembers,
} from "@/lib/db";
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
  const isWhitelisted = isWhitelistedAdminName(displayName);
  // 화이트리스트 이름이라도 이미 그 이름으로 가입 신청한 이력이 있으면
  // (동명이인/재신청 등 모호한 상황이므로) 자동 승인하지 않고 운영진 검토를 거친다.
  const isFirstClaimOfWhitelistedName =
    isWhitelisted && (await countUsersByDisplayName(displayName)) === 0;
  const autoApprove = isFirstUser || isFirstClaimOfWhitelistedName;

  let memberId: number | null = null;
  if (autoApprove) {
    const members = await listMembers();
    memberId = members.find((m) => m.name === displayName)?.id ?? null;
  }

  const passwordHash = await hashPassword(password);
  const user = await createUser({
    username,
    passwordHash,
    displayName,
    role: isFirstUser || isWhitelisted ? "admin" : "player",
    status: autoApprove ? "approved" : "pending",
    memberId,
  });

  if (autoApprove) {
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

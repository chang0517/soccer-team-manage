import { getSessionUser } from "@/lib/auth";
import { getUserById } from "@/lib/db";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return Response.json({ user: null });

  // 세션 쿠키는 로그인 시점 정보를 담고 있으니, 승인/역할 변경을 바로
  // 반영하도록 DB에서 최신 상태를 다시 확인한다.
  const user = await getUserById(session.id);
  if (!user || user.status !== "approved") {
    return Response.json({ user: null });
  }
  return Response.json({
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      memberId: user.memberId,
    },
  });
}

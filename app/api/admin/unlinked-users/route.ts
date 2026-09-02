import { requireAdmin } from "@/lib/auth";
import { listUsersByStatus } from "@/lib/db";

// 승인은 됐지만("나중에 연결" 상태로 승인됐거나) 아직 멤버 프로필과 연결
// 안 된 계정 목록. 대기 목록(pending-users)엔 더 이상 안 뜨니, 운영진이
// 나중에라도 연결해줄 수 있게 따로 보여준다.
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "권한이 없어요." }, { status: 403 });
  const approved = await listUsersByStatus("approved");
  return Response.json(approved.filter((u) => u.memberId == null));
}

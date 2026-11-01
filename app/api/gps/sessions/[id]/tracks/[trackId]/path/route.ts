import { getSessionUser } from "@/lib/auth";
import { getGpsTrackPath } from "@/lib/db";

// 이동 경로는 "이동 경로 겹쳐 보기"를 켤 때만 필요하고 용량이 커서(90분 약 100KB) 따로 내려준다.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; trackId: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { id, trackId } = await params;
  const path = await getGpsTrackPath(Number(id), Number(trackId));
  if (!path) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ path });
}

import { getSessionUser, requireAdmin } from "@/lib/auth";
import { deleteGpsTrack, getGpsTrack } from "@/lib/db";

type Ctx = { params: Promise<{ id: string; trackId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { id, trackId } = await params;
  const track = await getGpsTrack(Number(id), Number(trackId));
  if (!track) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(track);
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "운영진만 지울 수 있어요." }, { status: 403 });
  const { id, trackId } = await params;
  await deleteGpsTrack(Number(id), Number(trackId));
  return Response.json({ ok: true });
}

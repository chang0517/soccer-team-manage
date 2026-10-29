import { getSessionUser, requireAdmin } from "@/lib/auth";
import {
  deleteGpsSession,
  getGpsPitch,
  getGpsSession,
  listGpsTracks,
  listMembers,
  setGpsSessionPitch,
} from "@/lib/db";
import { reanalyzeTrack } from "@/lib/gps/service";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { id } = await params;
  const session = await getGpsSession(Number(id));
  if (!session) return Response.json({ error: "not found" }, { status: 404 });
  const [tracks, members, pitch] = await Promise.all([
    listGpsTracks(session.id),
    listMembers(),
    session.pitchId === null ? Promise.resolve(null) : getGpsPitch(session.pitchId),
  ]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  return Response.json({
    session,
    pitch,
    tracks: tracks.map((t) => ({
      ...t,
      memberName: t.memberId === null ? null : (names.get(t.memberId) ?? null),
    })),
  });
}

// 구장을 바꾸면 보관해 둔 원본으로 모든 트랙을 다시 분석한다.
export async function PATCH(request: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "운영진만 바꿀 수 있어요." }, { status: 403 });
  const { id } = await params;
  const session = await getGpsSession(Number(id));
  if (!session) return Response.json({ error: "not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const pitchId = body.pitchId == null || body.pitchId === "" ? null : Number(body.pitchId);
  if (pitchId !== null && !(Number.isInteger(pitchId) && (await getGpsPitch(pitchId)))) {
    return Response.json({ error: "구장을 찾을 수 없어요." }, { status: 400 });
  }
  await setGpsSessionPitch(session.id, pitchId);
  const updated = (await getGpsSession(session.id))!;
  let redone = 0;
  let failed = 0;
  for (const t of await listGpsTracks(session.id)) {
    try {
      if (await reanalyzeTrack(updated, t.id, t.source)) redone++;
    } catch {
      failed++;
    }
  }
  return Response.json({ session: updated, reanalyzed: redone, failed });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "운영진만 지울 수 있어요." }, { status: 403 });
  const { id } = await params;
  await deleteGpsSession(Number(id));
  return Response.json({ ok: true });
}

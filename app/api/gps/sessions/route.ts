import { getSessionUser, requireAdmin } from "@/lib/auth";
import { createGpsSession, getGpsPitch, listGpsSessions } from "@/lib/db";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  return Response.json(await listGpsSessions());
}

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "운영진만 세션을 만들 수 있어요." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const title = String(body.title ?? "").trim();
  if (!title) return Response.json({ error: "제목을 입력해 주세요." }, { status: 400 });
  const playedOn = String(body.playedOn ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(playedOn)) {
    return Response.json({ error: "경기한 날을 입력해 주세요." }, { status: 400 });
  }
  const pitchId = body.pitchId == null || body.pitchId === "" ? null : Number(body.pitchId);
  if (pitchId !== null && !(Number.isInteger(pitchId) && (await getGpsPitch(pitchId)))) {
    return Response.json({ error: "구장을 찾을 수 없어요." }, { status: 400 });
  }
  const eventId = body.eventId == null || body.eventId === "" ? null : Number(body.eventId);
  const created = await createGpsSession({
    title,
    eventId: Number.isInteger(eventId) ? eventId : null,
    pitchId,
    playedOn,
    isSample: false,
  });
  return Response.json(created, { status: 201 });
}

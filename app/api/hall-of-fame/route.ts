import { requireAdmin } from "@/lib/auth";
import { listHallOfFame, upsertHallOfFame } from "@/lib/db";

export async function GET() {
  return Response.json(await listHallOfFame());
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "운영진만 등록할 수 있어요." }, { status: 403 });
  }
  const body = await request.json();
  const year = Number(body?.year);
  if (!year) {
    return Response.json({ error: "연도를 입력해 주세요." }, { status: 400 });
  }
  const toId = (v: unknown) => (v === "" || v == null ? null : Number(v));
  const entry = await upsertHallOfFame({
    year,
    captainId: toId(body.captainId),
    viceCaptainId: toId(body.viceCaptainId),
    managerId: toId(body.managerId),
    topScorerId: toId(body.topScorerId),
    topAssistId: toId(body.topAssistId),
    cleanSheetFirstId: toId(body.cleanSheetFirstId),
    overallFirstId: toId(body.overallFirstId),
  });
  return Response.json(entry, { status: 201 });
}

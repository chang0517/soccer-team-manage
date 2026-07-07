import { requireAdmin } from "@/lib/auth";
import { createEvent, listEvents } from "@/lib/db";

export async function GET() {
  return Response.json(await listEvents());
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "운영진만 일정을 추가할 수 있어요." }, { status: 403 });
  }
  const body = await request.json();
  if (!body.title?.trim() || !body.date) {
    return Response.json(
      { error: "제목과 날짜는 필수입니다." },
      { status: 400 }
    );
  }
  const event = await createEvent({
    title: body.title.trim(),
    type: body.type === "social" ? "social" : "match",
    date: body.date,
    time: body.time ?? "",
    location: body.location ?? "",
    opponent: body.opponent ?? "",
    notes: body.notes ?? "",
    dutyOffense: body.dutyOffense ?? "",
    dutyDefense: body.dutyDefense ?? "",
    waterDuty: body.waterDuty ?? "",
    iceboxDuty: body.iceboxDuty ?? "",
  });
  return Response.json(event, { status: 201 });
}

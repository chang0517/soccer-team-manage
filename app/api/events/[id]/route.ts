import {
  deleteEvent,
  getEvent,
  getMvpVotes,
  getRecords,
  getVotes,
  listMembers,
  updateEvent,
} from "@/lib/db";
import { daysUntil } from "@/lib/format";
import { generateSquad } from "@/lib/squad";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let event = await getEvent(Number(id));
  if (!event) return Response.json({ error: "not found" }, { status: 404 });

  // 예전 버전(쿼터 구분 없는 단일 스쿼드) 데이터는 새 구조와 맞지 않으니
  // 안전하게 비워서 "아직 스쿼드 없음" 상태로 되돌린다.
  if (event.squad && !Array.isArray(event.squad.quarters)) {
    await updateEvent(event.id, { squad: null });
    event = (await getEvent(event.id))!;
  }

  // 경기 3일 전부터는 참석 투표 기준으로 스쿼드를 자동 생성한다.
  const dday = daysUntil(event.date);
  if (event.type === "match" && !event.squad && dday >= 0 && dday <= 3) {
    const attendIds = new Set(
      (await getVotes(event.id))
        .filter((v) => v.status === "attend")
        .map((v) => v.memberId)
    );
    const attendees = (await listMembers()).filter((m) => attendIds.has(m.id));
    if (attendees.length > 0) {
      await updateEvent(event.id, { squad: generateSquad(attendees) });
      event = (await getEvent(event.id))!;
    }
  }

  return Response.json({
    event,
    votes: await getVotes(event.id),
    records: await getRecords(event.id),
    mvpVotes: await getMvpVotes(event.id),
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  await updateEvent(Number(id), body);
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await deleteEvent(Number(id));
  return Response.json({ ok: true });
}

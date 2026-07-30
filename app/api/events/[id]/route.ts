import { requireAdmin } from "@/lib/auth";
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
import { FORMATION_SLOTS, generateSquad, isSquadConfirmed } from "@/lib/squad";

const CURRENT_SLOT_IDS = new Set(FORMATION_SLOTS.map((s) => s.id));

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

  // 포메이션이 바뀌어 슬롯 구성이 달라진 예전 스쿼드도 마찬가지로 비운다
  // (단, 운영진이 확정한 스쿼드는 그대로 둔다).
  if (
    event.squad &&
    !isSquadConfirmed(event.squad) &&
    event.squad.quarters.some((q) =>
      q.starters.some((s) => !CURRENT_SLOT_IDS.has(s.slotId))
    )
  ) {
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

// 일정의 이름/유형/일시/장소/상대팀 같은 기본 정보는 운영진만 고칠 수 있다
// (참석 투표, 스쿼드, 비고란 등 나머지 필드는 기존대로 누구나 PATCH 가능).
const ADMIN_ONLY_FIELDS = [
  "title",
  "type",
  "date",
  "time",
  "location",
  "opponent",
] as const;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  if (body.squad !== undefined || body.scrimmageSquad !== undefined) {
    const current = await getEvent(Number(id));
    const locked =
      (body.squad !== undefined && isSquadConfirmed(current?.squad)) ||
      (body.scrimmageSquad !== undefined && isSquadConfirmed(current?.scrimmageSquad));
    if (locked && !(await requireAdmin())) {
      return Response.json(
        { error: "확정된 스쿼드는 운영진만 수정할 수 있어요." },
        { status: 403 }
      );
    }
  }
  if (ADMIN_ONLY_FIELDS.some((f) => body[f] !== undefined) && !(await requireAdmin())) {
    return Response.json(
      { error: "일정 정보는 운영진만 수정할 수 있어요." },
      { status: 403 }
    );
  }
  await updateEvent(Number(id), body);
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "운영진만 삭제할 수 있어요." }, { status: 403 });
  }
  const { id } = await params;
  await deleteEvent(Number(id));
  return Response.json({ ok: true });
}

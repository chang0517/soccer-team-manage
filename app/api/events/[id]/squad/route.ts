import { requireAdmin, requireMember } from "@/lib/auth";
import { getEvent, getVotes, listMembers, updateEvent } from "@/lib/db";
import { generateSquad, isSquadConfirmed } from "@/lib/squad";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireMember())) {
    return Response.json(
      { error: "로그인한 멤버만 스쿼드를 만들 수 있어요." },
      { status: 403 }
    );
  }

  const { id } = await params;
  const eventId = Number(id);
  const event = await getEvent(eventId);
  if (!event) return Response.json({ error: "not found" }, { status: 404 });

  if (isSquadConfirmed(event.squad) && !(await requireAdmin())) {
    return Response.json(
      { error: "확정된 스쿼드는 운영진만 다시 생성할 수 있어요." },
      { status: 403 }
    );
  }

  const attendIds = new Set(
    (await getVotes(eventId))
      .filter((v) => v.status === "attend")
      .map((v) => v.memberId)
  );
  const attendees = (await listMembers()).filter((m) => attendIds.has(m.id));
  const squad = generateSquad(attendees);
  await updateEvent(eventId, { squad });
  return Response.json(squad);
}

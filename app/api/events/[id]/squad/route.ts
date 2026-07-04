import { getEvent, getVotes, listMembers, updateEvent } from "@/lib/db";
import { generateSquad } from "@/lib/squad";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = Number(id);
  const event = await getEvent(eventId);
  if (!event) return Response.json({ error: "not found" }, { status: 404 });

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

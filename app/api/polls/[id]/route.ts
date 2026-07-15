import { getSessionUser } from "@/lib/auth";
import { deletePoll, getPoll, setPollClosed } from "@/lib/db";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pollId = Number(id);
  const poll = await getPoll(pollId);
  if (!poll) return Response.json({ error: "not found" }, { status: 404 });

  const session = await getSessionUser();
  const isOwner = session?.memberId === poll.createdBy;
  if (!session || (!isOwner && session.role !== "admin")) {
    return Response.json(
      { error: "투표를 만든 사람이나 운영진만 마감할 수 있어요." },
      { status: 403 }
    );
  }
  const body = await request.json();
  await setPollClosed(pollId, !!body.closed);
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pollId = Number(id);
  const poll = await getPoll(pollId);
  if (!poll) return Response.json({ error: "not found" }, { status: 404 });

  const session = await getSessionUser();
  const isOwner = session?.memberId === poll.createdBy;
  if (!session || (!isOwner && session.role !== "admin")) {
    return Response.json(
      { error: "투표를 만든 사람이나 운영진만 삭제할 수 있어요." },
      { status: 403 }
    );
  }
  await deletePoll(pollId);
  return Response.json({ ok: true });
}

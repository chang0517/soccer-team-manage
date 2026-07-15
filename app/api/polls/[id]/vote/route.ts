import { getSessionUser } from "@/lib/auth";
import { getAllPollOptions, getPoll, setPollVote } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pollId = Number(id);
  const poll = await getPoll(pollId);
  if (!poll) return Response.json({ error: "not found" }, { status: 404 });
  if (poll.closed) {
    return Response.json({ error: "마감된 투표예요." }, { status: 403 });
  }

  const body = await request.json();
  const memberId = Number(body?.memberId);
  const optionIds: number[] = Array.isArray(body?.optionIds)
    ? body.optionIds.map((o: unknown) => Number(o))
    : [];
  if (!memberId || optionIds.length === 0) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const session = await getSessionUser();
  if (!session || (session.role !== "admin" && session.memberId !== memberId)) {
    return Response.json(
      { error: "본인 투표만 등록할 수 있어요." },
      { status: 403 }
    );
  }

  const validOptionIds = new Set(
    (await getAllPollOptions()).filter((o) => o.pollId === pollId).map((o) => o.id)
  );
  if (!optionIds.every((oid) => validOptionIds.has(oid))) {
    return Response.json({ error: "잘못된 보기예요." }, { status: 400 });
  }

  await setPollVote(pollId, memberId, optionIds);
  return Response.json({ ok: true });
}

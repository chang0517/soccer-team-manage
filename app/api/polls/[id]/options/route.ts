import { getSessionUser } from "@/lib/auth";
import { addPollOption, getPoll } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pollId = Number(id);
  const poll = await getPoll(pollId);
  if (!poll) return Response.json({ error: "not found" }, { status: 404 });
  if (poll.closed) {
    return Response.json(
      { error: "마감된 투표에는 보기를 추가할 수 없어요." },
      { status: 403 }
    );
  }

  const session = await getSessionUser();
  const isOwner = session?.memberId === poll.createdBy;
  if (!session || (!isOwner && session.role !== "admin")) {
    return Response.json(
      { error: "투표를 만든 사람이나 운영진만 보기를 추가할 수 있어요." },
      { status: 403 }
    );
  }

  const body = await request.json();
  const label = String(body?.label ?? "").trim();
  if (!label) {
    return Response.json({ error: "보기 내용을 입력해 주세요." }, { status: 400 });
  }

  const option = await addPollOption(pollId, label);
  return Response.json(option, { status: 201 });
}

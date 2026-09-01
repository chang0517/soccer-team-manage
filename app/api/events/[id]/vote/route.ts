import { getSessionUser } from "@/lib/auth";
import { getEvent, getVotes, listMembers, setVote } from "@/lib/db";
import { isVotingClosed } from "@/lib/rules";
import { sendPushToAll } from "@/lib/push";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventId = Number(id);
  const body = await request.json();
  if (!body.memberId || !["attend", "maybe", "absent"].includes(body.status)) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const session = await getSessionUser();
  const isAdmin = session?.role === "admin";

  if (!isAdmin && session?.memberId !== Number(body.memberId)) {
    return Response.json(
      { error: "본인 투표만 등록할 수 있어요." },
      { status: 403 }
    );
  }

  const event = await getEvent(eventId);
  if (!event) return Response.json({ error: "not found" }, { status: 404 });

  if (!isAdmin) {
    const votes = await getVotes(eventId);
    const attendCount = votes.filter((v) => v.status === "attend").length;
    if (isVotingClosed(attendCount)) {
      return Response.json(
        {
          error:
            "투표가 마감됐어요. 댓글로 참석 의사를 남기면 운영진이 확인 후 추가해 드려요.",
        },
        { status: 403 }
      );
    }
  }

  await setVote(eventId, Number(body.memberId), body.status);

  // 참석 투표만 알린다 — 미정/불참까지 매번 쏘면 상태를 왔다갔다 누를 때마다
  // 알림이 튀어서 오히려 소음이 된다.
  if (event.type === "match" && body.status === "attend") {
    const member = (await listMembers()).find((m) => m.id === Number(body.memberId));
    if (member) {
      await sendPushToAll({
        title: "✅ 참석 투표",
        body: `${member.name}님이 ${event.title}에 참석 투표했어요.`,
        url: `/events/${event.id}`,
      });
    }
  }

  return Response.json({ ok: true });
}

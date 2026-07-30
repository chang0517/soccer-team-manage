import { requireAdmin } from "@/lib/auth";
import { getEvent, updateEvent } from "@/lib/db";

// 운영진이 누르면 스쿼드 승인 목록에 자기 memberId를 추가하고, 이미 승인한
// 상태에서 다시 누르면 승인을 취소한다(깃헙 리뷰 취소와 비슷). 승인 인원이
// SQUAD_APPROVAL_THRESHOLD 이상이 되면 lib/squad.ts의 isSquadConfirmed가
// 자동으로 확정 상태로 판단한다 — 이 라우트는 별도로 confirmed를 건드리지
// 않는다. ?team=B를 주면 내전 모드의 B팀 스쿼드(scrimmageSquad)를 승인한다
// (기본은 A팀 = squad).
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "운영진만 승인할 수 있어요." }, { status: 403 });
  }
  if (!session.memberId) {
    return Response.json(
      { error: "멤버 프로필과 연결되지 않아서 승인할 수 없어요." },
      { status: 400 }
    );
  }

  const team = new URL(request.url).searchParams.get("team");
  const field = team === "B" ? "scrimmageSquad" : "squad";

  const { id } = await params;
  const event = await getEvent(Number(id));
  const target = event?.[field];
  if (!target) {
    return Response.json({ error: "스쿼드가 없어요." }, { status: 404 });
  }

  const approvedBy = target.approvedBy ?? [];
  const nextApprovedBy = approvedBy.includes(session.memberId)
    ? approvedBy.filter((mid) => mid !== session.memberId)
    : [...approvedBy, session.memberId];

  const squad = { ...target, approvedBy: nextApprovedBy };
  await updateEvent(event!.id, { [field]: squad });
  return Response.json(squad);
}

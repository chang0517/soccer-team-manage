import { requireAdmin } from "@/lib/auth";
import { cancelTacticsJob, getTacticsJob } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  // 팀 맥미니의 로컬 AI 자원을 쓰기 때문에 운영진만 이용할 수 있게 막는다.
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "운영진만 이용할 수 있어요." }, { status: 403 });
  }

  const { jobId } = await params;
  const job = await getTacticsJob(Number(jobId));
  if (!job) return Response.json({ error: "not found" }, { status: 404 });

  return Response.json({
    status: job.status,
    result: job.result,
    error: job.error,
    rawResponse: job.rawResponse,
    model: job.model,
    createdAt: job.createdAt,
  });
}

// 취소 — 맥미니가 백그라운드에서 하던 연산 자체를 멈추진 못한다(서버리스라
// 실행 중인 작업을 가리키는 공유 상태가 없다). 대신 작업을 'cancelled'로
// 표시해서, 나중에 결과가 나와도 화면에 반영되지 않게 한다.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "운영진만 이용할 수 있어요." }, { status: 403 });
  }

  const { jobId } = await params;
  const job = await getTacticsJob(Number(jobId));
  if (!job) return Response.json({ error: "not found" }, { status: 404 });
  if (job.userId !== session.id) {
    return Response.json({ error: "본인이 만든 작업만 취소할 수 있어요." }, { status: 403 });
  }

  await cancelTacticsJob(job.id);
  return Response.json({ ok: true });
}

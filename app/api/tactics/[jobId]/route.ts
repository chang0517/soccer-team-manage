import { getSessionUser } from "@/lib/auth";
import { getTacticsJob } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const session = await getSessionUser();
  if (!session) {
    return Response.json({ error: "로그인 후 이용할 수 있어요." }, { status: 401 });
  }

  const { jobId } = await params;
  const job = await getTacticsJob(Number(jobId));
  if (!job) return Response.json({ error: "not found" }, { status: 404 });

  return Response.json({
    status: job.status,
    result: job.result,
    error: job.error,
  });
}

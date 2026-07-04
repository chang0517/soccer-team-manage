import { setVote } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  if (!body.memberId || !["attend", "maybe", "absent"].includes(body.status)) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  await setVote(Number(id), Number(body.memberId), body.status);
  return Response.json({ ok: true });
}

import { getSessionUser } from "@/lib/auth";
import { addComment, getComments } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return Response.json(await getComments(Number(id)));
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSessionUser();
  if (!session?.memberId) {
    return Response.json(
      { error: "멤버 프로필과 연결된 계정만 댓글을 남길 수 있어요." },
      { status: 403 }
    );
  }
  const { id } = await params;
  const body = await request.json();
  const text = String(body?.body ?? "").trim();
  if (!text) return Response.json({ error: "내용을 입력해 주세요." }, { status: 400 });

  const comment = await addComment(Number(id), session.memberId, text);
  return Response.json(comment, { status: 201 });
}

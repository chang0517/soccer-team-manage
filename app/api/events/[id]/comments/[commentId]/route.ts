import { getSessionUser, requireAdmin } from "@/lib/auth";
import { deleteComment, getComment } from "@/lib/db";

// 작성자 본인 또는 운영진만 삭제할 수 있다.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { id, commentId } = await params;
  const comment = await getComment(Number(commentId));
  if (!comment || comment.eventId !== Number(id)) {
    return Response.json({ error: "댓글을 찾을 수 없어요." }, { status: 404 });
  }

  const session = await getSessionUser();
  const isAuthor = session?.memberId != null && session.memberId === comment.memberId;
  if (!isAuthor && !(await requireAdmin())) {
    return Response.json(
      { error: "본인이 쓴 댓글이거나 운영진만 지울 수 있어요." },
      { status: 403 }
    );
  }

  await deleteComment(comment.id);
  return Response.json({ ok: true });
}

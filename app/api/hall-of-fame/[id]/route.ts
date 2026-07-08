import { requireAdmin } from "@/lib/auth";
import { deleteHallOfFame } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "운영진만 삭제할 수 있어요." }, { status: 403 });
  }
  const { id } = await params;
  await deleteHallOfFame(Number(id));
  return Response.json({ ok: true });
}

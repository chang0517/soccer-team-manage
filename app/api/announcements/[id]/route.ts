import { requireAdmin } from "@/lib/auth";
import { deleteAnnouncement, getAnnouncement, updateAnnouncement } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const announcement = await getAnnouncement(Number(id));
  if (!announcement) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(announcement);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "운영진만 수정할 수 있어요." }, { status: 403 });
  }
  const { id } = await params;
  const body = await request.json();
  const title = String(body?.title ?? "").trim();
  const text = String(body?.body ?? "").trim();
  if (!title || !text) {
    return Response.json({ error: "제목과 내용을 입력해 주세요." }, { status: 400 });
  }
  await updateAnnouncement(Number(id), { title, body: text });
  return Response.json({ ok: true });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "운영진만 삭제할 수 있어요." }, { status: 403 });
  }
  const { id } = await params;
  await deleteAnnouncement(Number(id));
  return Response.json({ ok: true });
}

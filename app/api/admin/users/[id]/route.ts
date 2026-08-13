import { requireAdmin } from "@/lib/auth";
import { createMember, updateUserStatus } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "권한이 없어요." }, { status: 403 });

  const { id } = await params;
  const body = await request.json();
  const action = body?.action;

  if (action === "reject") {
    await updateUserStatus(Number(id), "rejected", null);
    return Response.json({ ok: true });
  }

  if (action === "approve") {
    let memberId: number | null = body?.memberId ?? null;
    if (!memberId && body?.newMember) {
      const backNo =
        body.newMember.backNo != null && Number.isFinite(Number(body.newMember.backNo))
          ? Number(body.newMember.backNo)
          : null;
      const created = await createMember({
        name: body.newMember.name,
        backNo,
        pos1: body.newMember.pos1 ?? "CB",
        pos2: body.newMember.pos2 ?? "WB",
        isGuest: false,
        phone: typeof body.newMember.phone === "string" ? body.newMember.phone : null,
      });
      memberId = created.id;
    }
    const role = body?.role === "admin" || body?.role === "player" ? body.role : undefined;
    await updateUserStatus(Number(id), "approved", memberId, role);
    return Response.json({ ok: true, memberId });
  }

  return Response.json({ error: "잘못된 요청이에요." }, { status: 400 });
}

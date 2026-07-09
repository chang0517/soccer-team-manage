import { requireAdmin } from "@/lib/auth";
import { createMember, listMembers } from "@/lib/db";

export async function GET() {
  return Response.json(await listMembers());
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name?.trim()) {
    return Response.json({ error: "이름은 필수입니다." }, { status: 400 });
  }
  // 용병(임시 참가자) 추가는 누구나, 정식 멤버 등록은 운영진만.
  if (!body.isGuest && !(await requireAdmin())) {
    return Response.json({ error: "운영진만 멤버를 추가할 수 있어요." }, { status: 403 });
  }
  const member = await createMember({
    name: body.name.trim(),
    backNo: body.backNo ?? null,
    pos1: body.pos1 ?? "CB",
    pos2: body.pos2 ?? "WB",
    isGuest: !!body.isGuest,
    phone: body.phone?.trim() || null,
  });
  return Response.json(member, { status: 201 });
}

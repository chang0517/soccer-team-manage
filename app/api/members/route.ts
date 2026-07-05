import { createMember, listMembers } from "@/lib/db";

export async function GET() {
  return Response.json(await listMembers());
}

export async function POST(request: Request) {
  const body = await request.json();
  if (!body.name?.trim()) {
    return Response.json({ error: "이름은 필수입니다." }, { status: 400 });
  }
  const member = await createMember({
    name: body.name.trim(),
    backNo: body.backNo ?? null,
    pos1: body.pos1 ?? "CB",
    pos2: body.pos2 ?? "WB",
    isGuest: !!body.isGuest,
  });
  return Response.json(member, { status: 201 });
}

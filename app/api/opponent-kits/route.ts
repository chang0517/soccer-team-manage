import { getSessionUser } from "@/lib/auth";
import { listOpponentKits, upsertOpponentKit } from "@/lib/db";

// 상대팀 유니폼 색 기억. 홈 화면에서 다가오는 경기의 상대팀 이름으로
// 조회해서, 이미 기록된 색이 있으면 자동으로 보여주고 없으면 누구나
// 채워 넣을 수 있게 한다(운영진 전용으로 막을 만큼 민감한 정보가
// 아니라서 로그인만 요구한다).
export async function GET() {
  const session = await getSessionUser();
  if (!session) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  return Response.json(await listOpponentKits());
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const body = await request.json();
  const teamName = String(body?.teamName ?? "").trim();
  const color = String(body?.color ?? "").trim();
  if (!teamName || !/^#[0-9a-fA-F]{6}$/.test(color)) {
    return Response.json({ error: "잘못된 요청이에요." }, { status: 400 });
  }
  await upsertOpponentKit(teamName, color);
  return Response.json({ ok: true });
}

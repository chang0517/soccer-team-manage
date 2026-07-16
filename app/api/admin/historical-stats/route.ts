import { requireAdmin } from "@/lib/auth";
import {
  deleteHistoricalStats,
  getAllHistoricalStats,
  listMembers,
  upsertHistoricalStats,
} from "@/lib/db";

interface ImportEntry {
  name: string;
  games: number;
  goals: number;
  assists: number;
  cleanUnits: number; // C(1)=1, C(0.5)=0.5 단위 합
  bonus?: number; // 스프레드시트의 수동 가산점 (예: 이현재 +1)
}

// 스프레드시트 시절 SCORE 가중치(클린 1.25점/유닛)를 그대로 적용해 포인트로 저장한다.
const CLEAN_POINT_PER_UNIT = 1.25;

export async function GET() {
  if (!(await requireAdmin())) {
    return Response.json({ error: "운영진만 가능해요." }, { status: 403 });
  }
  return Response.json(await getAllHistoricalStats());
}

export async function PUT(request: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "운영진만 가능해요." }, { status: 403 });
  }
  const body = await request.json();
  const memberId = Number(body?.memberId);
  if (!memberId) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  await upsertHistoricalStats({
    memberId,
    games: Number(body.games) || 0,
    goals: Number(body.goals) || 0,
    assists: Number(body.assists) || 0,
    cleanPts: Number(body.cleanPts) || 0,
    bonusPts: Number(body.bonusPts) || 0,
  });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "운영진만 가능해요." }, { status: 403 });
  }
  const body = await request.json();
  const memberId = Number(body?.memberId);
  if (!memberId) {
    return Response.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }
  await deleteHistoricalStats(memberId);
  return Response.json({ ok: true });
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return Response.json({ error: "운영진만 가능해요." }, { status: 403 });
  }
  const body = await request.json();
  const entries: ImportEntry[] = body?.entries ?? [];
  const members = await listMembers();
  const byName = new Map(members.map((m) => [m.name, m]));

  const updated: string[] = [];
  const notFound: string[] = [];

  for (const e of entries) {
    const cleanName = e.name.replace(/\(C\)$/, "").trim();
    const member = byName.get(cleanName);
    if (!member) {
      notFound.push(e.name);
      continue;
    }
    await upsertHistoricalStats({
      memberId: member.id,
      games: e.games,
      goals: e.goals,
      assists: e.assists,
      cleanPts: e.cleanUnits * CLEAN_POINT_PER_UNIT,
      bonusPts: e.bonus ?? 0,
    });
    updated.push(cleanName);
  }

  return Response.json({ updated, notFound });
}

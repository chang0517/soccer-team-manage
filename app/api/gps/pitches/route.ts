import { getSessionUser, requireAdmin } from "@/lib/auth";
import { createGpsPitch, deleteGpsPitch, listGpsPitches } from "@/lib/db";
import { makePitchFrame } from "@/lib/gps/geo";
import type { LatLon, PitchCorners } from "@/lib/gps/types";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  return Response.json(await listGpsPitches());
}

const toLatLon = (v: unknown): LatLon | null => {
  const o = v as { lat?: unknown; lon?: unknown } | null;
  const lat = Number(o?.lat);
  const lon = Number(o?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
};

export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "운영진만 구장을 등록할 수 있어요." }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  if (!name) return Response.json({ error: "구장 이름을 입력해 주세요." }, { status: 400 });
  const raw = Array.isArray(body.corners) ? body.corners.map(toLatLon) : [];
  if (raw.length !== 4 || raw.some((c: LatLon | null) => c === null)) {
    return Response.json({ error: "모서리 4곳의 위도·경도를 모두 입력해 주세요." }, { status: 400 });
  }
  const corners = raw as PitchCorners;
  const frame = makePitchFrame(corners);
  if (!frame) {
    return Response.json(
      { error: "모서리 좌표로 만든 구장 크기가 이상해요. 1→2번이 길이, 1→4번이 폭이 되도록 순서를 확인해 주세요." },
      { status: 400 }
    );
  }
  return Response.json(await createGpsPitch(name, corners), { status: 201 });
}

export async function DELETE(request: Request) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "운영진만 구장을 지울 수 있어요." }, { status: 403 });
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "id가 필요해요." }, { status: 400 });
  await deleteGpsPitch(id);
  return Response.json({ ok: true });
}

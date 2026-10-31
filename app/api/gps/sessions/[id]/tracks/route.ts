import { requireAdmin } from "@/lib/auth";
import { getGpsSession, listMembers } from "@/lib/db";
import { decodeLogBody, ingestLog } from "@/lib/gps/service";

// 로그 업로드. 본문은 로그 파일 그대로(포드 CSV 또는 GPX)이고 gzip이어도 된다.
// 서버리스 요청 본문 한도(약 4.5MB)가 있어서, 90분짜리 10Hz 로그는 클라이언트가
// gzip으로 줄여 보내야 한다(압축하면 약 1MB).
// 쿼리: memberId(선택), deviceId(선택), format=pod|gpx(선택, 비우면 자동 감지)
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "운영진만 로그를 올릴 수 있어요." }, { status: 403 });
  const { id } = await params;
  const session = await getGpsSession(Number(id));
  if (!session) return Response.json({ error: "세션을 찾을 수 없어요." }, { status: 404 });

  const q = new URL(request.url).searchParams;
  const memberRaw = q.get("memberId");
  let memberId: number | null = null;
  if (memberRaw) {
    memberId = Number(memberRaw);
    if (!Number.isInteger(memberId) || !(await listMembers()).some((m) => m.id === memberId)) {
      return Response.json({ error: "선수를 찾을 수 없어요." }, { status: 400 });
    }
  }
  const fmt = q.get("format");
  const format = fmt === "pod" || fmt === "gpx" ? fmt : undefined;

  try {
    const text = decodeLogBody(Buffer.from(await request.arrayBuffer()));
    const trackId = await ingestLog(session, {
      memberId,
      deviceId: q.get("deviceId") ?? undefined,
      text,
      format,
    });
    return Response.json({ id: trackId }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return Response.json({ error: msg || "로그를 분석하지 못했어요." }, { status: 422 });
  }
}

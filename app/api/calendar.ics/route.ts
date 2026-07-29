import { listEvents } from "@/lib/db";
import { icsFeedResponse } from "@/lib/ics";

// 쿼리 토큰 버전. 경로가 실제로 ".ics"로 끝나야 확인이 통과되는 캘린더
// 구독 검증기가 있어서, 실사용은 /api/calendar/[token].ics 쪽을 쓴다
// (이 라우트는 과거 링크 호환용으로 남겨둔다).
export async function GET(request: Request) {
  const secret = process.env.CALENDAR_FEED_SECRET;
  const token = new URL(request.url).searchParams.get("token");
  if (!secret || token !== secret) {
    return Response.json({ error: "권한이 없어요." }, { status: 403 });
  }

  return icsFeedResponse(await listEvents());
}

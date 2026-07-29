import { listEvents } from "@/lib/db";
import { eventsToIcs } from "@/lib/ics";

// 아이폰/갤럭시 기본 캘린더가 "구독 캘린더"로 등록해서 주기적으로 이 URL을
// 긁어가는 용도. 로그인 세션을 못 태우는 구독 URL 특성상, CALENDAR_FEED_SECRET
// 쿼리 토큰으로만 접근을 막는다(FINE_NOTICE_SECRET과 같은 패턴, 다만 캘린더
// 앱은 커스텀 헤더를 못 보내서 쿼리 파라미터를 쓴다).
export async function GET(request: Request) {
  const secret = process.env.CALENDAR_FEED_SECRET;
  const token = new URL(request.url).searchParams.get("token");
  if (!secret || token !== secret) {
    return Response.json({ error: "권한이 없어요." }, { status: 403 });
  }

  const events = await listEvents();
  const ics = eventsToIcs(events);
  return new Response(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="raven-fc.ics"',
      "Cache-Control": "no-store",
    },
  });
}

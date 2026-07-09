import { requireAdmin } from "@/lib/auth";
import { listEvents, listMembers, getVotesForEvents } from "@/lib/db";
import { computeMonthlyNonVoters } from "@/lib/fines";

// 운영진 세션 또는 FINE_NOTICE_SECRET 베어러 토큰(맥미니 자동발송 스크립트용)
// 둘 중 하나로 인증한다. 전화번호 등 개인정보가 포함돼서 둘 다 없으면 거부.
async function isAuthorized(request: Request): Promise<boolean> {
  if (await requireAdmin()) return true;
  const auth = request.headers.get("authorization") ?? "";
  const secret = process.env.FINE_NOTICE_SECRET;
  return !!secret && auth === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!(await isAuthorized(request))) {
    return Response.json({ error: "권한이 없어요." }, { status: 403 });
  }

  const url = new URL(request.url);
  const now = new Date();
  const year = Number(url.searchParams.get("year")) || now.getFullYear();
  const month = Number(url.searchParams.get("month")) || now.getMonth() + 1;

  const [events, members] = await Promise.all([listEvents(), listMembers()]);
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthEventIds = events
    .filter((e) => e.type === "match" && e.date.startsWith(monthPrefix))
    .map((e) => e.id);
  const votes = await getVotesForEvents(monthEventIds);
  const votesByEvent = new Map<number, typeof votes>();
  for (const v of votes) {
    const list = votesByEvent.get(v.eventId) ?? [];
    list.push(v);
    votesByEvent.set(v.eventId, list);
  }

  const notices = computeMonthlyNonVoters(year, month, events, votesByEvent, members);
  return Response.json({ year, month, notices });
}

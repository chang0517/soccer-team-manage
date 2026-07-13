import { listEvents } from "@/lib/db";
import { seasonOf } from "@/lib/season";

// 랭킹 페이지의 시즌 탭 목록. 경기가 열린 시즌(매년 12월 15일~다음해
// 12월 14일 기준)들을 내림차순으로 준다.
export async function GET() {
  const events = await listEvents();
  const seasons = new Set<number>();
  for (const e of events) seasons.add(seasonOf(e.date));
  return Response.json([...seasons].sort((a, b) => b - a));
}

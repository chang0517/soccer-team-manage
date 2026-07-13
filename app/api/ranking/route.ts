import {
  getAllHistoricalStats,
  getAllMvpVotes,
  getAllRecords,
  listEvents,
  listMembers,
} from "@/lib/db";
import { computeRanking } from "@/lib/points";

export async function GET(request: Request) {
  const seasonParam = new URL(request.url).searchParams.get("season");
  const season = seasonParam ? Number(seasonParam) : null;
  const [members, events, records, mvpVotes, historical] = await Promise.all([
    listMembers(),
    listEvents(),
    getAllRecords(),
    getAllMvpVotes(),
    getAllHistoricalStats(),
  ]);
  return Response.json(
    computeRanking(members, events, records, mvpVotes, historical, season)
  );
}

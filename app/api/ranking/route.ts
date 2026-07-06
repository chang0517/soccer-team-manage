import {
  getAllHistoricalStats,
  getAllMvpVotes,
  getAllRecords,
  listEvents,
  listMembers,
} from "@/lib/db";
import { computeRanking } from "@/lib/points";

export async function GET() {
  const [members, events, records, mvpVotes, historical] = await Promise.all([
    listMembers(),
    listEvents(),
    getAllRecords(),
    getAllMvpVotes(),
    getAllHistoricalStats(),
  ]);
  return Response.json(
    computeRanking(members, events, records, mvpVotes, historical)
  );
}

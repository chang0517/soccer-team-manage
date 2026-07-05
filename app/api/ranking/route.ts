import { getAllMvpVotes, getAllRecords, listEvents, listMembers } from "@/lib/db";
import { computeRanking } from "@/lib/points";

export async function GET() {
  const [members, events, records, mvpVotes] = await Promise.all([
    listMembers(),
    listEvents(),
    getAllRecords(),
    getAllMvpVotes(),
  ]);
  return Response.json(computeRanking(members, events, records, mvpVotes));
}

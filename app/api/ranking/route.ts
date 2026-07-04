import { getAllRecords, listEvents, listMembers } from "@/lib/db";
import { computeRanking } from "@/lib/points";

export async function GET() {
  const [members, events, records] = await Promise.all([
    listMembers(),
    listEvents(),
    getAllRecords(),
  ]);
  return Response.json(computeRanking(members, events, records));
}

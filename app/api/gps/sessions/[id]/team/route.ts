import { getSessionUser } from "@/lib/auth";
import { getGpsSession, getGpsTrack, listGpsTracks, listMembers } from "@/lib/db";
import { summarizeTeam } from "@/lib/gps/team";

// 한 경기에서 같이 뛴 선수들의 기록을 비교하고 요약한다.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return Response.json({ error: "로그인이 필요해요." }, { status: 401 });
  const { id } = await params;
  const session = await getGpsSession(Number(id));
  if (!session) return Response.json({ error: "not found" }, { status: 404 });

  const [list, members] = await Promise.all([listGpsTracks(session.id), listMembers()]);
  const names = new Map(members.map((m) => [m.id, m.name]));
  const tracks = (await Promise.all(list.map((t) => getGpsTrack(session.id, t.id)))).filter(
    (t): t is NonNullable<typeof t> => t !== null
  );
  const entries = tracks.map((track) => ({
    track,
    name: track.memberId === null ? (track.deviceId ? `기기 ${track.deviceId}` : `기록 #${track.id}`) : (names.get(track.memberId) ?? "알 수 없음"),
  }));
  return Response.json(summarizeTeam(entries));
}

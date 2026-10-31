import { requireAdmin } from "@/lib/auth";
import { createGpsPitch, createGpsSession, getGpsSession, listGpsPitches, listMembers } from "@/lib/db";
import { ingestLog } from "@/lib/gps/service";
import { generatePodLog, SAMPLE_PITCH_CORNERS, SAMPLE_ROLES } from "@/lib/gps/synthetic";

// 포드가 없어도 화면을 볼 수 있도록, 시뮬레이션으로 만든 가짜 경기를 한 건 만든다.
// 실제 선수 데이터가 아니고 정확도 검증에도 쓸 수 없다.
export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "운영진만 만들 수 있어요." }, { status: 403 });

  const pitches = await listGpsPitches();
  const pitch =
    pitches.find((p) => p.name === "예시 구장(시뮬레이션)") ??
    (await createGpsPitch("예시 구장(시뮬레이션)", SAMPLE_PITCH_CORNERS));

  const today = new Date().toISOString().slice(0, 10);
  const session = await createGpsSession({
    title: "예시 경기 (시뮬레이션)",
    eventId: null,
    pitchId: pitch.id,
    playedOn: today,
    isSample: true,
  });

  const members = (await listMembers()).slice(0, SAMPLE_ROLES.length);
  const seed = Date.now() % 100000;
  for (let i = 0; i < SAMPLE_ROLES.length; i++) {
    const text = generatePodLog({
      seed: seed + i,
      role: SAMPLE_ROLES[i],
      minutes: 25,
      deviceId: `SAMPLE-${i + 1}`,
    });
    await ingestLog(session, { memberId: members[i]?.id ?? null, text, format: "pod" });
  }
  return Response.json((await getGpsSession(session.id)) ?? session, { status: 201 });
}

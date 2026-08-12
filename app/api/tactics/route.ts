import { after } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { completeTacticsJob, createTacticsJob, failTacticsJob } from "@/lib/db";
import { generateTacticsScene } from "@/lib/tactics";

// 생성이 오래 걸릴 수 있어(맥미니 로컬 모델이 크면 특히) 요청-응답 한 번에
// 묶지 않는다: 여기서는 작업(job)만 만들어 즉시 jobId를 돌려주고, 실제 LLM
// 호출은 after()로 응답을 보낸 뒤 백그라운드에서 진행한다. 휴대폰 화면이
// 꺼지거나 다른 앱으로 전환돼 클라이언트 연결이 끊겨도(이동통신망은 유휴
// 연결을 자주 끊는다) 생성 자체는 계속되고, 클라이언트는 짧은 폴링 요청으로
// 결과를 가져간다. maxDuration은 Vercel 플랜이 허용하는 한도까지 넉넉히
// 잡는다 — 완성만 되면 몇 분 걸려도 괜찮다는 판단.
export const maxDuration = 800;

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return Response.json({ error: "로그인 후 이용할 수 있어요." }, { status: 401 });
  }
  if (!session.memberId) {
    return Response.json(
      { error: "멤버 프로필과 연결되지 않아서 이용할 수 없어요." },
      { status: 400 }
    );
  }

  const body = await request.json();
  const description = body?.description;
  if (!description || typeof description !== "string" || !description.trim()) {
    return Response.json({ error: "상황을 설명해 주세요." }, { status: 400 });
  }
  const trimmed = description.trim();

  const job = await createTacticsJob(session.id, trimmed);

  after(async () => {
    try {
      const { scene, raw } = await generateTacticsScene(trimmed);
      await completeTacticsJob(job.id, scene, raw);
    } catch (e) {
      const raw = e instanceof Error ? (e as Error & { raw?: string }).raw ?? null : null;
      await failTacticsJob(
        job.id,
        e instanceof Error ? e.message : "생성에 실패했어요.",
        raw
      );
    }
  });

  return Response.json({ jobId: job.id });
}

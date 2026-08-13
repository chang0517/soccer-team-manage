import { requireAdmin } from "@/lib/auth";
import { completeTacticsJob, createTacticsJob } from "@/lib/db";
import { sanitizeScene } from "@/lib/tactics";

// 전술을 로컬 LLM에 맡기지 않고 운영진이 직접 만들 때 쓰는 경로(/tactics/edit).
// LLM 생성과 똑같이 tactics_jobs에 "완료" 상태로 곧장 저장해서, 결과 화면
// (/tactics)의 재생·디버그 뷰를 그대로 재사용한다 — 별도의 저장/조회 UI를
// 새로 안 만들어도 된다. sanitizeScene을 그대로 통과시켜서 LLM 경로와
// 똑같은 검증·클램프·오타 복구·겹침 방지 로직이 적용된다.
export async function POST(request: Request) {
  const session = await requireAdmin();
  if (!session) {
    return Response.json({ error: "운영진만 이용할 수 있어요." }, { status: 403 });
  }

  const body = await request.json();
  let scene;
  try {
    scene = sanitizeScene(body ?? {});
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "장면 데이터가 올바르지 않아요." },
      { status: 400 }
    );
  }

  const job = await createTacticsJob(session.id, `직접 제작: ${scene.title}`, "manual");
  await completeTacticsJob(job.id, scene, null);

  return Response.json({ jobId: job.id, model: job.model, createdAt: job.createdAt });
}

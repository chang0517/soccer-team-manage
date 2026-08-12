import { getSessionUser } from "@/lib/auth";
import { generateTacticsScene } from "@/lib/tactics";

export const maxDuration = 60;

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session) {
    return Response.json({ error: "로그인 후 이용할 수 있어요." }, { status: 401 });
  }

  const body = await request.json();
  const description = body?.description;
  if (!description || typeof description !== "string" || !description.trim()) {
    return Response.json({ error: "상황을 설명해 주세요." }, { status: 400 });
  }

  try {
    const scene = await generateTacticsScene(description.trim());
    return Response.json(scene);
  } catch (e) {
    const cause = e instanceof Error && "cause" in e ? String(e.cause) : undefined;
    return Response.json(
      {
        error: e instanceof Error ? e.message : "생성에 실패했어요.",
        cause,
      },
      { status: 502 }
    );
  }
}

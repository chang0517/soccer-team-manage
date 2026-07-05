import { parseMatchNotesViaGateway } from "@/lib/llm";

export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json();
  const notes = body?.notes;
  if (!notes || typeof notes !== "string" || !notes.trim()) {
    return Response.json({ error: "메모를 입력해 주세요." }, { status: 400 });
  }
  try {
    const result = await parseMatchNotesViaGateway(notes);
    return Response.json(result);
  } catch (e) {
    const cause = e instanceof Error && "cause" in e ? String(e.cause) : undefined;
    return Response.json(
      {
        error: e instanceof Error ? e.message : "분석에 실패했어요.",
        cause,
      },
      { status: 502 }
    );
  }
}

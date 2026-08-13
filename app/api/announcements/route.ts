import { getSessionUser } from "@/lib/auth";
import { createAnnouncement, listAnnouncements } from "@/lib/db";

export async function GET() {
  return Response.json(await listAnnouncements());
}

export async function POST(request: Request) {
  const session = await getSessionUser();
  if (!session || session.role !== "admin") {
    return Response.json({ error: "운영진만 작성할 수 있어요." }, { status: 403 });
  }
  const body = await request.json();
  const title = String(body?.title ?? "").trim();
  const text = String(body?.body ?? "").trim();
  const category = body?.category === "coach_feedback" ? "coach_feedback" : "notice";
  const feedbackDate =
    category === "coach_feedback" ? String(body?.feedbackDate ?? "").trim() || null : null;
  if (!title || !text) {
    return Response.json({ error: "제목과 내용을 입력해 주세요." }, { status: 400 });
  }
  if (category === "coach_feedback" && !feedbackDate) {
    return Response.json({ error: "날짜를 선택해 주세요." }, { status: 400 });
  }
  const announcement = await createAnnouncement({
    title,
    body: text,
    authorName: session.displayName,
    category,
    feedbackDate,
  });
  return Response.json(announcement, { status: 201 });
}

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
  if (!title || !text) {
    return Response.json({ error: "제목과 내용을 입력해 주세요." }, { status: 400 });
  }
  const announcement = await createAnnouncement({
    title,
    body: text,
    authorName: session.displayName,
  });
  return Response.json(announcement, { status: 201 });
}

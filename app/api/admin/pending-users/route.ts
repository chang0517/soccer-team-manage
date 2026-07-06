import { requireAdmin } from "@/lib/auth";
import { listUsersByStatus } from "@/lib/db";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "권한이 없어요." }, { status: 403 });
  return Response.json(await listUsersByStatus("pending"));
}

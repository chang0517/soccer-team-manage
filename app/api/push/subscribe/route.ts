import { getSessionUser } from "@/lib/auth";
import { deletePushSubscription, savePushSubscription } from "@/lib/db";

export async function POST(request: Request) {
  const body = await request.json();
  const endpoint = body?.endpoint;
  const p256dh = body?.keys?.p256dh;
  const auth = body?.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return Response.json({ error: "잘못된 구독 정보예요." }, { status: 400 });
  }
  const session = await getSessionUser();
  await savePushSubscription({
    endpoint,
    p256dh,
    auth,
    memberId: session?.memberId ?? null,
  });
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = await request.json();
  if (!body?.endpoint) {
    return Response.json({ error: "endpoint가 필요해요." }, { status: 400 });
  }
  await deletePushSubscription(body.endpoint);
  return Response.json({ ok: true });
}

import {
  createPhoneVerification,
  getLatestPhoneVerification,
  getUserByUsername,
  listMembers,
} from "@/lib/db";
import { maskPhone } from "@/lib/phone";
import { CODE_TTL_MS, RESEND_COOLDOWN_MS, generateCode } from "@/lib/otp";
import { sendSms } from "@/lib/sms";

export async function POST(request: Request) {
  const body = await request.json();
  const username = String(body?.username ?? "").trim();
  if (!username) {
    return Response.json({ error: "아이디를 입력해 주세요." }, { status: 400 });
  }

  const user = await getUserByUsername(username);
  if (!user) {
    return Response.json({ error: "존재하지 않는 아이디예요." }, { status: 404 });
  }
  const members = user.memberId ? await listMembers() : [];
  const member = members.find((m) => m.id === user.memberId);
  if (!member?.phone) {
    return Response.json(
      { error: "등록된 휴대폰 번호가 없어요. 운영진에게 문의해 주세요." },
      { status: 400 }
    );
  }

  const recent = await getLatestPhoneVerification(member.phone, "reset_password");
  if (
    recent &&
    !recent.consumed &&
    Date.now() - new Date(recent.createdAt).getTime() < RESEND_COOLDOWN_MS
  ) {
    return Response.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  const code = generateCode();
  await createPhoneVerification({
    phone: member.phone,
    purpose: "reset_password",
    code,
    expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });

  try {
    await sendSms(
      member.phone,
      `[Raven FC] 비밀번호 재설정 인증번호는 ${code} 입니다. (5분간 유효)`
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "SMS 발송에 실패했어요." },
      { status: 502 }
    );
  }

  return Response.json({ ok: true, phoneHint: maskPhone(member.phone) });
}

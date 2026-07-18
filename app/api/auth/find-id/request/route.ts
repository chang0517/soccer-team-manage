import {
  createPhoneVerification,
  getLatestPhoneVerification,
  getUsersByMemberId,
  listMembers,
} from "@/lib/db";
import { matchesPhone } from "@/lib/phone";
import { CODE_TTL_MS, RESEND_COOLDOWN_MS, generateCode } from "@/lib/otp";
import { sendSms } from "@/lib/sms";

export async function POST(request: Request) {
  const body = await request.json();
  const phone = String(body?.phone ?? "").trim();
  if (!phone) {
    return Response.json({ error: "휴대폰 번호를 입력해 주세요." }, { status: 400 });
  }

  const members = await listMembers();
  const member = members.find((m) => m.phone && matchesPhone(m.phone, phone));
  if (!member) {
    return Response.json(
      { error: "등록된 휴대폰 번호를 찾을 수 없어요. 운영진에게 문의해 주세요." },
      { status: 404 }
    );
  }
  const users = await getUsersByMemberId(member.id);
  const activeUsers = users.filter((u) => u.status !== "rejected");
  if (activeUsers.length === 0) {
    return Response.json(
      { error: "이 번호로 가입된 계정이 없어요. 먼저 가입해 주세요." },
      { status: 404 }
    );
  }

  const recent = await getLatestPhoneVerification(phone, "find_id");
  if (
    recent &&
    !recent.consumed &&
    Date.now() - new Date(recent.createdAt).getTime() < RESEND_COOLDOWN_MS
  ) {
    return Response.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  }

  const code = generateCode();
  await createPhoneVerification({
    phone,
    purpose: "find_id",
    code,
    expiresAt: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });

  try {
    await sendSms(phone, `[Raven FC] 아이디 찾기 인증번호는 ${code} 입니다. (5분간 유효)`);
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : "SMS 발송에 실패했어요." },
      { status: 502 }
    );
  }

  return Response.json({ ok: true });
}

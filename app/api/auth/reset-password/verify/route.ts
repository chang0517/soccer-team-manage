import {
  consumePhoneVerification,
  getLatestPhoneVerification,
  getUserByUsername,
  incrementPhoneVerificationAttempts,
  listMembers,
  updateUserPassword,
} from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { generateTempPassword, MAX_ATTEMPTS } from "@/lib/otp";

export async function POST(request: Request) {
  const body = await request.json();
  const username = String(body?.username ?? "").trim();
  const code = String(body?.code ?? "").trim();
  if (!username || !code) {
    return Response.json({ error: "인증번호를 입력해 주세요." }, { status: 400 });
  }

  const user = await getUserByUsername(username);
  if (!user || !user.memberId) {
    return Response.json({ error: "계정 정보를 찾을 수 없어요." }, { status: 404 });
  }
  const members = await listMembers();
  const member = members.find((m) => m.id === user.memberId);
  if (!member?.phone) {
    return Response.json({ error: "등록된 휴대폰 번호가 없어요." }, { status: 400 });
  }

  const verification = await getLatestPhoneVerification(member.phone, "reset_password");
  if (!verification || verification.consumed) {
    return Response.json({ error: "인증번호를 다시 요청해 주세요." }, { status: 400 });
  }
  if (new Date(verification.expiresAt).getTime() < Date.now()) {
    return Response.json(
      { error: "인증번호가 만료됐어요. 다시 요청해 주세요." },
      { status: 400 }
    );
  }
  if (verification.attempts >= MAX_ATTEMPTS) {
    return Response.json(
      { error: "시도 횟수를 초과했어요. 인증번호를 다시 요청해 주세요." },
      { status: 429 }
    );
  }
  if (verification.code !== code) {
    await incrementPhoneVerificationAttempts(verification.id);
    return Response.json({ error: "인증번호가 올바르지 않아요." }, { status: 401 });
  }

  await consumePhoneVerification(verification.id);

  const tempPassword = generateTempPassword();
  await updateUserPassword(user.id, await hashPassword(tempPassword));

  return Response.json({ tempPassword });
}

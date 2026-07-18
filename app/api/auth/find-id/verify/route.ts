import {
  consumePhoneVerification,
  getLatestPhoneVerification,
  getUsersByMemberId,
  incrementPhoneVerificationAttempts,
  listMembers,
} from "@/lib/db";
import { matchesPhone } from "@/lib/phone";
import { MAX_ATTEMPTS } from "@/lib/otp";

export async function POST(request: Request) {
  const body = await request.json();
  const phone = String(body?.phone ?? "").trim();
  const code = String(body?.code ?? "").trim();
  if (!phone || !code) {
    return Response.json({ error: "인증번호를 입력해 주세요." }, { status: 400 });
  }

  const verification = await getLatestPhoneVerification(phone, "find_id");
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

  const members = await listMembers();
  const member = members.find((m) => m.phone && matchesPhone(m.phone, phone));
  if (!member) {
    return Response.json({ error: "회원 정보를 찾을 수 없어요." }, { status: 404 });
  }
  const users = await getUsersByMemberId(member.id);
  const usernames = users.filter((u) => u.status !== "rejected").map((u) => u.username);
  if (usernames.length === 0) {
    return Response.json({ error: "가입된 계정을 찾을 수 없어요." }, { status: 404 });
  }

  return Response.json({ usernames });
}

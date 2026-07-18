export const CODE_TTL_MS = 5 * 60 * 1000; // 인증번호 5분간 유효
export const RESEND_COOLDOWN_MS = 60 * 1000; // 재발송은 1분에 한 번
export const MAX_ATTEMPTS = 5;

export function generateCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// 혼동되는 문자(0/O, 1/I/l) 뺀 알파벳+숫자로 임시 비밀번호를 만든다.
const TEMP_PASSWORD_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generateTempPassword(length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += TEMP_PASSWORD_CHARS[Math.floor(Math.random() * TEMP_PASSWORD_CHARS.length)];
  }
  return out;
}

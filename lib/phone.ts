// 휴대폰 번호 정규화. 하이픈·공백·국가코드(+82) 등 표기 차이를 무시하고
// 같은 번호인지 비교하거나(matchesPhone), 맥미니 SMS 게이트웨이가 기대하는
// +82 형식으로 변환할 때(toE164) 쓴다. 맥미니 쪽 정규화(ollama-gateway/gateway.mjs,
// fine-notices/send-fine-notices.mjs)와 동일한 규칙을 따른다.

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

// 010-1234-5678, +821012345678 등을 전부 01012345678 형식으로 통일.
function localDigits(raw: string): string {
  const digits = digitsOnly(raw);
  return digits.startsWith("82") ? `0${digits.slice(2)}` : digits;
}

export function matchesPhone(a: string, b: string): boolean {
  const da = localDigits(a);
  const db = localDigits(b);
  return da.length > 0 && da === db;
}

export function toE164(raw: string): string {
  const digits = digitsOnly(raw);
  if (digits.startsWith("82")) return `+${digits}`;
  if (digits.startsWith("0")) return `+82${digits.slice(1)}`;
  return `+${digits}`;
}

// 010-****-5678 형식으로 마스킹해서 화면에 보여줄 때 쓴다.
export function maskPhone(raw: string): string {
  const digits = localDigits(raw);
  if (digits.length < 7) return raw;
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`;
}

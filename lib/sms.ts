import { toE164 } from "./phone";

/**
 * 서버(Vercel)에서 팀 맥미니의 게이트웨이(ollama-gateway/gateway.mjs)를 거쳐
 * Messages.app으로 SMS를 보낸다. 게이트웨이는 원래 Ollama 호출용으로 만든
 * 것을 /sms/send 경로만 추가해서 재사용한다(같은 터널·시크릿).
 */
export async function sendSms(phone: string, message: string): Promise<void> {
  const gatewayUrl = process.env.OLLAMA_GATEWAY_URL;
  const secret = process.env.OLLAMA_GATEWAY_SECRET;

  if (!gatewayUrl || !secret) {
    throw new Error(
      "서버에 OLLAMA_GATEWAY_URL / OLLAMA_GATEWAY_SECRET 환경변수가 설정되어 있지 않아요."
    );
  }

  const res = await fetch(`${gatewayUrl.replace(/\/$/, "")}/sms/send`, {
    method: "POST",
    signal: AbortSignal.timeout(20000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    body: JSON.stringify({ phone: toE164(phone), message }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`SMS 발송 실패 (${res.status}): ${text}`);
  }
}

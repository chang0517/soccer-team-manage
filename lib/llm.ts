export interface LlmParsedItem {
  name: string;
  goals: number;
  assists: number;
}

export interface LlmParseResult {
  scored: number | null;
  conceded: number | null;
  players: LlmParsedItem[];
}

const SYSTEM_PROMPT = `당신은 조기축구 경기 기록 메모를 정리하는 도우미입니다.
사용자가 붙여넣는 메모(쿼터별 득점/어시스트 기록, 최종 스코어 등)를 읽고
아래 형식의 JSON 객체 하나로만 답하세요. 설명, 코드블록, 다른 텍스트 없이
JSON만 출력하세요.

{
  "scored": 우리 팀 최종 득점(숫자) 또는 알 수 없으면 null,
  "conceded": 상대 팀 최종 실점(숫자) 또는 알 수 없으면 null,
  "players": [{"name":"메모에 적힌 이름 그대로","goals":숫자,"assists":숫자}]
}

규칙:
- players는 선수 이름별로 골 수와 어시스트 수를 합산하세요. 같은 선수가
  여러 번 나오면 하나로 합치세요. 골이나 어시스트가 없으면 0으로 두세요.
- scored/conceded는 메모에 "3:0", "3-0 승", "무실점", "클린시트",
  "실점 없음"처럼 최종 스코어나 클린시트 여부가 명시된 경우에만 채우고,
  추측하지 마세요. 클린시트/무실점이라는 표현만 있고 우리 팀 득점이
  명시 안 됐으면 conceded만 0으로 채우고 scored는 null로 두세요.
  메모에 스코어 정보가 전혀 없으면 둘 다 null로 두세요.`;

/** 마지막 항목 뒤에 쉼표를 남기고 바로 닫는 것처럼, 로컬 모델이 자주
 * 저지르는 흔한 JSON 문법 실수를 표준 JSON.parse가 받아들이기 전에
 * 고쳐본다. */
function repairJson(text: string): string {
  return text.replace(/,(\s*[}\]])/g, "$1"); // trailing comma
}

export function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("응답에서 JSON을 찾지 못했어요.");
  }
  const candidate = cleaned.slice(start, end + 1);
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    try {
      parsed = JSON.parse(repairJson(candidate));
    } catch (e2) {
      throw new Error(
        `응답이 올바른 JSON이 아니에요: ${e2 instanceof Error ? e2.message : String(e2)}`
      );
    }
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("응답이 올바른 JSON 객체가 아니에요.");
  }
  return parsed as Record<string, unknown>;
}

function toNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export interface GatewayMessage {
  role: "system" | "user";
  content: string;
}

/**
 * 서버(Vercel)에서 팀 맥미니의 Ollama 게이트웨이를 호출하고 응답 텍스트를
 * 반환한다. 게이트웨이는 Bearer 토큰으로 보호되어 있고, 내부적으로 로컬
 * Ollama의 OpenAI 호환 /v1/chat/completions로 요청을 그대로 전달한다.
 * 브라우저가 아니라 서버가 호출하므로 사용자는 어떤 기기에서든 쓸 수 있다.
 */
export async function callOllamaGateway(
  messages: GatewayMessage[],
  timeoutMs = 45000
): Promise<string> {
  const gatewayUrl = process.env.OLLAMA_GATEWAY_URL;
  const secret = process.env.OLLAMA_GATEWAY_SECRET;
  const model = process.env.OLLAMA_MODEL || "gemma4";

  if (!gatewayUrl || !secret) {
    throw new Error(
      "서버에 OLLAMA_GATEWAY_URL / OLLAMA_GATEWAY_SECRET 환경변수가 설정되어 있지 않아요."
    );
  }

  const res = await fetch(gatewayUrl.replace(/\/$/, ""), {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${secret}`,
    },
    // JSON 모드를 강제해서 앞뒤에 설명이나 코드블록을 덧붙이는 것 같은
    // 형식 이탈을 최대한 줄인다(스키마 자체를 보장하진 않지만, 최소한
    // 파싱 가능한 JSON 객체 하나만 나오게는 해준다).
    body: JSON.stringify({
      model,
      stream: false,
      messages,
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    throw new Error(`게이트웨이 응답 오류 (HTTP ${res.status})`);
  }
  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("응답에서 내용을 찾지 못했어요.");
  return content;
}

/**
 * 경기 기록 메모를 팀 맥미니의 Ollama 게이트웨이로 파싱한다.
 */
export async function parseMatchNotesViaGateway(
  notes: string
): Promise<LlmParseResult> {
  const content = await callOllamaGateway([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: notes },
  ]);
  const obj = extractJsonObject(content);
  const rawPlayers = Array.isArray(obj.players) ? obj.players : [];
  const players: LlmParsedItem[] = rawPlayers
    .filter(
      (it): it is { name: string; goals?: number; assists?: number } =>
        !!it && typeof (it as { name?: unknown }).name === "string"
    )
    .map((it) => ({
      name: it.name,
      goals: Number(it.goals) || 0,
      assists: Number(it.assists) || 0,
    }));
  return {
    scored: toNullableNumber(obj.scored),
    conceded: toNullableNumber(obj.conceded),
    players,
  };
}

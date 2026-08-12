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

/** 로컬 모델이 같은 짧은 토큰(단어)을 수백 번 반복하며 폭주하는 경우를
 * 감지한다(예: "wall_wall_wall_..."). 이런 응답은 JSON 문법을 아무리
 * 손봐도 고칠 수 없는 근본적으로 망가진 생성이라 별도로 잡아낸다. */
export function looksDegenerate(text: string): boolean {
  return /(.{2,20}?)\1{9,}/.test(text);
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
/** 게이트웨이가 호출할 모델명. 진행 상황 표시 등 다른 곳에서도 같은 값을
 * 쓸 수 있게 별도로 내보낸다. */
export function getConfiguredModel(): string {
  return process.env.OLLAMA_MODEL || "gemma4";
}

export async function callOllamaGateway(
  messages: GatewayMessage[],
  timeoutMs = 45000,
  // 로컬 모델이 같은 토큰을 반복하며 폭주할 때 응답 전체를 무한정 길게
  // 만들지 않도록 상한을 둔다 — 이 스키마들이 실제로 필요로 하는 양보다
  // 훨씬 넉넉하지만, 폭주 시 시간 예산을 통째로 잡아먹는 것은 막는다.
  maxTokens = 4000
): Promise<string> {
  const gatewayUrl = process.env.OLLAMA_GATEWAY_URL;
  const secret = process.env.OLLAMA_GATEWAY_SECRET;
  const model = getConfiguredModel();

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
    //
    // reasoning_effort: "none" — Gemma 4 / GLM-4.7처럼 "생각하는" 모델이
    // 답을 내기 전에 reasoning 토큰을 길게 쓰다가 max_tokens에 걸려 정작
    // 답을 못 내거나(빈 content), 그 과정에서 스키마와 무관한 이상한 내용을
    // 만드는 걸 봐서 아예 꺼둔다. boolean(false)이 아니라 문자열이어야
    // 한다 — boolean을 주면 Ollama가 타입 에러를 낸다. non-reasoning
    // 모델에는 무시되는 필드라 안전하다.
    body: JSON.stringify({
      model,
      stream: false,
      messages,
      response_format: { type: "json_object" },
      max_tokens: maxTokens,
      reasoning_effort: "none",
    }),
  });
  if (!res.ok) {
    throw new Error(`게이트웨이 응답 오류 (HTTP ${res.status})`);
  }
  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  const content: string | undefined = message?.content;
  if (!content) {
    // "생각하는" 모델은 답을 내기 전에 reasoning 토큰을 먼저 쓰는데,
    // max_tokens에 걸려 실제 답변을 못 내는 경우가 있다. 원인을 바로
    // 알 수 있게 finish_reason과 reasoning 미리보기를 에러에 남긴다.
    const finishReason = data?.choices?.[0]?.finish_reason;
    const reasoning = message?.reasoning_content ?? message?.reasoning;
    throw new Error(
      `응답에서 내용을 찾지 못했어요. finish_reason=${finishReason ?? "?"} reasoning=${
        typeof reasoning === "string" ? reasoning.slice(0, 300) : "(없음)"
      }`
    );
  }
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

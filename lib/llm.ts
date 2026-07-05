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

function extractJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("응답에서 JSON을 찾지 못했어요.");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
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

/**
 * 브라우저에서 직접 로컬 LLM(OpenAI 호환 /v1/chat/completions)을 호출한다.
 * 이 앱은 Vercel(클라우드)에 배포되어 있어 서버에서는 사용자의 localhost에
 * 접근할 수 없다 — 그래서 이 요청은 반드시 사용자의 브라우저(그 LLM이
 * 실행 중인 바로 그 컴퓨터)에서 클라이언트 사이드로 나가야 한다.
 */
export async function parseMatchNotesWithLocalLlm(
  endpoint: string,
  model: string,
  notes: string
): Promise<LlmParseResult> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: notes },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`로컬 LLM 응답 오류 (HTTP ${res.status})`);
  }
  const data = await res.json();
  const content: string | undefined = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("응답에서 내용을 찾지 못했어요.");
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

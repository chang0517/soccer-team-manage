export interface LlmParsedItem {
  name: string;
  goals: number;
  assists: number;
}

const SYSTEM_PROMPT = `당신은 조기축구 경기 기록 메모를 정리하는 도우미입니다.
사용자가 붙여넣는 메모(쿼터별 득점/어시스트 기록)를 읽고, 선수 이름별로
골 수와 어시스트 수를 합산해서 JSON 배열로만 답하세요.
형식: [{"name":"메모에 적힌 이름 그대로","goals":숫자,"assists":숫자}]
설명, 코드블록, 다른 텍스트 없이 JSON 배열만 출력하세요.
같은 선수가 여러 번 나오면 하나로 합산하세요. 골이나 어시스트가 없으면
그 항목은 goals 또는 assists를 0으로 두세요.`;

function extractJsonArray(text: string): unknown[] {
  const cleaned = text.trim();
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("응답에서 JSON 배열을 찾지 못했어요.");
  }
  const parsed = JSON.parse(cleaned.slice(start, end + 1));
  if (!Array.isArray(parsed)) throw new Error("응답이 배열 형식이 아니에요.");
  return parsed;
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
): Promise<LlmParsedItem[]> {
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
  const items = extractJsonArray(content);
  return items
    .filter(
      (it): it is { name: string; goals?: number; assists?: number } =>
        !!it && typeof (it as { name?: unknown }).name === "string"
    )
    .map((it) => ({
      name: it.name,
      goals: Number(it.goals) || 0,
      assists: Number(it.assists) || 0,
    }));
}

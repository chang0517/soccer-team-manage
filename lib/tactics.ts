import { callOllamaGateway, extractJsonObject } from "./llm";
import type { TacticsArrow, TacticsPlayer, TacticsScene, TacticsStep } from "./types";

const MAX_PLAYERS = 8;
const MAX_STEPS = 8;

// 좌표계는 스쿼드 화면(lib/squad.ts의 FORMATION_SLOTS)과 동일: 세로로 긴
// 축구장을 위에서 내려다본 기준으로 x 0~100(왼쪽~오른쪽), y 0~100
// (상대 골대 쪽 0 ~ 우리 골대 쪽 100, 즉 공격은 y가 작아지는 방향).
const SYSTEM_PROMPT = `당신은 조기축구 팀의 전술 상황을 애니메이션으로 보여주기 위한
장면 데이터를 만드는 도우미입니다. 사용자가 텍스트로 설명하는 축구 상황을
아래 JSON 스키마 하나로만 답하세요. 설명, 코드블록, 다른 텍스트 없이 JSON
객체만 출력하세요.

{
  "title": "상황을 한 줄로 요약한 제목",
  "players": [
    { "id": "p1", "team": "A", "label": "선수 역할(예: 오른쪽 풀백)" }
  ],
  "hasBall": true,
  "steps": [
    {
      "note": "이 장면에서 무슨 일이 일어나는지 한 문장 설명",
      "positions": {
        "p1": { "x": 80, "y": 70 },
        "ball": { "x": 78, "y": 68 }
      },
      "arrows": [
        { "from": "p1", "to": { "x": 90, "y": 40 } }
      ]
    }
  ]
}

규칙:
- 좌표는 세로로 긴 축구장을 위에서 내려다본 기준입니다. x는 왼쪽(0)~
  오른쪽(100), y는 우리 팀 골대 쪽(100, 아래)에서 상대 팀 골대 쪽(0, 위)
  까지입니다. 즉 공격은 y가 작아지는 방향입니다.
- 등장인물은 상황 설명에 나온 핵심 인물만 3~5명으로 제한하세요(전체 22명을
  다 그리지 마세요). team은 우리 팀이면 "A", 상대 팀이면 "B"로 표시하세요.
- steps는 상황이 전개되는 순서대로 2~4개의 장면(키프레임)으로 나누세요.
  각 step의 positions에는 등장하는 모든 players와(공을 쓰는 상황이면)
  "ball"의 그 시점 좌표를 전부 포함하세요 — 이전 step과 위치가 같아도
  생략하지 말고 그대로 다시 적으세요. 응답은 최대한 간결하게, 스키마에
  없는 필드나 부가 설명 없이 딱 이 구조로만 채우세요.
- arrows는 그 step에서 다음 위치로 움직이는 걸 화면에 화살표로 보여주고
  싶을 때만 넣으세요(선택 사항, 없으면 빈 배열).
- 공이 등장하는 상황이면 hasBall을 true로 하고 모든 step의 positions에
  "ball" 좌표를 포함하세요. 공이 중요하지 않은 상황이면 hasBall을 false로
  하고 ball은 넣지 마세요.
- 설명이 모호하거나 구체적인 좌표를 알 수 없어도, 축구 상식에 맞게
  합리적으로 추측해서 채우세요. null이나 빈 값은 쓰지 마세요.`;

function clampCoord(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function isPos(v: unknown): v is { x: number; y: number } {
  return (
    typeof v === "object" &&
    v !== null &&
    "x" in v &&
    "y" in v
  );
}

/**
 * 게이트웨이(로컬 LLM)가 돌려준 값을 신뢰하지 않고 스키마에 맞게 정리한다.
 * 필드가 비었거나 형식이 어긋나면 잘라내거나 합리적인 값으로 채운다 —
 * 애니메이션 컴포넌트가 항상 완전한 데이터를 받도록 보장한다.
 */
function sanitizeScene(raw: Record<string, unknown>): TacticsScene {
  const rawPlayers = Array.isArray(raw.players) ? raw.players : [];
  const players: TacticsPlayer[] = rawPlayers
    .filter(
      (p): p is Record<string, unknown> =>
        !!p && typeof p === "object" && typeof (p as { id?: unknown }).id === "string"
    )
    .slice(0, MAX_PLAYERS)
    .map((p) => ({
      id: p.id as string,
      team: p.team === "B" ? "B" : "A",
      label: typeof p.label === "string" && p.label.trim() ? p.label.trim() : "선수",
    }));
  if (players.length === 0) {
    throw new Error("등장 인물을 만들지 못했어요. 상황을 조금 더 구체적으로 설명해 주세요.");
  }

  const hasBall = raw.hasBall === true;
  const knownIds = new Set(players.map((p) => p.id));
  if (hasBall) knownIds.add("ball");

  const rawSteps = Array.isArray(raw.steps) ? raw.steps : [];
  const lastKnownPos = new Map<string, { x: number; y: number }>();
  const steps: TacticsStep[] = rawSteps.slice(0, MAX_STEPS).map((s, stepIdx) => {
    const stepObj = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const rawPositions =
      stepObj.positions && typeof stepObj.positions === "object"
        ? (stepObj.positions as Record<string, unknown>)
        : {};

    const positions: Record<string, { x: number; y: number }> = {};
    for (const id of knownIds) {
      const p = rawPositions[id];
      const fallback = lastKnownPos.get(id) ?? { x: 50, y: 50 };
      const resolved = isPos(p)
        ? { x: clampCoord(p.x, fallback.x), y: clampCoord(p.y, fallback.y) }
        : fallback;
      positions[id] = resolved;
      lastKnownPos.set(id, resolved);
    }

    const rawArrows = Array.isArray(stepObj.arrows) ? stepObj.arrows : [];
    const arrows: TacticsArrow[] = rawArrows
      .filter(
        (a): a is Record<string, unknown> =>
          !!a &&
          typeof a === "object" &&
          typeof (a as { from?: unknown }).from === "string" &&
          knownIds.has((a as { from: string }).from) &&
          isPos((a as { to?: unknown }).to)
      )
      .slice(0, 6)
      .map((a) => {
        const to = a.to as { x: number; y: number };
        return {
          from: a.from as string,
          to: { x: clampCoord(to.x, 50), y: clampCoord(to.y, 50) },
        };
      });

    return {
      note: typeof stepObj.note === "string" ? stepObj.note : `${stepIdx + 1}단계`,
      positions,
      arrows,
    };
  });
  if (steps.length === 0) {
    throw new Error("장면을 만들지 못했어요. 상황을 조금 더 구체적으로 설명해 주세요.");
  }

  return {
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim() : "전술 상황",
    players,
    hasBall,
    steps,
  };
}

export async function generateTacticsScene(description: string): Promise<TacticsScene> {
  const content = await callOllamaGateway(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: description },
    ],
    // 이 생성은 요청-응답을 붙잡지 않고 백그라운드 작업(job)으로 도니까
    // 경기 기록 파싱보다 훨씬 넉넉하게 잡아도 된다 — 라우트 maxDuration(120s)
    // 보다 짧게 잡아 작업 상태 기록 여유를 남긴다.
    110000
  );
  return sanitizeScene(extractJsonObject(content));
}

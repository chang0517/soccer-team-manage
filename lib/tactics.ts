import { callOllamaGateway, extractJsonObject } from "./llm";
import { DEFAULT_ZONE, PITCH_ZONES, ZONE_LEGEND } from "./tacticsZones";
import type { TacticsArrow, TacticsPlayer, TacticsScene, TacticsStep } from "./types";

const MAX_PLAYERS = 8;
const MAX_STEPS = 10;

// 좌표계·구역 정의는 lib/tacticsZones.ts를 참고(화면 안내와 공유). 로컬
// 모델이 연속적인 숫자 좌표를 직접 계산하게 하면 값이 겹치거나 튀는 경우가
// 잦았다(분류가 아니라 회귀 문제라 훨씬 어려움) — 그래서 숫자 대신 미리
// 정해둔 15개 구역 코드만 고르게 한다.

const SYSTEM_PROMPT = `당신은 조기축구 팀의 전술 상황을 애니메이션으로 보여주기 위한
장면 데이터를 만드는 도우미입니다. 사용자가 텍스트로 설명하는 축구 상황을
아래 JSON 스키마 하나로만 답하세요. 설명, 코드블록, 다른 텍스트 없이 JSON
객체만 출력하세요.

경기장은 15개 구역으로 나뉘어 있습니다(세로 5단 A~E × 가로 3열 1~3).
공격 방향은 A쪽입니다(A가 상대 골문, E가 우리 골문). 위치는 항상 숫자
좌표가 아니라 아래 구역 코드 중 하나로만 표현하세요:
${ZONE_LEGEND}

{
  "title": "상황을 한 줄로 요약한 제목",
  "players": [
    { "id": "p1", "team": "A", "label": "선수 역할(예: 오른쪽 풀백)" }
  ],
  "hasBall": true,
  "steps": [
    {
      "note": "이 장면에서 무슨 일이 일어나는지 한 문장 설명",
      "positions": { "p1": "B3", "ball": "B3" },
      "arrows": [ { "from": "p1", "to": "A2" } ]
    }
  ]
}

규칙:
- 위치는 반드시 위 15개 구역 코드(A1~E3) 중 하나만 쓰세요. x,y 같은
  숫자 좌표는 절대 쓰지 마세요.
- 등장인물은 상황 설명에 나온 핵심 인물만 3~6명으로 제한하세요(전체 22명을
  다 그리지 마세요). team은 우리 팀이면 "A", 상대 팀이면 "B"로 표시하세요.
- steps 개수는 사용자가 설명한 동작 흐름을 잘 보여줄 수 있게 자유롭게
  정하세요(보통 2~6개, 최대 10개). 동작을 번호나 줄바꿈으로 나열했다면
  참고하되 억지로 그 개수에 딱 맞추려고 부자연스럽게 쪼개거나 합치지는
  마세요 — 중요한 건 개수가 아니라 흐름이 말이 되는 것입니다.
- 등장하는 모든 선수는 매 step마다 그 상황에 맞게 구역이 자연스럽게
  이어져야 합니다. 다음에 중요한 역할을 할 선수는 미리 그 방향의 인접
  구역으로 조금씩 다가가듯 만드세요 — 같은 선수가 한 번에 A열에서
  E열로 건너뛰는 식으로 튀면 안 됩니다.
- 골을 넣는 장면이 있다면, 그 슛을 쏘는 선수와 공은 그 step에서
  "A1"/"A2"/"A3"(상대 골문 앞) 중 하나에 있어야 합니다.
- 각 step의 positions에는 등장하는 모든 players와(공을 쓰는 상황이면)
  "ball"의 그 시점 구역을 전부 포함하세요 — 이전 step과 구역이 같아도
  생략하지 말고 그대로 다시 적으세요. 스키마에 없는 필드나 부가 설명
  없이 딱 이 구조로만 채우세요.
- arrows는 그 step에서 다음 구역으로 움직이는 걸 화면에 화살표로 보여주고
  싶을 때만 넣으세요(선택 사항, 없으면 빈 배열). to는 구역 코드입니다.
- 공이 등장하는 상황이면 hasBall을 true로 하고 모든 step의 positions에
  "ball" 구역을 포함하세요. 공이 중요하지 않은 상황이면 hasBall을 false로
  하고 ball은 넣지 마세요.
- 설명이 모호해도, 축구 상식에 맞게 가장 가까운 구역으로 합리적으로
  추측해서 채우세요. null이나 빈 값은 쓰지 마세요.

예시 — 사용자가 이렇게 설명하면:
"우측 윙백이 가운데 미드에게 패스하고 상대 진영으로 침투한다. 미드가
다시 그 윙백에게 패스하고, 윙백이 스트라이커에게 연결해서 스트라이커가
골을 넣는다."

{
  "title": "우측 윙백-미드 연계 후 스트라이커 마무리",
  "players": [
    { "id": "p1", "team": "A", "label": "우측 윙백" },
    { "id": "p2", "team": "A", "label": "중앙 미드필더" },
    { "id": "p3", "team": "A", "label": "스트라이커" }
  ],
  "hasBall": true,
  "steps": [
    { "note": "우측 윙백이 중앙 미드에게 패스", "positions": {"p1":"C3","p2":"C2","p3":"B2","ball":"C3"}, "arrows": [{"from":"p1","to":"C2"}] },
    { "note": "패스 후 윙백이 상대 진영으로 침투", "positions": {"p1":"B3","p2":"C2","p3":"B2","ball":"C2"}, "arrows": [{"from":"p1","to":"B3"}] },
    { "note": "미드가 침투한 윙백에게 다시 패스", "positions": {"p1":"B3","p2":"C2","p3":"A2","ball":"B3"}, "arrows": [{"from":"p2","to":"B3"}] },
    { "note": "윙백이 패스를 받아 스트라이커에게 연결", "positions": {"p1":"B3","p2":"C2","p3":"A2","ball":"A2"}, "arrows": [{"from":"p1","to":"A2"}] },
    { "note": "스트라이커가 골을 넣는다", "positions": {"p1":"B3","p2":"C2","p3":"A2","ball":"A2"}, "arrows": [] }
  ]
}

스트라이커(p3)가 매 step마다 골문 쪽 구역(B2 → A2)으로 자연스럽게 이동해서
마지막 골 장면에서 A열에 있는 것에 주목하세요 — 이렇게 모든 선수의 구역이
매 step마다 자연스럽게 이어지도록 움직여야 합니다.`;

function clampCoord(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

function isPos(v: unknown): v is { x: number; y: number } {
  return typeof v === "object" && v !== null && "x" in v && "y" in v;
}

/** 구역 코드("B3") 또는(구식 호환용) {x,y} 객체를 실제 좌표로 바꾼다.
 * 둘 다 아니면 fallback을 쓴다. */
function resolveZoneOrPos(
  v: unknown,
  fallback: { x: number; y: number }
): { x: number; y: number } {
  if (typeof v === "string") {
    const zone = PITCH_ZONES[v.trim().toUpperCase()];
    if (zone) return { x: zone.x, y: zone.y };
    return fallback;
  }
  if (isPos(v)) {
    return { x: clampCoord(v.x, fallback.x), y: clampCoord(v.y, fallback.y) };
  }
  return fallback;
}

/**
 * 로컬 모델이 서로 다른 선수/공에 거의 같은 좌표를 주는 경우가 있어서
 * (라벨이 겹쳐 보이고 애니메이션도 안 움직이는 것처럼 보임), 같은 step
 * 안에서 너무 가까운 좌표끼리는 원 모양으로 살짝 벌려서 항상 구분되게
 * 만든다. 같은 구역을 고른 선수가 여럿이면 자주 발생하므로 여전히 필요.
 */
function separateOverlaps(positions: Record<string, { x: number; y: number }>) {
  const OVERLAP_DIST = 3;
  const NUDGE_RADIUS = 4.5;
  const ids = Object.keys(positions);
  const visited = new Set<string>();
  for (const id of ids) {
    if (visited.has(id)) continue;
    const base = positions[id];
    const group = ids.filter(
      (other) =>
        !visited.has(other) &&
        Math.abs(positions[other].x - base.x) <= OVERLAP_DIST &&
        Math.abs(positions[other].y - base.y) <= OVERLAP_DIST
    );
    if (group.length < 2) {
      visited.add(id);
      continue;
    }
    group.forEach((memberId, i) => {
      visited.add(memberId);
      const angle = (2 * Math.PI * i) / group.length;
      positions[memberId] = {
        x: clampCoord(base.x + NUDGE_RADIUS * Math.cos(angle), base.x),
        y: clampCoord(base.y + NUDGE_RADIUS * Math.sin(angle), base.y),
      };
    });
  }
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
  const defaultPos = PITCH_ZONES[DEFAULT_ZONE];
  const lastKnownPos = new Map<string, { x: number; y: number }>();
  const steps: TacticsStep[] = rawSteps.slice(0, MAX_STEPS).map((s, stepIdx) => {
    const stepObj = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const rawPositions =
      stepObj.positions && typeof stepObj.positions === "object"
        ? (stepObj.positions as Record<string, unknown>)
        : {};

    const positions: Record<string, { x: number; y: number }> = {};
    for (const id of knownIds) {
      const fallback = lastKnownPos.get(id) ?? { x: defaultPos.x, y: defaultPos.y };
      const resolved = resolveZoneOrPos(rawPositions[id], fallback);
      positions[id] = resolved;
      lastKnownPos.set(id, resolved);
    }
    separateOverlaps(positions);
    for (const id of knownIds) lastKnownPos.set(id, positions[id]);

    const rawArrows = Array.isArray(stepObj.arrows) ? stepObj.arrows : [];
    const arrows: TacticsArrow[] = rawArrows
      .filter(
        (a): a is Record<string, unknown> =>
          !!a &&
          typeof a === "object" &&
          typeof (a as { from?: unknown }).from === "string" &&
          knownIds.has((a as { from: string }).from) &&
          (typeof (a as { to?: unknown }).to === "string" || isPos((a as { to?: unknown }).to))
      )
      .slice(0, 6)
      .map((a) => ({
        from: a.from as string,
        to: resolveZoneOrPos(a.to, defaultPos),
      }));

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

export interface TacticsGenerationResult {
  scene: TacticsScene;
  raw: string;
}

/**
 * raw 응답 텍스트를 함께 반환한다(성공 시), 실패해도 호출부가 raw를 볼 수
 * 있도록 에러 객체에 raw를 붙여서 던진다 — 결과물이 이상할 때 운영진이
 * 모델이 실제로 뭘 뱉었는지 디버그 화면에서 바로 확인할 수 있게 하기 위함.
 */
export async function generateTacticsScene(
  description: string
): Promise<TacticsGenerationResult> {
  const raw = await callOllamaGateway(
    [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: description },
    ],
    // 이 생성은 요청-응답을 붙잡지 않고 백그라운드 작업(job)으로 돈다.
    // 라우트 maxDuration(Vercel Hobby 플랜 상한인 300s)보다 짧게 잡아
    // 작업 상태 기록 여유를 남긴다.
    280000
  );
  try {
    const scene = sanitizeScene(extractJsonObject(raw));
    return { scene, raw };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    (err as Error & { raw?: string }).raw = raw;
    throw err;
  }
}

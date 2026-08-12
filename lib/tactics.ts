import { callOllamaGateway, extractJsonObject, looksDegenerate } from "./llm";
import { DEFAULT_ZONE, GOAL_ZONE_LEGEND, PITCH_ZONES, ZONE_LEGEND } from "./tacticsZones";
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
      "arrows": [ { "from": "p1", "to": "A2", "kind": "pass" } ]
    }
  ]
}

규칙:
- 위치는 반드시 위 15개 구역 코드(A1~E3) 중 하나만 쓰세요. x,y 같은
  숫자 좌표는 절대 쓰지 마세요.
- **가장 중요한 규칙**: 사용자가 설명에서 특정 인물의 위치를 구역 코드로
  명시했다면(예: "A2에 있는 스트라이커", "B3의 윙백"), 그 인물은 반드시
  첫 step부터 정확히 그 구역에 있어야 합니다. 다른 구역으로 바꾸거나
  다른 인물과 같은 구역에 겹쳐두면 안 됩니다 — 사용자가 지정한 구역이
  당신의 판단보다 항상 우선합니다.
- 등장인물은 상황 설명에 나온 핵심 인물만 3~6명으로 제한하세요(전체 22명을
  다 그리지 마세요). team은 우리 팀이면 "A", 상대 팀이면 "B"로 표시하세요.
  같은 팀 선수들이라도 서로 다른 구역에서 시작하는 게 자연스럽습니다 —
  특별한 이유 없이 여러 선수를 같은 구역에 몰아넣지 마세요.
- **steps의 맨 첫 번째 항목은 반드시 "준비 상태"입니다.** 모든 선수와
  공이 어떤 동작도 시작되기 전의 시작 위치에 있고, arrows는 빈 배열
  []이어야 합니다(note는 "시작 위치" 같은 식으로). 이렇게 해야 첫 번째
  패스도 다른 패스들과 똑같이 "출발 → 도착"으로 화면에서 움직이는 걸로
  보입니다 — 준비 상태 없이 바로 "패스 완료된 상태"부터 시작하면 공이
  처음부터 도착 지점에 가 있는 것처럼 보여서 잘못됩니다.
- 그 다음부터 **step 하나 = "공이 한 번 이동하는 동작"**입니다. 패스
  하나, 슛 하나가 각각 하나의 step이 되도록 나누세요. 각 step은 화살표를
  정확히 하나만 가지고(공을 가진/차는 선수 → 공이 도착하는 구역), 그
  step이 끝나는 시점에는 공이 반드시 그 화살표의 도착 구역에 있어야
  합니다. 애니메이션에서 공이 그 화살표를 따라 움직이는 것처럼 보이도록
  만드는 게 목표입니다.
- 패스를 받으러 미리 침투하는 선수가 있다면, "뛰어가는 동작"을 별도
  step으로 쪼개지 마세요. 공이 그 공간에 도착하는 바로 그 step 안에서
  그 선수도 이미 그 구역에 도착해 있는 것으로 **반드시 함께** 표현하세요
  — 선수를 이전 step 그대로 놔둔 채 공만 옮기면 안 됩니다. "선수 이동"과
  "공 도착"은 항상 같은 step에서 동시에 완성되어야 합니다.
- steps 개수는 "준비 상태 1개 + 사용자가 설명한 패스/슛 동작 수"만큼
  정하세요(예: 동작이 4번이면 step은 5개, 최대 10개).
- 골을 넣는 마지막 step에서는 **슛을 쏘는 선수**는 "A1"/"A2"/"A3"(상대
  골문 앞) 중 슛을 차는 위치에 그대로 두되, **공은 선수와 같은 구역에
  두지 말고** 실제로 골대 그물 안으로 들어간 것처럼 아래 골대 전용 구역
  중 하나로 옮기세요: ${GOAL_ZONE_LEGEND}. 이 구역들은 오직 골이 들어가는
  이 마지막 step의 공 위치로만 쓰고, 선수 위치나 다른 step에는 절대 쓰지
  마세요. 그 step에 화살표도 하나 넣어서(슛을 쏜 선수 → 공이 도착한 골대
  구역) 공이 슛 방향대로 골대 안으로 빨려 들어가는 움직임을 보여주세요.
- 각 step의 positions에는 등장하는 모든 players와(공을 쓰는 상황이면)
  "ball"의 그 시점 구역을 전부 포함하세요 — 이전 step과 구역이 같아도
  생략하지 말고 그대로 다시 적으세요. 스키마에 없는 필드나 부가 설명
  없이 딱 이 구조로만 채우세요.
- 공이 등장하는 상황이면 hasBall을 true로 하고 모든 step의 positions에
  "ball" 구역을 포함하세요. 공이 중요하지 않은 상황이면 hasBall을 false로
  하고 ball은 넣지 마세요.
- 설명이 모호해도, 축구 상식에 맞게 가장 가까운 구역으로 합리적으로
  추측해서 채우세요. null이나 빈 값은 쓰지 마세요.
- 화살표(arrows)에는 항상 "kind"를 넣으세요: 패스나 슛이면 "pass",
  상대 팀 선수에게서 공을 빼앗는(인터셉트·태클·볼 경합) 장면이면
  "steal"로 표시하세요. 화면에서 "steal"은 패스와 다른 색으로 그려져서
  단순 패스가 아니라 공을 뺏어온 순간이라는 게 바로 보입니다. 상대가
  공을 잃는 상황이 설명에 있으면, 그 상대 선수도 team "B"로 players에
  포함시키고 첫 step에서 공을 그 상대 선수와 같은 구역에 두세요. 그
  다음 공을 뺏는 step에서는 다른 패스와 마찬가지로 "from"을 **공을
  뺏기기 직전에 갖고 있던 상대(team "B") 선수 id**로, "to"를 공을
  뺏은 직후 위치(우리 선수가 있는 구역)로, "kind"를 "steal"로 채우세요
  (예: {"from":"o1","to":"C2","kind":"steal"} — "공이 상대 o1에게서
  C2로 이동했다"는 뜻). 상대 team "B" 선수는 공을 뺏긴 뒤에는 그 자리에
  그대로 둬도 됩니다 — 이후 계속 움직일 필요는 없습니다.

예시 — 사용자가 이렇게 구역을 직접 지정해서 설명하면:
"B3에 있는 오른쪽 윙백이 근처 B2의 미드필더에게 패스를 주고 그대로 앞쪽
A3 공간으로 전진 침투한다. 미드필더는 원터치로 A3의 윙백에게 다시
벽패스를 내준다. 패스를 받은 윙백은 A2에 있는 스트라이커에게 올려주고,
스트라이커가 마무리한다."

이 설명에는 패스/슛 동작이 4번 있습니다: ①윙백→미드 패스, ②미드가 A3
공간으로 리턴 패스(동시에 윙백이 그 공간으로 침투), ③윙백→스트라이커
연결, ④스트라이커 슛. 그래서 step은 "준비 상태" 1개 + 동작 4개 = 총
5개입니다:

{
  "title": "우측 윙백-미드 벽패스 후 스트라이커 마무리",
  "players": [
    { "id": "p1", "team": "A", "label": "오른쪽 윙백" },
    { "id": "p2", "team": "A", "label": "중앙 미드필더" },
    { "id": "p3", "team": "A", "label": "스트라이커" }
  ],
  "hasBall": true,
  "steps": [
    { "note": "시작 위치", "positions": {"p1":"B3","p2":"B2","p3":"A2","ball":"B3"}, "arrows": [] },
    { "note": "윙백이 미드필더에게 패스", "positions": {"p1":"B3","p2":"B2","p3":"A2","ball":"B2"}, "arrows": [{"from":"p1","to":"B2","kind":"pass"}] },
    { "note": "미드필더가 A3 공간으로 리턴 패스, 윙백이 침투해 받는다", "positions": {"p1":"A3","p2":"B2","p3":"A2","ball":"A3"}, "arrows": [{"from":"p2","to":"A3","kind":"pass"}] },
    { "note": "윙백이 스트라이커에게 연결", "positions": {"p1":"A3","p2":"B2","p3":"A2","ball":"A2"}, "arrows": [{"from":"p1","to":"A2","kind":"pass"}] },
    { "note": "스트라이커가 슛으로 마무리", "positions": {"p1":"A3","p2":"B2","p3":"A2","ball":"GC"}, "arrows": [{"from":"p3","to":"GC","kind":"pass"}] }
  ]
}

첫 step("시작 위치")에서 공은 윙백(p1)과 같은 B3에 있고 화살표가 없습니다
— 그 다음 step에서야 공이 B2로 이동하며 화살표를 따라가는 것처럼
보입니다. 두 번째 동작(리턴 패스)에서는 공만 A3로 옮긴 게 아니라
윙백(p1)의 위치도 B3에서 A3로 함께 바뀐 것에 주목하세요 — 선수를 이전
자리에 그대로 두면 안 됩니다. 마지막 step에서는 스트라이커(p3)는 슛을
찬 자리인 A2에 그대로 있고, 공만 골대 전용 구역인 "GC"(골대 안 중앙)로
이동한 것에 주목하세요 — 공을 스트라이커와 같은 A2에 두면 그냥 "골문
앞에 서 있는" 그림이 되어버려서, 실제로 골대 안으로 들어간 걸 보여주지
못합니다.

"공을 뺏는다"가 들어간 예시 — "C2에서 수비형 미드필더가 상대 공격을
끊어 공을 잡는다"라면, 상대 선수를 team "B"로 하나 추가하고 첫 step에서
공을 그 상대 선수와 같은 구역에 둡니다. 그리고 뺏는 step의 화살표는
kind를 "steal"로 표시합니다:

{
  "players": [
    { "id": "p1", "team": "A", "label": "수비형 미드필더" },
    { "id": "o1", "team": "B", "label": "상대 공격수" }
  ],
  "steps": [
    { "note": "시작 위치", "positions": {"p1":"C1","o1":"C2","ball":"C2"}, "arrows": [] },
    { "note": "수비형 미드필더가 공을 끊는다", "positions": {"p1":"C2","o1":"C2","ball":"C2"}, "arrows": [{"from":"o1","to":"C2","kind":"steal"}] }
  ]
}`;

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
 * 로컬 모델이 서로 다른 선수에게 거의 같은 좌표를 주는 경우가 있어서
 * (라벨이 겹쳐 보이고 애니메이션도 안 움직이는 것처럼 보임), 같은 step
 * 안에서 너무 가까운 좌표끼리는 원 모양으로 살짝 벌려서 항상 구분되게
 * 만든다. 같은 구역을 고른 선수가 여럿이면 자주 발생하므로 여전히 필요.
 *
 * "ball"은 일부러 대상에서 뺀다 — 공이 어떤 선수와 같은 구역이라는 건
 * "그 선수가 공을 갖고 있다"는 뜻이라 그 선수 위치에 그대로 겹쳐 있어야
 * 자연스럽다. 억지로 옆으로 밀어내면 패스 화살표가 시작점이랑 안 맞아
 * 보인다.
 */
function separateOverlaps(positions: Record<string, { x: number; y: number }>) {
  const OVERLAP_DIST = 3;
  const NUDGE_RADIUS = 4.5;
  const ids = Object.keys(positions).filter((id) => id !== "ball");
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
 * 로컬 모델이 가끔 선수 id를 오타로 쓴다(예: "p1" 대신 "t1") — 실제로
 * 이 오타 때문에 그 선수만 이전 step 위치에 멈춰 있고 공만 이동한 것처럼
 * 보이는 버그가 있었다(정상 id가 없으니 lastKnownPos로 그냥 fallback돼서).
 * 그 step에서 knownIds 중 정확히 하나가 빠져 있고 knownIds에 없는 낯선
 * 키가 정확히 하나 있으면(1:1로 명확한 경우만) 그 낯선 키를 빠진 id의
 * 오타로 간주해서 값을 옮겨준다. 빠진 id가 여러 개거나 낯선 키가 여러
 * 개면 어느 게 어느 것의 오타인지 알 수 없으니 손대지 않는다.
 */
function recoverTypoKeys(
  rawPositions: Record<string, unknown>,
  knownIds: Set<string>
): Record<string, unknown> {
  const missing = [...knownIds].filter((id) => !(id in rawPositions));
  const stray = Object.keys(rawPositions).filter((key) => !knownIds.has(key));
  if (missing.length !== 1 || stray.length !== 1) return rawPositions;
  return { ...rawPositions, [missing[0]]: rawPositions[stray[0]] };
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
    const rawPositions = recoverTypoKeys(
      stepObj.positions && typeof stepObj.positions === "object"
        ? (stepObj.positions as Record<string, unknown>)
        : {},
      knownIds
    );

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
        kind: a.kind === "steal" ? ("steal" as const) : ("pass" as const),
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

// 시도 하나당 시간 예산 × 최대 시도 횟수가 라우트 maxDuration(Vercel Hobby
// 플랜 상한인 300s)보다 여유 있게 낮아야 한다(작업 상태 기록 시간도 필요).
const ATTEMPT_TIMEOUT_MS = 130000;
const MAX_ATTEMPTS = 2;
// 이 스키마(15개 구역 코드 기반)가 실제로 필요로 하는 JSON은 크지 않지만,
// "생각하는" 모델은 답을 내기 전에 reasoning 토큰을 먼저 상당히 쓸 수
// 있어서(2500으로는 부족해서 답변 전에 잘려버리는 걸 실제로 봤다) 넉넉히
// 잡되, 반복 루프 폭주로 무한정 길어지는 것만 막을 정도의 상한을 둔다.
const MAX_RESPONSE_TOKENS = 8000;

/**
 * raw 응답 텍스트를 함께 반환한다(성공 시), 실패해도 호출부가 raw를 볼 수
 * 있도록 에러 객체에 raw를 붙여서 던진다 — 결과물이 이상할 때 운영진이
 * 모델이 실제로 뭘 뱉었는지 디버그 화면에서 바로 확인할 수 있게 하기 위함.
 *
 * 로컬 모델은 가끔 같은 토큰을 반복하며 폭주하거나 JSON 문법을 깨뜨리는데,
 * 재시도 한 번으로 회복되는 경우가 많아서 최대 2번까지 시도한다.
 */
export async function generateTacticsScene(
  description: string
): Promise<TacticsGenerationResult> {
  let lastRaw = "";
  let lastError = new Error("생성에 실패했어요.");

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let raw: string;
    try {
      raw = await callOllamaGateway(
        [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: description },
        ],
        ATTEMPT_TIMEOUT_MS,
        MAX_RESPONSE_TOKENS
      );
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      continue;
    }
    lastRaw = raw;

    if (looksDegenerate(raw)) {
      lastError = new Error(
        "모델이 같은 단어를 반복하며 응답이 깨졌어요(반복 루프)."
      );
      continue;
    }

    try {
      const scene = sanitizeScene(extractJsonObject(raw));
      return { scene, raw };
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
    }
  }

  (lastError as Error & { raw?: string }).raw = lastRaw;
  throw lastError;
}

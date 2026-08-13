// 전술 시뮬레이터의 25구역 그리드 — 서버(lib/tactics.ts, LLM 프롬프트/파싱)와
// 클라이언트(app/tactics/page.tsx, 사용자에게 보여줄 안내)가 공유하는 값이라
// 게이트웨이 시크릿을 다루는 lib/llm.ts를 끌어오지 않는 별도 파일로 뺐다.
export interface TacticsZone {
  x: number;
  y: number;
  label: string;
}

// 세로 5단(A~E) × 가로 5열(1~5). 공격 방향은 A쪽(상대 골문), E가 우리 골문.
export const FIELD_ZONES: Record<string, TacticsZone> = {
  A1: { x: 10, y: 6, label: "상대 골문 앞 왼쪽" },
  A2: { x: 30, y: 6, label: "상대 골문 앞 왼쪽 중앙" },
  A3: { x: 50, y: 6, label: "상대 골문 앞 중앙" },
  A4: { x: 70, y: 6, label: "상대 골문 앞 오른쪽 중앙" },
  A5: { x: 90, y: 6, label: "상대 골문 앞 오른쪽" },
  B1: { x: 10, y: 27, label: "상대 진영 왼쪽" },
  B2: { x: 30, y: 27, label: "상대 진영 왼쪽 중앙" },
  B3: { x: 50, y: 27, label: "상대 진영 중앙" },
  B4: { x: 70, y: 27, label: "상대 진영 오른쪽 중앙" },
  B5: { x: 90, y: 27, label: "상대 진영 오른쪽" },
  C1: { x: 10, y: 50, label: "하프라인 왼쪽" },
  C2: { x: 30, y: 50, label: "하프라인 왼쪽 중앙" },
  C3: { x: 50, y: 50, label: "하프라인 중앙" },
  C4: { x: 70, y: 50, label: "하프라인 오른쪽 중앙" },
  C5: { x: 90, y: 50, label: "하프라인 오른쪽" },
  D1: { x: 10, y: 73, label: "우리 진영 왼쪽" },
  D2: { x: 30, y: 73, label: "우리 진영 왼쪽 중앙" },
  D3: { x: 50, y: 73, label: "우리 진영 중앙" },
  D4: { x: 70, y: 73, label: "우리 진영 오른쪽 중앙" },
  D5: { x: 90, y: 73, label: "우리 진영 오른쪽" },
  E1: { x: 10, y: 94, label: "우리 골문 앞 왼쪽" },
  E2: { x: 30, y: 94, label: "우리 골문 앞 왼쪽 중앙" },
  E3: { x: 50, y: 94, label: "우리 골문 앞 중앙" },
  E4: { x: 70, y: 94, label: "우리 골문 앞 오른쪽 중앙" },
  E5: { x: 90, y: 94, label: "우리 골문 앞 오른쪽" },
};

// 골이 들어가는 마지막 step 전용 구역 — A1~A5(골문 "앞")과는 별개로, 실제
// 골대 그물 안쪽 지점을 나타낸다. 슈터는 A1~A5에 남아있고 공만 이 구역
// 으로 이동해야 "슛이 골대 안으로 빨려 들어가는" 것처럼 보인다(공을
// 슈터와 같은 A열 구역에 두면 그냥 "골문 앞에 서 있는" 그림이 되어버림).
export const GOAL_ZONES: Record<string, TacticsZone> = {
  GL: { x: 43, y: 3, label: "골대 안 왼쪽" },
  GC: { x: 50, y: 3, label: "골대 안 중앙" },
  GR: { x: 57, y: 3, label: "골대 안 오른쪽" },
};

// zone-lookup(resolveZoneOrPos)이 코드 하나로 필드 구역과 골대 구역을
// 모두 찾을 수 있도록 합친 것. 사용자 안내 그리드(ZONE_ROWS×ZONE_COLS)는
// FIELD_ZONES만 순회하므로 GOAL_ZONES는 화면에는 노출되지 않는다(의도된
// 것 — 사용자가 직접 지정하는 위치가 아니라 모델이 마지막 슛 step에서만
// 쓰는 값).
export const PITCH_ZONES: Record<string, TacticsZone> = {
  ...FIELD_ZONES,
  ...GOAL_ZONES,
};

export const DEFAULT_ZONE = "C3";

// 화면에 표시할 때 쓰는 행(위→아래)·열(왼→오른) 순서.
export const ZONE_ROWS = ["A", "B", "C", "D", "E"] as const;
export const ZONE_COLS = ["1", "2", "3", "4", "5"] as const;

export const ZONE_LEGEND = Object.entries(FIELD_ZONES)
  .map(([code, z]) => `${code}=${z.label}`)
  .join(", ");

export const GOAL_ZONE_LEGEND = Object.entries(GOAL_ZONES)
  .map(([code, z]) => `${code}=${z.label}`)
  .join(", ");

// 아래 좌표 헬퍼들은 서버(lib/tactics.ts의 sanitizeScene, LLM 응답 정리용)와
// 클라이언트(전술 직접 만들기 화면의 실시간 미리보기용)가 똑같은 로직을
// 써야 두 경로에서 만든 장면이 항상 동일하게 그려진다 — 그래서 시크릿을
// 다루지 않는 이 파일에 둔다.

export function clampCoord(v: unknown, fallback: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(0, n));
}

export function isPos(v: unknown): v is { x: number; y: number } {
  return typeof v === "object" && v !== null && "x" in v && "y" in v;
}

/** 구역 코드("B3") 또는(구식 호환용) {x,y} 객체를 실제 좌표로 바꾼다.
 * 둘 다 아니면 fallback을 쓴다. */
export function resolveZoneOrPos(
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
 * 서로 다른 선수에게 거의 같은 좌표가 주어지는 경우(라벨이 겹쳐 보이고
 * 애니메이션도 안 움직이는 것처럼 보임), 같은 step 안에서 너무 가까운
 * 좌표끼리는 원 모양으로 살짝 벌려서 항상 구분되게 만든다.
 *
 * "ball"은 일부러 대상에서 뺀다 — 공이 어떤 선수와 같은 구역이라는 건
 * "그 선수가 공을 갖고 있다"는 뜻이라 그 선수 위치에 그대로 겹쳐 있어야
 * 자연스럽다. 억지로 옆으로 밀어내면 패스 화살표가 시작점이랑 안 맞아
 * 보인다.
 */
export function separateOverlaps(positions: Record<string, { x: number; y: number }>) {
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

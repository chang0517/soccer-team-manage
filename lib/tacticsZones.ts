// 전술 시뮬레이터의 15구역 그리드 — 서버(lib/tactics.ts, LLM 프롬프트/파싱)와
// 클라이언트(app/tactics/page.tsx, 사용자에게 보여줄 안내)가 공유하는 값이라
// 게이트웨이 시크릿을 다루는 lib/llm.ts를 끌어오지 않는 별도 파일로 뺐다.
export interface TacticsZone {
  x: number;
  y: number;
  label: string;
}

// 세로 5단(A~E) × 가로 3열(1~3). 공격 방향은 A쪽(상대 골문), E가 우리 골문.
export const PITCH_ZONES: Record<string, TacticsZone> = {
  A1: { x: 20, y: 6, label: "상대 골문 앞 왼쪽" },
  A2: { x: 50, y: 6, label: "상대 골문 앞 중앙" },
  A3: { x: 80, y: 6, label: "상대 골문 앞 오른쪽" },
  B1: { x: 20, y: 27, label: "상대 진영 왼쪽" },
  B2: { x: 50, y: 27, label: "상대 진영 중앙" },
  B3: { x: 80, y: 27, label: "상대 진영 오른쪽" },
  C1: { x: 20, y: 50, label: "하프라인 왼쪽" },
  C2: { x: 50, y: 50, label: "하프라인 중앙" },
  C3: { x: 80, y: 50, label: "하프라인 오른쪽" },
  D1: { x: 20, y: 73, label: "우리 진영 왼쪽" },
  D2: { x: 50, y: 73, label: "우리 진영 중앙" },
  D3: { x: 80, y: 73, label: "우리 진영 오른쪽" },
  E1: { x: 20, y: 94, label: "우리 골문 앞 왼쪽" },
  E2: { x: 50, y: 94, label: "우리 골문 앞 중앙" },
  E3: { x: 80, y: 94, label: "우리 골문 앞 오른쪽" },
};

export const DEFAULT_ZONE = "C2";

// 화면에 표시할 때 쓰는 행(위→아래)·열(왼→오른) 순서.
export const ZONE_ROWS = ["A", "B", "C", "D", "E"] as const;
export const ZONE_COLS = ["1", "2", "3"] as const;

export const ZONE_LEGEND = Object.entries(PITCH_ZONES)
  .map(([code, z]) => `${code}=${z.label}`)
  .join(", ");

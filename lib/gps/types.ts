// GPS 포드(조끼 등판 로거) 로그 분석에서 쓰는 타입들.
// 위치 단위는 위경도(도), 속도는 m/s, 시각은 UTC 밀리초다.

export type LatLon = { lat: number; lon: number };

/** 로그 한 줄. Doppler 속도·정확도 등 기기가 모르는 값은 null. */
export type GpsPoint = {
  t: number;
  lat: number;
  lon: number;
  speed: number | null;
  hAcc: number | null;
  fix: number | null;
  nsv: number | null;
};

/**
 * 구장 네 모서리. 1번이 원점, 1→2번이 길이(골라인에서 골라인) 방향,
 * 1→4번이 폭(터치라인) 방향이 되도록 잡는다.
 */
export type PitchCorners = [LatLon, LatLon, LatLon, LatLon];

/** 위경도를 구장 좌표(m)로 바꾸는 기준 틀. */
export type PitchFrame = {
  origin: LatLon;
  /** 길이·폭 방향 단위벡터. origin 기준 (동쪽, 북쪽) 좌표계로 표현한다. */
  ex: [number, number];
  ey: [number, number];
  lengthM: number;
  widthM: number;
  /** 자동 추정 틀에서 최소 좌표를 0으로 맞추는 이동량(모서리 기반이면 0). */
  offsetX: number;
  offsetY: number;
  source: "pitch" | "auto";
};

export type ParsedLog = {
  format: "pod" | "gpx";
  deviceId: string | null;
  rateHz: number | null;
  points: GpsPoint[];
  /** 읽지 못해 건너뛴 줄 수. */
  skipped: number;
};

export type ZoneDistances = {
  walkM: number; // < 2 m/s
  jogM: number; // 2 ~ 4
  runM: number; // 4 ~ 5.5
  hsrM: number; // 5.5 ~ 7 (고강도 러닝)
  sprintM: number; // >= 7 (25.2 km/h)
};

/** 속도 구간별로 보낸 시간(초). */
export type ZoneSeconds = {
  walkS: number;
  jogS: number;
  runS: number;
  hsrS: number;
  sprintS: number;
};

/** 구장을 길이·폭 방향으로 3등분했을 때 머문 시간 비율(합 1). 인덱스 0은 좌표 0쪽이다. */
export type AreaShare = {
  thirds: [number, number, number];
  lanes: [number, number, number];
};

export type TrackMetrics = {
  startedAt: number;
  endedAt: number;
  durationS: number;
  /** 데이터가 끊기지 않고 이어진 시간(초). */
  activeS: number;
  distanceM: number;
  avgSpeedMs: number;
  maxSpeedMs: number;
  zones: ZoneDistances;
  /** 예전에 저장된 분석에는 없을 수 있다(다시 분석하면 채워진다). */
  zonesS?: ZoneSeconds;
  areaShare?: AreaShare | null;
  sprintCount: number;
  sprintDistanceM: number;
  accelCount: number;
  decelCount: number;
  /** 1분 단위 이동거리(m). 인덱스가 경기 시작 후 분. */
  perMinuteM: number[];
  avgPos: { x: number; y: number } | null;
  pointCount: number;
  droppedCount: number;
};

/** 1m 격자 점유 시간을 블러 처리해 0~255로 정규화한 값. base64(Uint8, 행 우선). */
export type Heatmap = {
  cols: number;
  rows: number;
  cellM: number;
  data: string;
  /** 255에 해당하는 체류 시간(초). 선수 여러 명의 히트맵을 같은 기준으로 합칠 때 쓴다. */
  refS?: number;
};

/** 1Hz로 줄인 이동 경로. [경기 시작 후 초, x, y]. */
export type TrackPath = [number, number, number][];

export type TrackAnalysis = {
  version: 1;
  frame: { source: "pitch" | "auto"; lengthM: number; widthM: number };
  metrics: TrackMetrics;
  heatmap: Heatmap;
  path: TrackPath;
};

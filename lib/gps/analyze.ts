import { autoFitFrame, projectToPitch } from "./geo";
import type {
  AreaShare,
  GpsPoint,
  Heatmap,
  PitchFrame,
  TrackAnalysis,
  TrackMetrics,
  TrackPath,
  ZoneDistances,
  ZoneSeconds,
} from "./types";

// 속도 구간·임계값은 팀 스포츠 GPS 분석에서 흔히 쓰는 값이다. 아마추어
// 경기에 맞게 바꿔야 하면 여기만 고치면 된다.
export const THRESHOLDS = {
  /** 사람이 낼 수 없는 속도(m/s). 넘으면 튄 점으로 보고 버린다. */
  maxSpeed: 12,
  /** 기기가 보고한 수평 오차(m)가 이보다 크면 버린다. */
  maxHAcc: 8,
  /** 이 속도 미만은 정지로 본다(GPS 떨림이 거리로 쌓이는 것을 막는다). */
  stillSpeed: 0.3,
  jogSpeed: 2.0,
  runSpeed: 4.0,
  hsrSpeed: 5.5,
  sprintSpeed: 7.0,
  sprintMinMs: 1000,
  /** 가·감속 이벤트 기준(m/s²)과 최소 지속 시간. */
  accelThreshold: 2.5,
  accelMinMs: 500,
  /** 이보다 길게 끊긴 구간은 거리·시간에 넣지 않는다. */
  gapMs: 2000,
  /** 구장 밖으로 이만큼(m)까지는 가장자리로 당겨서 히트맵에 반영한다. */
  heatMargin: 3,
  heatSigmaCells: 2,
} as const;

const T = THRESHOLDS;

export function cleanPoints(points: GpsPoint[]): { pts: GpsPoint[]; dropped: number } {
  const ok = points.filter(
    (p) =>
      Number.isFinite(p.t) &&
      Math.abs(p.lat) <= 90 &&
      Math.abs(p.lon) <= 180 &&
      !(p.lat === 0 && p.lon === 0) &&
      (p.fix === null || p.fix >= 3) &&
      (p.hAcc === null || p.hAcc <= T.maxHAcc) &&
      (p.speed === null || (p.speed >= 0 && p.speed <= T.maxSpeed))
  );
  ok.sort((a, b) => a.t - b.t);
  const pts: GpsPoint[] = [];
  for (const p of ok) {
    if (pts.length && p.t === pts[pts.length - 1].t) continue;
    pts.push(p);
  }
  return { pts, dropped: points.length - pts.length };
}

/** 시각 t 기준 ±halfMs 안의 값 평균(시간 가중 없는 이동평균). */
function movingAverage(t: number[], v: number[], halfMs: number): number[] {
  const n = t.length;
  const out = new Array<number>(n);
  let lo = 0;
  let hi = 0;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    while (hi < n && t[hi] <= t[i] + halfMs) {
      sum += v[hi];
      count++;
      hi++;
    }
    while (t[lo] < t[i] - halfMs) {
      sum -= v[lo];
      count--;
      lo++;
    }
    out[i] = sum / count;
  }
  return out;
}

/** t[i] ± halfMs 구간 양 끝 값의 차이를 시간으로 나눈 변화율. */
function slope(t: number[], v: number[], halfMs: number, minSpanMs: number): number[] {
  const n = t.length;
  const out = new Array<number>(n).fill(0);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    while (t[lo] < t[i] - halfMs) lo++;
    if (hi < i) hi = i;
    while (hi + 1 < n && t[hi + 1] <= t[i] + halfMs) hi++;
    const span = t[hi] - t[lo];
    if (hi > lo && span >= minSpanMs) out[i] = (v[hi] - v[lo]) / (span / 1000);
  }
  return out;
}

function derivedSpeed(t: number[], x: number[], y: number[], halfMs: number): number[] {
  const n = t.length;
  const out = new Array<number>(n).fill(0);
  let lo = 0;
  let hi = 0;
  for (let i = 0; i < n; i++) {
    while (t[lo] < t[i] - halfMs) lo++;
    if (hi < i) hi = i;
    while (hi + 1 < n && t[hi + 1] <= t[i] + halfMs) hi++;
    const span = (t[hi] - t[lo]) / 1000;
    if (hi > lo && span >= 0.2) out[i] = Math.hypot(x[hi] - x[lo], y[hi] - y[lo]) / span;
  }
  return out;
}

function medianStepMs(t: number[]): number {
  const steps: number[] = [];
  for (let i = 1; i < t.length; i++) {
    const d = t[i] - t[i - 1];
    if (d > 0 && d <= 5000) steps.push(d);
  }
  if (!steps.length) return 1000;
  steps.sort((a, b) => a - b);
  return steps[Math.floor(steps.length / 2)];
}

/**
 * flag가 참인 샘플의 묶음을 찾는다. maxGapMs 이하로 끊긴 건 한 묶음으로
 * 보고, 데이터 공백(gapMs)을 넘으면 묶음을 닫는다.
 */
function findRuns(
  t: number[],
  flag: boolean[],
  maxGapMs: number,
  minDurMs: number
): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  let last = -1;
  const close = () => {
    if (start >= 0 && t[last] - t[start] >= minDurMs) out.push([start, last]);
    start = -1;
    last = -1;
  };
  for (let i = 0; i < t.length; i++) {
    if (i > 0 && t[i] - t[i - 1] > T.gapMs) close();
    if (flag[i]) {
      if (start >= 0 && t[i] - t[last] > maxGapMs) close();
      if (start < 0) start = i;
      last = i;
    } else if (start >= 0 && t[i] - t[last] > maxGapMs) {
      close();
    }
  }
  close();
  return out;
}

function gaussianKernel(sigma: number): number[] {
  const r = Math.ceil(sigma * 3);
  const k: number[] = [];
  let s = 0;
  for (let i = -r; i <= r; i++) {
    const w = Math.exp(-(i * i) / (2 * sigma * sigma));
    k.push(w);
    s += w;
  }
  return k.map((w) => w / s);
}

function blur(grid: Float64Array, cols: number, rows: number, sigma: number): Float64Array {
  const k = gaussianKernel(sigma);
  const r = (k.length - 1) / 2;
  const tmp = new Float64Array(grid.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let s = 0;
      for (let j = -r; j <= r; j++) {
        const xx = x + j;
        if (xx >= 0 && xx < cols) s += grid[y * cols + xx] * k[j + r];
      }
      tmp[y * cols + x] = s;
    }
  }
  const out = new Float64Array(grid.length);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      let s = 0;
      for (let j = -r; j <= r; j++) {
        const yy = y + j;
        if (yy >= 0 && yy < rows) s += tmp[yy * cols + x] * k[j + r];
      }
      out[y * cols + x] = s;
    }
  }
  return out;
}

function buildHeatmap(
  frame: PitchFrame,
  t: number[],
  x: number[],
  y: number[]
): Heatmap {
  const cols = Math.min(Math.ceil(frame.lengthM), 150);
  const rows = Math.min(Math.ceil(frame.widthM), 110);
  const grid = new Float64Array(cols * rows);
  const m = T.heatMargin;
  for (let i = 0; i < t.length - 1; i++) {
    const dt = t[i + 1] - t[i];
    if (dt > T.gapMs) continue;
    if (x[i] < -m || x[i] > frame.lengthM + m || y[i] < -m || y[i] > frame.widthM + m) continue;
    const cx = Math.min(cols - 1, Math.max(0, Math.floor(x[i])));
    const cy = Math.min(rows - 1, Math.max(0, Math.floor(y[i])));
    grid[cy * cols + cx] += dt / 1000;
  }
  const soft = blur(grid, cols, rows, T.heatSigmaCells);

  // 한 곳에 오래 서 있던 칸 하나가 전체 색을 눌러 버리지 않게, 0이 아닌
  // 값의 99.5번째 백분위수를 최대치로 삼아 정규화한다.
  const nz = Array.from(soft).filter((v) => v > 1e-9).sort((a, b) => a - b);
  const ref = nz.length ? nz[Math.min(nz.length - 1, Math.floor(nz.length * 0.995))] : 1;
  const bytes = new Uint8Array(soft.length);
  for (let i = 0; i < soft.length; i++) {
    bytes[i] = Math.max(0, Math.min(255, Math.round((soft[i] / ref) * 255)));
  }
  return { cols, rows, cellM: 1, data: Buffer.from(bytes).toString("base64"), refS: ref };
}

/**
 * 정제된 로그 한 개를 분석한다. frame이 없으면 궤적에서 구장을 추정한다.
 * 쓸 만한 데이터가 부족하면 사용자에게 보여줄 한국어 메시지로 throw한다.
 */
export function analyzeTrack(raw: GpsPoint[], frame: PitchFrame | null): TrackAnalysis {
  const { pts, dropped } = cleanPoints(raw);
  if (pts.length < 20) throw new Error("사용할 수 있는 위치 데이터가 너무 적어요.");
  const fr = frame ?? autoFitFrame(pts);
  if (!fr) throw new Error("구장 범위를 정할 수 없어요.");

  const n = pts.length;
  const t = pts.map((p) => p.t);
  const t0 = t[0];
  const step = medianStepMs(t);

  const rx = new Array<number>(n);
  const ry = new Array<number>(n);
  for (let i = 0; i < n; i++) [rx[i], ry[i]] = projectToPitch(fr, pts[i]);

  // 10Hz급 로그는 ±0.5초 이동평균으로 위치 떨림을 줄이고, 1Hz급 앱 로그는
  // 이미 간격이 넓어 그대로 둔다.
  const x = step < 600 ? movingAverage(t, rx, 500) : rx;
  const y = step < 600 ? movingAverage(t, ry, 500) : ry;

  // 속도는 기기가 도플러로 잰 값이 위치 차분보다 훨씬 정확하다. 없는
  // 샘플은 위치 변화로 보충한다.
  const fallback = derivedSpeed(t, x, y, Math.max(500, step * 1.2));
  let v = pts.map((p, i) => p.speed ?? fallback[i]);
  if (pts.filter((p) => p.speed !== null).length >= n * 0.8 && step < 600) {
    v = movingAverage(t, v, 150);
  }
  v = v.map((s) => (s < T.stillSpeed ? 0 : Math.min(s, T.maxSpeed)));

  const cum = new Array<number>(n).fill(0); // 샘플 i까지의 누적 거리
  const zones: ZoneDistances = { walkM: 0, jogM: 0, runM: 0, hsrM: 0, sprintM: 0 };
  const zonesS: ZoneSeconds = { walkS: 0, jogS: 0, runS: 0, hsrS: 0, sprintS: 0 };
  const durationS = (t[n - 1] - t0) / 1000;
  const perMinuteM = new Array<number>(Math.floor(durationS / 60) + 1).fill(0);
  let distanceM = 0;
  let activeS = 0;
  let maxSpeedMs = 0;
  for (let i = 0; i < n - 1; i++) {
    cum[i + 1] = cum[i];
    if (v[i] > maxSpeedMs) maxSpeedMs = v[i];
    const dtMs = t[i + 1] - t[i];
    if (dtMs > T.gapMs) continue;
    const dt = dtMs / 1000;
    const vm = (v[i] + v[i + 1]) / 2;
    const d = vm * dt;
    cum[i + 1] += d;
    distanceM += d;
    activeS += dt;
    perMinuteM[Math.floor((t[i] - t0) / 60000)] += d;
    if (vm < T.jogSpeed) {
      zones.walkM += d;
      zonesS.walkS += dt;
    } else if (vm < T.runSpeed) {
      zones.jogM += d;
      zonesS.jogS += dt;
    } else if (vm < T.hsrSpeed) {
      zones.runM += d;
      zonesS.runS += dt;
    } else if (vm < T.sprintSpeed) {
      zones.hsrM += d;
      zonesS.hsrS += dt;
    } else {
      zones.sprintM += d;
      zonesS.sprintS += dt;
    }
  }
  if (v[n - 1] > maxSpeedMs) maxSpeedMs = v[n - 1];

  const sprints = findRuns(
    t,
    v.map((s) => s >= T.sprintSpeed),
    500,
    T.sprintMinMs
  );
  const sprintDistanceM = sprints.reduce((s, [a, b]) => s + (cum[b] - cum[a]), 0);

  const accel = slope(t, v, 500, 400);
  const accelCount = findRuns(
    t,
    accel.map((a) => a >= T.accelThreshold),
    200,
    T.accelMinMs
  ).length;
  const decelCount = findRuns(
    t,
    accel.map((a) => a <= -T.accelThreshold),
    200,
    T.accelMinMs
  ).length;

  let wSum = 0;
  let ax = 0;
  let ay = 0;
  const thirds: [number, number, number] = [0, 0, 0];
  const lanes: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < n - 1; i++) {
    const dtMs = t[i + 1] - t[i];
    if (dtMs > T.gapMs) continue;
    if (x[i] < 0 || x[i] > fr.lengthM || y[i] < 0 || y[i] > fr.widthM) continue;
    wSum += dtMs;
    ax += x[i] * dtMs;
    ay += y[i] * dtMs;
    thirds[Math.min(2, Math.floor((x[i] / fr.lengthM) * 3))] += dtMs;
    lanes[Math.min(2, Math.floor((y[i] / fr.widthM) * 3))] += dtMs;
  }
  const areaShare: AreaShare | null =
    wSum > 0
      ? {
          thirds: [thirds[0] / wSum, thirds[1] / wSum, thirds[2] / wSum],
          lanes: [lanes[0] / wSum, lanes[1] / wSum, lanes[2] / wSum],
        }
      : null;

  const metrics: TrackMetrics = {
    startedAt: t0,
    endedAt: t[n - 1],
    durationS,
    activeS,
    distanceM,
    avgSpeedMs: activeS > 0 ? distanceM / activeS : 0,
    maxSpeedMs,
    zones,
    zonesS,
    areaShare,
    sprintCount: sprints.length,
    sprintDistanceM,
    accelCount,
    decelCount,
    perMinuteM,
    avgPos: wSum > 0 ? { x: ax / wSum, y: ay / wSum } : null,
    pointCount: n,
    droppedCount: dropped,
  };

  const path: TrackPath = [];
  let lastSec = -1;
  for (let i = 0; i < n; i++) {
    const sec = Math.floor((t[i] - t0) / 1000);
    if (sec === lastSec) continue;
    lastSec = sec;
    path.push([sec, Math.round(x[i] * 10) / 10, Math.round(y[i] * 10) / 10]);
  }

  return {
    version: 1,
    frame: { source: fr.source, lengthM: fr.lengthM, widthM: fr.widthM },
    metrics,
    heatmap: buildHeatmap(fr, t, x, y),
    path,
  };
}

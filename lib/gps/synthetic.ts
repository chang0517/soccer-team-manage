import { makePitchFrame, pitchToLatLon } from "./geo";
import type { LatLon, PitchCorners, PitchFrame } from "./types";

// 포드가 도착하기 전에 화면과 분석 코드를 확인하기 위한 가짜 경기 데이터.
// 선수가 포지션 구역 안에서 걷고 뛰는 단순 모델에 GPS 오차(상관된 잡음)를
// 얹는다. 실제 정확도 검증에는 쓸 수 없고, 형식·화면·계산이 돌아가는지
// 보는 용도다.

export type SyntheticRole = "GK" | "DF" | "MF" | "FW";

// 시뮬레이션 전용 구장. 실제 위치가 아니다.
export const SAMPLE_PITCH_CORNERS: PitchCorners = [
  { lat: 37.5, lon: 127.0 },
  { lat: 37.5, lon: 127.001189 },
  { lat: 37.500611, lon: 127.001189 },
  { lat: 37.500611, lon: 127.0 },
];

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ZONES: Record<SyntheticRole, { x: [number, number]; roam: number }> = {
  GK: { x: [0.0, 0.08], roam: 0.3 },
  DF: { x: [0.12, 0.4], roam: 0.6 },
  MF: { x: [0.3, 0.7], roam: 1 },
  FW: { x: [0.55, 0.95], roam: 0.7 },
};

export type SyntheticOptions = {
  seed: number;
  role: SyntheticRole;
  minutes: number;
  deviceId: string;
  startMs?: number;
  rateHz?: number;
  corners?: PitchCorners;
};

export function generatePodLog(opts: SyntheticOptions): string {
  const rate = opts.rateHz ?? 10;
  const corners = opts.corners ?? SAMPLE_PITCH_CORNERS;
  const frame = makePitchFrame(corners) as PitchFrame;
  const rand = rng(opts.seed);
  const gauss = () => {
    const u = Math.max(rand(), 1e-9);
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
  };
  const zone = ZONES[opts.role];
  const dt = 1 / rate;
  const steps = Math.round(opts.minutes * 60 * rate);
  const start = opts.startMs ?? Date.UTC(2026, 9, 25, 10, 0, 0);

  const pick = (): [number, number] => {
    const lo = zone.x[0] * frame.lengthM;
    const hi = zone.x[1] * frame.lengthM;
    const midY = frame.widthM / 2;
    return [
      lo + rand() * (hi - lo),
      midY + (rand() - 0.5) * frame.widthM * 0.9 * zone.roam,
    ];
  };

  let [px, py] = pick();
  let [tx, ty] = pick();
  let speedTarget = 1.5;
  let v = 0;
  let nextRetarget = 0;
  // 위치 오차: 시간 상관이 있는 가우시안 잡음(약 1.5m, 상관시간 5초).
  const tau = 5;
  const sigma = 1.5;
  const phi = Math.exp(-dt / tau);
  const drive = sigma * Math.sqrt(1 - phi * phi);
  let nx = 0;
  let ny = 0;

  const lines: string[] = [
    "# gps-pod-log v1",
    `# device=${opts.deviceId}`,
    `# rate_hz=${rate}`,
    "# fw=synthetic",
    "utc_ms,lat,lon,gspeed,heading,hacc,sacc,fix,nsv,batt_mv,temp_c",
  ];

  for (let i = 0; i < steps; i++) {
    const tSec = i * dt;
    if (tSec >= nextRetarget) {
      [tx, ty] = pick();
      const r = rand();
      // 걷기 / 조깅 / 달리기 / 전력질주 비율.
      speedTarget = r < 0.3 ? 1.2 : r < 0.65 ? 3 : r < 0.92 ? 4.8 : 7.8;
      if (opts.role === "GK") speedTarget = Math.min(speedTarget, r > 0.97 ? 5 : 2.5);
      nextRetarget = tSec + 3 + rand() * 9;
    }
    const dx = tx - px;
    const dy = ty - py;
    const dist = Math.hypot(dx, dy);
    const want = dist < 1.5 ? 0 : speedTarget;
    v += Math.max(-4 * dt, Math.min(2.8 * dt, want - v));
    if (dist > 0.01) {
      px += (dx / dist) * v * dt;
      py += (dy / dist) * v * dt;
    }
    nx = phi * nx + drive * gauss();
    ny = phi * ny + drive * gauss();

    const ll: LatLon = pitchToLatLon(frame, px + nx, py + ny);
    const heading = (Math.atan2(dy, dx) * 180) / Math.PI;
    const speedObs = Math.max(0, v + gauss() * 0.05);
    lines.push(
      [
        Math.round(start + tSec * 1000),
        ll.lat.toFixed(7),
        ll.lon.toFixed(7),
        speedObs.toFixed(3),
        ((heading + 360) % 360).toFixed(1),
        (1.2 + rand() * 1.5).toFixed(2),
        (0.08 + rand() * 0.1).toFixed(2),
        3,
        14 + Math.floor(rand() * 5),
        3900 - Math.floor((i / steps) * 400),
        28,
      ].join(",")
    );
  }
  return lines.join("\n") + "\n";
}

export const SAMPLE_ROLES: SyntheticRole[] = ["GK", "DF", "DF", "MF", "MF", "FW", "FW"];

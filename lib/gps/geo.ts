import type { LatLon, PitchCorners, PitchFrame } from "./types";

const EARTH_R = 6371008.8;
const DEG = Math.PI / 180;

/** origin 기준 (동쪽 m, 북쪽 m). 구장 규모에서는 평면 근사로 충분하다. */
export function toEnu(origin: LatLon, p: LatLon): [number, number] {
  const east = (p.lon - origin.lon) * DEG * EARTH_R * Math.cos(origin.lat * DEG);
  const north = (p.lat - origin.lat) * DEG * EARTH_R;
  return [east, north];
}

export function fromEnu(origin: LatLon, east: number, north: number): LatLon {
  return {
    lat: origin.lat + (north / EARTH_R) / DEG,
    lon: origin.lon + (east / (EARTH_R * Math.cos(origin.lat * DEG))) / DEG,
  };
}

const valid = (p: LatLon) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;

/** 네 모서리로 구장 틀을 만든다. 모서리가 이상하면 null. */
export function makePitchFrame(corners: PitchCorners): PitchFrame | null {
  if (!corners.every(valid)) return null;
  const [c1, c2, , c4] = corners;
  const v1 = toEnu(c1, c2);
  const v4 = toEnu(c1, c4);
  const lengthM = Math.hypot(v1[0], v1[1]);
  if (lengthM < 20 || lengthM > 150) return null;
  const ex: [number, number] = [v1[0] / lengthM, v1[1] / lengthM];
  // 폭 방향은 길이 방향과 직각이 되도록 보정한다(모서리 측정 오차 흡수).
  const along = v4[0] * ex[0] + v4[1] * ex[1];
  const perp: [number, number] = [v4[0] - along * ex[0], v4[1] - along * ex[1]];
  const widthM = Math.hypot(perp[0], perp[1]);
  if (widthM < 15 || widthM > 120) return null;
  const ey: [number, number] = [perp[0] / widthM, perp[1] / widthM];
  return { origin: c1, ex, ey, lengthM, widthM, offsetX: 0, offsetY: 0, source: "pitch" };
}

export function projectToPitch(frame: PitchFrame, p: LatLon): [number, number] {
  const [e, n] = toEnu(frame.origin, p);
  return [
    e * frame.ex[0] + n * frame.ex[1] - frame.offsetX,
    e * frame.ey[0] + n * frame.ey[1] - frame.offsetY,
  ];
}

/** 구장 좌표 → 위경도(시뮬레이션 데이터 생성용). */
export function pitchToLatLon(frame: PitchFrame, x: number, y: number): LatLon {
  const px = x + frame.offsetX;
  const py = y + frame.offsetY;
  return fromEnu(
    frame.origin,
    px * frame.ex[0] + py * frame.ey[0],
    px * frame.ex[1] + py * frame.ey[1]
  );
}

/**
 * 구장 정보가 없을 때: 궤적의 주성분 방향을 길이 방향으로 잡고 점들을
 * 감싸는 사각형을 구장으로 본다. 선수마다 틀이 달라지므로 어디까지나
 * 임시 보기용이고, 팀 단위 비교에는 구장 모서리를 등록해야 한다.
 */
export function autoFitFrame(points: LatLon[]): PitchFrame | null {
  if (points.length < 10) return null;
  const origin: LatLon = {
    lat: points.reduce((s, p) => s + p.lat, 0) / points.length,
    lon: points.reduce((s, p) => s + p.lon, 0) / points.length,
  };
  const enu = points.map((p) => toEnu(origin, p));
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const [e, n] of enu) {
    sxx += e * e;
    syy += n * n;
    sxy += e * n;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ex: [number, number] = [Math.cos(angle), Math.sin(angle)];
  const ey: [number, number] = [-Math.sin(angle), Math.cos(angle)];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [e, n] of enu) {
    const x = e * ex[0] + n * ex[1];
    const y = e * ey[0] + n * ey[1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const lengthM = Math.max(maxX - minX, 20);
  const widthM = Math.max(maxY - minY, 15);
  return { origin, ex, ey, lengthM, widthM, offsetX: minX, offsetY: minY, source: "auto" };
}

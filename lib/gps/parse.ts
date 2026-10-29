import type { GpsPoint, ParsedLog } from "./types";

// 포드 로그(CSV) 형식은 docs/gps-pod-log-format.md 에 정의돼 있다.
// '#'로 시작하는 줄은 메타데이터(# key=value), 첫 일반 줄은 컬럼 이름이다.
// 컬럼 순서는 이름으로 찾기 때문에 펌웨어가 컬럼을 추가해도 읽을 수 있다.

const num = (s: string | undefined): number | null => {
  if (s === undefined || s.trim() === "") return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
};

export function parsePodCsv(text: string): ParsedLog {
  const meta: Record<string, string> = {};
  let cols: string[] | null = null;
  const points: GpsPoint[] = [];
  let skipped = 0;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith("#")) {
      const m = /^#\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m) meta[m[1].toLowerCase()] = m[2].trim();
      continue;
    }
    const cells = line.split(",");
    if (!cols) {
      cols = cells.map((c) => c.trim().toLowerCase());
      continue;
    }
    const at = (name: string) => {
      const i = cols!.indexOf(name);
      return i < 0 ? undefined : cells[i];
    };
    const t = num(at("utc_ms"));
    const lat = num(at("lat"));
    const lon = num(at("lon"));
    if (t === null || lat === null || lon === null) {
      skipped++;
      continue;
    }
    points.push({
      t,
      lat,
      lon,
      speed: num(at("gspeed")),
      hAcc: num(at("hacc")),
      fix: num(at("fix")),
      nsv: num(at("nsv")),
    });
  }

  return {
    format: "pod",
    deviceId: meta.device ?? null,
    rateHz: num(meta.rate_hz),
    points,
    skipped,
  };
}

// 스마트폰·시계 앱에서 내보낸 GPX. 정규식으로 trkpt만 읽는다(XML 파서
// 의존성을 피하기 위해). 속도 태그가 있으면 쓰고, 없으면 분석 단계에서
// 위치 변화로 속도를 구한다.
export function parseGpx(text: string): ParsedLog {
  const points: GpsPoint[] = [];
  let skipped = 0;
  const re = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const attrs = m[1];
    const body = m[2];
    const lat = num(/\blat\s*=\s*"([^"]+)"/.exec(attrs)?.[1]);
    const lon = num(/\blon\s*=\s*"([^"]+)"/.exec(attrs)?.[1]);
    const timeStr = /<time>\s*([^<\s]+)\s*<\/time>/.exec(body)?.[1];
    const t = timeStr ? Date.parse(timeStr) : NaN;
    if (lat === null || lon === null || !Number.isFinite(t)) {
      skipped++;
      continue;
    }
    const speed = num(/<(?:\w+:)?speed>\s*([^<\s]+)\s*<\//.exec(body)?.[1]);
    points.push({ t, lat, lon, speed, hAcc: null, fix: null, nsv: null });
  }
  return { format: "gpx", deviceId: null, rateHz: null, points, skipped };
}

export function detectFormat(text: string): "pod" | "gpx" {
  return /<gpx[\s>]/i.test(text.slice(0, 2000)) ? "gpx" : "pod";
}

export function parseLog(text: string, format?: "pod" | "gpx"): ParsedLog {
  return (format ?? detectFormat(text)) === "gpx" ? parseGpx(text) : parsePodCsv(text);
}

import { gunzipSync, gzipSync } from "node:zlib";
import {
  createGpsTrack,
  getGpsPitch,
  getGpsTrackRaw,
  replaceGpsTrackAnalysis,
} from "../db";
import type { GpsSession, GpsTrackInput } from "../types";
import { analyzeTrack } from "./analyze";
import { makePitchFrame } from "./geo";
import { parseLog } from "./parse";
import type { PitchFrame } from "./types";

// 업로드된 로그를 읽고 분석해 DB에 저장하는 흐름. API 라우트가 얇게 유지되도록 모았다.

const MAX_LOG_BYTES = 40 * 1024 * 1024; // 풀어놓은 텍스트 기준 상한

/** 요청 본문이 gzip이면 풀고, 아니면 그대로 문자열로 읽는다. */
export function decodeLogBody(buf: Buffer): string {
  const isGzip = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  const raw = isGzip ? gunzipSync(buf, { maxOutputLength: MAX_LOG_BYTES }) : buf;
  if (raw.length > MAX_LOG_BYTES) throw new Error("로그 파일이 너무 커요.");
  return raw.toString("utf8");
}

export async function frameForSession(session: GpsSession): Promise<PitchFrame | null> {
  if (session.pitchId === null) return null;
  const pitch = await getGpsPitch(session.pitchId);
  return pitch ? makePitchFrame(pitch.corners) : null;
}

export async function ingestLog(
  session: GpsSession,
  opts: { memberId: number | null; deviceId?: string; text: string; format?: "pod" | "gpx" }
): Promise<number> {
  const log = parseLog(opts.text, opts.format);
  if (log.points.length < 20) throw new Error("로그에서 읽을 수 있는 위치 데이터가 거의 없어요.");
  const analysis = analyzeTrack(log.points, await frameForSession(session));
  const input: GpsTrackInput = {
    sessionId: session.id,
    memberId: opts.memberId,
    deviceId: (opts.deviceId ?? log.deviceId ?? "").slice(0, 40),
    source: log.format,
    analysis,
    rawGz: gzipSync(Buffer.from(opts.text, "utf8")),
  };
  return createGpsTrack(input);
}

/** 구장 정보를 바꾼 뒤 보관해 둔 원본으로 다시 분석한다. */
export async function reanalyzeTrack(
  session: GpsSession,
  trackId: number,
  format: "pod" | "gpx"
): Promise<boolean> {
  const gz = await getGpsTrackRaw(trackId);
  if (!gz) return false;
  const log = parseLog(decodeLogBody(gz), format);
  const analysis = analyzeTrack(log.points, await frameForSession(session));
  await replaceGpsTrackAnalysis(trackId, analysis);
  return true;
}

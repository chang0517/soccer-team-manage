// 기상청 공공데이터포털 단기예보(getVilageFcst) 연동. 네이버는 공식 날씨 API가
// 없어서, 네이버 날씨도 결국 참고하는 기상청 데이터를 직접 쓴다.

const DEG_RAD = Math.PI / 180;
const RE = 6371.00877; // 지구 반경(km)
const GRID = 5.0; // 격자 간격(km)
const SLAT1 = 30.0 * DEG_RAD;
const SLAT2 = 60.0 * DEG_RAD;
const OLON = 126.0 * DEG_RAD;
const OLAT = 38.0 * DEG_RAD;
const XO = 43;
const YO = 136;

// 위경도를 기상청 단기예보 격자(nx, ny)로 바꾸는 표준 변환식(람베르트 정각원추도법).
function latLonToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const re = RE / GRID;
  const sn =
    Math.log(Math.cos(SLAT1) / Math.cos(SLAT2)) /
    Math.log(Math.tan(Math.PI * 0.25 + SLAT2 * 0.5) / Math.tan(Math.PI * 0.25 + SLAT1 * 0.5));
  const sf = (Math.pow(Math.tan(Math.PI * 0.25 + SLAT1 * 0.5), sn) * Math.cos(SLAT1)) / sn;
  const ro = (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + OLAT * 0.5), sn);

  const ra = (re * sf) / Math.pow(Math.tan(Math.PI * 0.25 + lat * DEG_RAD * 0.5), sn);
  let theta = lon * DEG_RAD - OLON;
  if (theta > Math.PI) theta -= 2 * Math.PI;
  if (theta < -Math.PI) theta += 2 * Math.PI;
  theta *= sn;

  return {
    nx: Math.floor(ra * Math.sin(theta) + XO + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5),
  };
}

// 자주 쓰는 홈구장 좌표(대략치 — 격자가 5km 단위라 이 정도면 충분하다). 공백은
// 무시하고 비교하므로 "동탄 여울공원"/"동탄여울공원" 둘 다 매칭된다. 목록에
// 없는 장소는 날씨를 표시하지 않는다.
const VENUE_COORDS: Record<string, { lat: number; lon: number }> = {
  동탄여울공원: { lat: 37.191, lon: 127.071 },
  반월체육공원: { lat: 37.211, lon: 126.997 },
  반월체육센터: { lat: 37.211, lon: 126.997 },
  오산죽미체육공원: { lat: 37.146, lon: 127.055 },
  기흥레스피아: { lat: 37.276, lon: 127.118 },
  H3구장: { lat: 37.223, lon: 127.048 },
};

function findVenueCoords(location: string): { lat: number; lon: number } | null {
  const key = location.replace(/\s+/g, "");
  return VENUE_COORDS[key] ?? null;
}

const BASE_HOURS = [2, 5, 8, 11, 14, 17, 20, 23];

// 단기예보 발표 시각(02,05,...,23시) 중 지금 기준으로 가장 최근 것을 고른다.
// 발표 후 약 10분 뒤부터 조회 가능해서, 그 전이면 한 시간 전 기준으로 계산한다.
function latestBaseDateTime(): { baseDate: string; baseTime: string } {
  const kst = new Date(Date.now() + 9 * 3600_000);
  const hour = kst.getUTCHours();
  const minute = kst.getUTCMinutes();
  const effectiveHour = minute < 10 ? hour - 1 : hour;

  const pastHours = BASE_HOURS.filter((h) => h <= effectiveHour);
  const dayOffset = pastHours.length > 0 ? 0 : -1;
  const baseHour = pastHours.length > 0 ? pastHours[pastHours.length - 1] : 23;

  const d = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + dayOffset));
  const baseDate = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
    d.getUTCDate()
  ).padStart(2, "0")}`;
  return { baseDate, baseTime: `${String(baseHour).padStart(2, "0")}00` };
}

const SKY_LABEL: Record<string, string> = { "1": "맑음", "3": "구름많음", "4": "흐림" };
const PTY_LABEL: Record<string, string> = {
  "1": "비",
  "2": "비/눈",
  "3": "눈",
  "4": "소나기",
  "5": "빗방울",
  "6": "빗방울눈날림",
  "7": "눈날림",
};

export interface MatchWeather {
  tmp: number | null; // 기온(℃)
  pop: number | null; // 강수확률(%)
  sky: string | null; // 맑음/구름많음/흐림
  pty: string | null; // 강수형태(없으면 null)
}

// 화면에 날씨를 표시하는 곳(경기 상세 페이지, 홈 화면)에서 공통으로 쓰는
// sky/pty 라벨 → 이모지 매핑.
export const WEATHER_EMOJI: Record<string, string> = {
  맑음: "☀️",
  구름많음: "⛅",
  흐림: "☁️",
  비: "🌧️",
  "비/눈": "🌨️",
  눈: "❄️",
  소나기: "🌦️",
  빗방울: "🌦️",
  빗방울눈날림: "🌨️",
  눈날림: "🌨️",
};

// (nx,ny,baseDate,baseTime) 조합으로 캐싱한다 — 이 조합은 3시간마다 한 번만
// 바뀌니, 같은 경기를 여러 명이 보거나 홈 화면에서 여러 경기가 같은 구장을
// 쓸 때 외부 API를 매번 다시 부르지 않는다(서버리스 인스턴스가 살아있는
// 동안만 유효 — 콜드스타트되면 자연히 비워진다).
const forecastCache = new Map<string, unknown[]>();

async function fetchVilageFcstItems(
  apiKey: string,
  nx: number,
  ny: number,
  baseDate: string,
  baseTime: string
): Promise<unknown[] | null> {
  const cacheKey = `${nx},${ny},${baseDate},${baseTime}`;
  const cached = forecastCache.get(cacheKey);
  if (cached) return cached;

  const url = new URL("https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst");
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "1000");
  url.searchParams.set("dataType", "JSON");
  url.searchParams.set("base_date", baseDate);
  url.searchParams.set("base_time", baseTime);
  url.searchParams.set("nx", String(nx));
  url.searchParams.set("ny", String(ny));

  let data: unknown;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    return null;
  }

  const items = (data as { response?: { body?: { items?: { item?: unknown } } } })?.response?.body
    ?.items?.item;
  if (!Array.isArray(items)) return null;
  forecastCache.set(cacheKey, items);
  return items;
}

/**
 * 경기 장소·날짜·시각에 대한 예보를 반환한다. 장소를 모르거나(등록된 홈구장이
 * 아님), 시각이 없거나, 예보 가능 범위(대략 D+2까지)를 벗어나면 null.
 */
export async function getMatchWeather(
  location: string,
  date: string,
  time: string
): Promise<MatchWeather | null> {
  const apiKey = process.env.KMA_API_KEY;
  if (!apiKey || !time) return null;

  const coords = findVenueCoords(location);
  if (!coords) return null;

  const matchInstant = new Date(`${date}T${time}:00+09:00`).getTime();
  const now = Date.now();
  if (Number.isNaN(matchInstant)) return null;
  if (matchInstant < now - 3600_000) return null; // 이미 지난 경기
  if (matchInstant > now + 72 * 3600_000) return null; // 단기예보 범위(약 D+2) 밖

  const { nx, ny } = latLonToGrid(coords.lat, coords.lon);
  const { baseDate, baseTime } = latestBaseDateTime();

  const items = await fetchVilageFcstItems(apiKey, nx, ny, baseDate, baseTime);
  if (!items) return null;

  const targetFcstDate = date.replace(/-/g, "");
  const targetFcstTime = `${time.slice(0, 2)}00`;

  const byCategory = new Map<string, string>();
  for (const raw of items) {
    const it = raw as { fcstDate?: string; fcstTime?: string; category?: string; fcstValue?: string };
    if (it.fcstDate === targetFcstDate && it.fcstTime === targetFcstTime && it.category) {
      byCategory.set(it.category, it.fcstValue ?? "");
    }
  }
  if (byCategory.size === 0) return null;

  const tmp = byCategory.get("TMP");
  const pop = byCategory.get("POP");
  const skyCode = byCategory.get("SKY");
  const ptyCode = byCategory.get("PTY");

  return {
    tmp: tmp != null && tmp !== "" ? Number(tmp) : null,
    pop: pop != null && pop !== "" ? Number(pop) : null,
    sky: skyCode ? (SKY_LABEL[skyCode] ?? null) : null,
    pty: ptyCode && ptyCode !== "0" ? (PTY_LABEL[ptyCode] ?? null) : null,
  };
}

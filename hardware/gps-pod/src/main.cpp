// GPS 포드 펌웨어 (조끼 등판에 넣는 로깅 전용 기기)
//
//  - 경기 중에는 위치만 CSV로 저장하고, 경기 후 Wi-Fi(AP 모드)로 파일을 받는다.
//  - 로그 형식은 docs/gps-pod-log-format.md, 배선은 hardware/gps-pod/README.md 참고.
//  - 배터리 전압·온도가 한계를 넘으면 기록을 멈추고 슬립한다(안전 우선).
//
// 버튼(보드의 BOOT 버튼, GPIO0):
//   대기 중   길게(1.5초)  기록 시작        두 번 빠르게  파일 받기(Wi-Fi) 모드
//   기록 중   길게(1.5초)  기록 종료
//   받기 모드 길게(1.5초)  재시작
#include <Arduino.h>
#include <LittleFS.h>
#include <WebServer.h>
#include <WiFi.h>
#include <esp_sleep.h>
#include <math.h>
#include <inttypes.h>

#include "ubx.h"

#if !defined(GNSS_M10) && !defined(GNSS_LEGACY_M8)
#error "platformio.ini에서 env:xiao_m10 또는 env:xiao_m8 중 하나로 빌드하세요."
#endif

// ---- 설정 ----
static const int PIN_GNSS_TX = D6;  // MCU TX -> GNSS RX
static const int PIN_GNSS_RX = D7;  // MCU RX <- GNSS TX
static const int PIN_BTN = 0;       // BOOT 버튼 (누르면 LOW)
static const int PIN_VBAT = D0;     // 배터리 전압 분압(100k/100k) 중간점
static const int PIN_NTC = D1;      // NTC 분압(3V3 - 10k - [D1] - NTC - GND)
static const uint32_t GNSS_BAUD = 115200;
static const uint16_t RATE_MS = 100;  // 10Hz

static const float VBAT_MIN_V = 3.30f;   // 이 아래로 내려가면 기록을 멈춘다
static const float TEMP_MAX_C = 55.0f;   // 배터리 표면 온도 한계
static const size_t MIN_FREE_BYTES = 200 * 1024;
// 1이면 NTC가 읽히지 않을 때(빠짐·단선) 기록을 시작하지 않는다.
#ifndef REQUIRE_NTC
#define REQUIRE_NTC 1
#endif

static const char *AP_PASS = "podpod12";  // 최소 8자. 필요하면 바꿀 것.

// ---- 상태 ----
enum Mode { IDLE, ARMED, REC, SYNC, FAULT };
static Mode mode = IDLE;

static HardwareSerial GNSS(1);
static ubx::Parser parser;
static ubx::Pvt lastPvt;
static bool havePvt = false;
static uint32_t lastPvtMs = 0;

static File logFile;
static char wbuf[2048];
static size_t wlen = 0;
static uint32_t lastFlush = 0;
static uint32_t rowCount = 0;

static float vbatV = NAN;
static float tempC = NAN;
static uint32_t lastSafety = 0;
static uint8_t lowBattHits = 0;
static const char *faultReason = "";

static WebServer server(80);

// ---- 보조 ----
static void led(bool on) { digitalWrite(LED_BUILTIN, on ? LOW : HIGH); }  // 보드 LED는 LOW가 켜짐

static float readBatteryV() {
  uint32_t sum = 0;
  for (int i = 0; i < 16; i++) sum += analogReadMilliVolts(PIN_VBAT);
  return (sum / 16.0f) * 2.0f / 1000.0f;  // 분압비 1/2
}

static float readTempC() {
  uint32_t sum = 0;
  for (int i = 0; i < 16; i++) sum += analogReadMilliVolts(PIN_NTC);
  const float mv = sum / 16.0f;
  if (mv < 50 || mv > 3250) return NAN;  // 단선이나 단락으로 보임
  const float r = 10000.0f * mv / (3300.0f - mv);
  const float k = 1.0f / (1.0f / 298.15f + logf(r / 10000.0f) / 3950.0f);
  return k - 273.15f;
}

static void gnssSend(const uint8_t *buf, size_t n) {
  GNSS.write(buf, n);
  GNSS.flush();
  delay(60);
}

// ---- GNSS 설정 ----
static bool listenForPvt(uint32_t ms) {
  parser.reset();
  const uint32_t t0 = millis();
  while (millis() - t0 < ms) {
    while (GNSS.available()) {
      if (parser.feed((uint8_t)GNSS.read()) && parser.cls() == ubx::CLS_NAV && parser.id() == ubx::ID_NAV_PVT) {
        return true;
      }
    }
    delay(1);
  }
  return false;
}

static void gnssBegin(uint32_t baud) {
  GNSS.end();
  GNSS.setRxBufferSize(4096);  // 플래시 쓰기 중에도 수신이 넘치지 않게
  GNSS.begin(baud, SERIAL_8N1, PIN_GNSS_RX, PIN_GNSS_TX);
}

static void gnssConfigure() {
  // 모듈이 켜져 있는 채로 MCU만 재시작됐다면 이미 설정돼 있다.
  gnssBegin(GNSS_BAUD);
  if (listenForPvt(1500)) return;

  gnssBegin(9600);  // 전원을 새로 넣으면 모듈은 9600bps NMEA로 시작한다
  uint8_t f[96];
#if defined(GNSS_M10)
  const ubx::ValsetItem items[] = {
      {ubx::KEY_RATE_MEAS, RATE_MS, 2},
      {ubx::KEY_RATE_NAV, 1, 2},
      {ubx::KEY_UART1OUT_UBX, 1, 1},
      {ubx::KEY_UART1OUT_NMEA, 0, 1},
      {ubx::KEY_MSGOUT_NAV_PVT_UART1, 1, 1},
      {ubx::KEY_NAVSPG_DYNMODEL, 3, 1},  // 보행자. 스프린트에서 속도가 눌리면 0(portable)과 비교해 볼 것
  };
  gnssSend(f, ubx::buildValset(f, items, sizeof(items) / sizeof(items[0])));
  const ubx::ValsetItem baud[] = {{ubx::KEY_UART1_BAUDRATE, GNSS_BAUD, 4}};
  gnssSend(f, ubx::buildValset(f, baud, 1));
#else
  // NMEA 문장을 끄고 NAV-PVT만 켠 뒤, 갱신율과 속도를 바꾼다.
  for (uint8_t id = 0; id <= 5; id++) gnssSend(f, ubx::buildCfgMsg(f, 0xF0, id, 0));
  gnssSend(f, ubx::buildCfgMsg(f, ubx::CLS_NAV, ubx::ID_NAV_PVT, 1));
  gnssSend(f, ubx::buildCfgRate(f, RATE_MS));
  gnssSend(f, ubx::buildCfgPrtUart1(f, GNSS_BAUD));
#endif
  gnssBegin(GNSS_BAUD);
  if (!listenForPvt(3000)) Serial.println("[gnss] NAV-PVT가 안 나와요. 배선(TX/RX 교차)과 전원을 확인하세요.");
}

// ---- 로그 파일 ----
static void flushLog() {
  if (wlen && logFile) {
    logFile.write((const uint8_t *)wbuf, wlen);
    wlen = 0;
  }
  lastFlush = millis();
}

static bool startFile(const ubx::Pvt &p) {
  char name[40];
  snprintf(name, sizeof name, "/log_%04u%02u%02u_%02u%02u%02u.csv", p.year, p.month, p.day, p.hour, p.minute, p.sec);
  logFile = LittleFS.open(name, FILE_WRITE);
  if (!logFile) return false;
  logFile.printf("# gps-pod-log v1\n# device=%s\n# rate_hz=%u\n# fw=%s\n", DEVICE_ID, 1000 / RATE_MS, FW_VERSION);
#if defined(GNSS_M10)
  logFile.print("# gnss=m10\n");
#else
  logFile.print("# gnss=m8\n");
#endif
  logFile.print("utc_ms,lat,lon,gspeed,heading,hacc,sacc,fix,nsv,batt_mv,temp_c\n");
  wlen = 0;
  rowCount = 0;
  Serial.printf("[log] 시작: %s\n", name);
  return true;
}

static void stopRecording() {
  flushLog();
  if (logFile) {
    logFile.close();
    Serial.printf("[log] 종료: %u행\n", (unsigned)rowCount);
  }
  if (mode == ARMED || mode == REC) mode = IDLE;
}

static void enterFault(const char *reason) {
  stopRecording();
  faultReason = reason;
  mode = FAULT;
  Serial.printf("[fault] %s\n", reason);
}

static void appendRow(const ubx::Pvt &p) {
  char line[160];
  const int n = snprintf(line, sizeof line, "%" PRId64 ",%.7f,%.7f,%.3f,%.1f,%.2f,%.2f,%u,%u,%u,%.1f\n", ubx::epochMs(p),
                         p.lat * 1e-7, p.lon * 1e-7, p.gSpeedMms * 1e-3, p.headMot * 1e-5, p.hAccMm * 1e-3,
                         p.sAccMms * 1e-3, p.fixType, p.numSv, (unsigned)lroundf(vbatV * 1000.0f),
                         isnan(tempC) ? 0.0f : tempC);
  if (n <= 0) return;
  if (wlen + (size_t)n > sizeof wbuf) flushLog();
  memcpy(wbuf + wlen, line, (size_t)n);
  wlen += (size_t)n;
  rowCount++;
}

static void handlePvt(const ubx::Pvt &p) {
  lastPvt = p;
  havePvt = true;
  lastPvtMs = millis();
  if (mode == ARMED && ubx::timeValid(p)) {
    if (startFile(p)) mode = REC;
    else enterFault("파일을 열지 못했어요");
  }
  if (mode == REC && ubx::timeValid(p)) appendRow(p);
}

static void pollGnss() {
  while (GNSS.available()) {
    if (parser.feed((uint8_t)GNSS.read()) && parser.cls() == ubx::CLS_NAV && parser.id() == ubx::ID_NAV_PVT) {
      ubx::Pvt p;
      if (ubx::parsePvt(parser.payload(), parser.len(), p)) handlePvt(p);
    }
  }
  if (mode == REC && (millis() - lastFlush > 2000 || wlen > 1500)) {
    flushLog();
    if (LittleFS.totalBytes() - LittleFS.usedBytes() < MIN_FREE_BYTES) {
      stopRecording();
      Serial.println("[log] 저장 공간이 부족해서 기록을 멈췄어요.");
    }
  }
}

// ---- 안전 감시 ----
static void checkSafety() {
  if (millis() - lastSafety < 2000) return;
  lastSafety = millis();
  vbatV = readBatteryV();
  tempC = readTempC();

  if (!isnan(tempC) && tempC > TEMP_MAX_C) return enterFault("배터리 온도가 너무 높아요");
  if (vbatV < VBAT_MIN_V) {
    // 순간적인 전압 처짐으로 멈추지 않게 3번 연속일 때만.
    if (++lowBattHits >= 3) return enterFault("배터리 전압이 낮아요");
  } else {
    lowBattHits = 0;
  }
#if REQUIRE_NTC
  if (isnan(tempC) && (mode == ARMED || mode == REC)) return enterFault("온도 센서(NTC)가 안 읽혀요");
#endif
}

static void sleepNow() {
  GNSS.end();
  Serial.println("[sleep] 버튼을 누르면 깨어나요. (GNSS 모듈 전원은 따로 끄지 않으면 계속 켜져 있어요)");
  Serial.flush();
  esp_sleep_enable_ext0_wakeup(GPIO_NUM_0, 0);
  esp_deep_sleep_start();
}

// ---- 파일 받기(Wi-Fi AP) ----
static bool validName(const String &n) {
  return n.startsWith("/log_") && n.endsWith(".csv") && n.indexOf("..") < 0 && n.length() < 40;
}

static void startSync() {
  stopRecording();
  WiFi.mode(WIFI_AP);
  String ssid = String(DEVICE_ID);
  WiFi.softAP(ssid.c_str(), AP_PASS);

  server.on("/", HTTP_GET, []() {
    String html =
        "<!doctype html><meta name=viewport content='width=device-width,initial-scale=1'>"
        "<title>GPS 포드</title><body style='font-family:sans-serif;max-width:32rem;margin:1rem auto;padding:0 1rem'>"
        "<h2>" DEVICE_ID " 로그</h2><p>파일을 받아 팀 앱의 GPS 경기 분석에 올리세요.</p><ul>";
    File root = LittleFS.open("/");
    File f = root.openNextFile();
    int count = 0;
    while (f) {
      String n = String("/") + f.name();
      if (validName(n)) {
        count++;
        html += "<li><a href='/dl?f=" + n + "'>" + n.substring(1) + "</a> (" + String(f.size() / 1024) +
                " KB) <a href='/rm?f=" + n + "' onclick=\"return confirm('지울까요?')\">삭제</a></li>";
      }
      f = root.openNextFile();
    }
    if (!count) html += "<li>저장된 로그가 없어요.</li>";
    html += "</ul>";
    server.send(200, "text/html; charset=utf-8", html);
  });
  server.on("/dl", HTTP_GET, []() {
    String n = server.arg("f");
    if (!validName(n) || !LittleFS.exists(n)) return server.send(404, "text/plain", "not found");
    File f = LittleFS.open(n, FILE_READ);
    server.sendHeader("Content-Disposition", "attachment; filename=" + n.substring(1));
    server.streamFile(f, "text/csv");
    f.close();
  });
  server.on("/rm", HTTP_GET, []() {
    String n = server.arg("f");
    if (validName(n)) LittleFS.remove(n);
    server.sendHeader("Location", "/");
    server.send(302);
  });
  server.begin();
  mode = SYNC;
  Serial.printf("[sync] Wi-Fi '%s' (비밀번호 %s) 접속 후 http://192.168.4.1\n", ssid.c_str(), AP_PASS);
}

// ---- 버튼 ----
static bool btnDown = false, longFired = false;
static uint32_t btnT = 0, lastTap = 0;

static void onLong() {
  if (mode == IDLE) {
#if REQUIRE_NTC
    if (isnan(readTempC())) return enterFault("온도 센서(NTC)가 안 읽혀요");
#endif
    wlen = 0;
    mode = ARMED;
    Serial.println("[rec] GPS 시간을 기다리는 중…");
  } else if (mode == ARMED || mode == REC) {
    stopRecording();
  } else if (mode == SYNC) {
    ESP.restart();
  } else if (mode == FAULT) {
    sleepNow();
  }
}

static void pollButton() {
  const bool pressed = digitalRead(PIN_BTN) == LOW;
  const uint32_t now = millis();
  if (pressed && !btnDown) {
    btnDown = true;
    longFired = false;
    btnT = now;
  } else if (pressed && !longFired && now - btnT >= 1500) {
    longFired = true;
    onLong();
  } else if (!pressed && btnDown) {
    btnDown = false;
    if (!longFired && now - btnT >= 30 && now - btnT < 600) {
      if (mode == IDLE && now - lastTap < 700) {
        lastTap = 0;
        startSync();
      } else {
        lastTap = now;
      }
    }
  }
}

// ---- LED ----
static void updateLed() {
  const uint32_t t = millis();
  const bool fix3 = havePvt && millis() - lastPvtMs < 3000 && lastPvt.fixType >= 3;
  switch (mode) {
    case IDLE:
      led(t % 2000 < 80);
      break;
    case ARMED:
      led(t % 400 < 200);
      break;
    case REC:
      if (fix3) led((t % 2000 < 80) || (t % 2000 > 240 && t % 2000 < 320));  // 두 번씩 깜박
      else led(t % 500 < 250);                                                // 3D 위치 잡는 중
      break;
    case SYNC:
      led(true);
      break;
    case FAULT:
      led(t % 200 < 100);
      break;
  }
}

// 시리얼 모니터에 1초마다 상태를 보여준다. 안테나 위치를 바꿔 가며 위치 오차(hacc)를
// 비교하거나, 기록 전에 위치가 잡혔는지 확인할 때 쓴다.
static void printStatus() {
  static uint32_t last = 0;
  if (millis() - last < 1000) return;
  last = millis();
  const char *m = mode == IDLE ? "IDLE" : mode == ARMED ? "ARMED" : mode == REC ? "REC" : mode == SYNC ? "SYNC" : "FAULT";
  if (havePvt && millis() - lastPvtMs < 3000) {
    Serial.printf("[%s] fix=%u sv=%u hacc=%.1fm speed=%.2fm/s vbat=%.2fV temp=%.1fC rows=%u\n", m, lastPvt.fixType,
                  lastPvt.numSv, lastPvt.hAccMm * 1e-3, lastPvt.gSpeedMms * 1e-3, vbatV, tempC, (unsigned)rowCount);
  } else {
    Serial.printf("[%s] GNSS 데이터 없음 vbat=%.2fV temp=%.1fC\n", m, vbatV, tempC);
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_BUILTIN, OUTPUT);
  pinMode(PIN_BTN, INPUT_PULLUP);
  analogReadResolution(12);
  analogSetAttenuation(ADC_11db);
  led(false);

  if (!LittleFS.begin(true)) {
    Serial.println("[fs] 저장소를 열지 못했어요.");
  }
  vbatV = readBatteryV();
  tempC = readTempC();
  Serial.printf("[boot] %s fw %s  vbat %.2fV temp %.1fC\n", DEVICE_ID, FW_VERSION, vbatV, tempC);
  gnssConfigure();
}

void loop() {
  pollButton();
  if (mode != SYNC) pollGnss();
  checkSafety();
  updateLed();
  printStatus();
  if (mode == SYNC) server.handleClient();
  if (mode == FAULT && millis() - lastSafety > 15000) sleepNow();
  delay(1);
}

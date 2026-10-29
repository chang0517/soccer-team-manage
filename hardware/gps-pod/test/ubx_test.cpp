// PC에서 UBX 프레임 처리를 확인하는 시험.
//   g++ -std=c++11 -Wall -Wextra -I../src ubx_test.cpp -o /tmp/ubx_test && /tmp/ubx_test
#include <stdio.h>
#include <string.h>

#include "ubx.h"

static int failures = 0;
#define CHECK(cond)                                         \
  do {                                                      \
    if (!(cond)) {                                          \
      printf("FAIL %s:%d  %s\n", __FILE__, __LINE__, #cond); \
      failures++;                                           \
    }                                                       \
  } while (0)

static void put32(uint8_t *p, uint32_t v) {
  for (int i = 0; i < 4; i++) p[i] = (uint8_t)(v >> (8 * i));
}

int main() {
  // u-blox 문서에 실린 UBX-CFG-RATE 예시 프레임(100ms / 1Hz).
  uint8_t f[64];
  const uint8_t rate100[] = {0xB5, 0x62, 0x06, 0x08, 0x06, 0x00, 0x64, 0x00, 0x01, 0x00, 0x01, 0x00, 0x7A, 0x12};
  size_t n = ubx::buildCfgRate(f, 100);
  CHECK(n == sizeof(rate100) && memcmp(f, rate100, n) == 0);
  const uint8_t rate1000[] = {0xB5, 0x62, 0x06, 0x08, 0x06, 0x00, 0xE8, 0x03, 0x01, 0x00, 0x01, 0x00, 0x01, 0x39};
  n = ubx::buildCfgRate(f, 1000);
  CHECK(n == sizeof(rate1000) && memcmp(f, rate1000, n) == 0);

  // NAV-PVT 한 건을 만들어 쓰레기 바이트 뒤에 붙여 파서에 먹인다.
  uint8_t pl[92];
  memset(pl, 0, sizeof pl);
  put32(pl + 0, 123456);
  pl[4] = 2026 & 0xFF;
  pl[5] = 2026 >> 8;
  pl[6] = 10;
  pl[7] = 25;
  pl[8] = 1;
  pl[9] = 2;
  pl[10] = 3;
  pl[11] = 0x07;
  put32(pl + 16, 500000000);  // nano = 0.5s
  pl[20] = 3;
  pl[21] = 0x01;
  pl[23] = 14;
  put32(pl + 24, (uint32_t)1270000000);
  put32(pl + 28, (uint32_t)375000000);
  put32(pl + 40, 1200);
  put32(pl + 60, 2500);
  put32(pl + 64, (uint32_t)9000000);
  put32(pl + 68, 90);
  uint8_t frame[128];
  size_t fl = ubx::build(ubx::CLS_NAV, ubx::ID_NAV_PVT, pl, 92, frame);

  ubx::Parser parser;
  const uint8_t junk[] = {0x00, 0xB5, 0xB5, 0x12, 0x62, 0xFF};
  bool got = false;
  for (size_t i = 0; i < sizeof junk; i++) got |= parser.feed(junk[i]);
  CHECK(!got);
  for (size_t i = 0; i < fl; i++) {
    bool done = parser.feed(frame[i]);
    CHECK(done == (i == fl - 1));
  }
  CHECK(parser.cls() == ubx::CLS_NAV && parser.id() == ubx::ID_NAV_PVT && parser.len() == 92);

  ubx::Pvt pvt;
  CHECK(ubx::parsePvt(parser.payload(), parser.len(), pvt));
  CHECK(pvt.fixType == 3 && pvt.numSv == 14);
  CHECK(pvt.lat == 375000000 && pvt.lon == 1270000000);
  CHECK(pvt.hAccMm == 1200 && pvt.gSpeedMms == 2500 && pvt.sAccMms == 90);
  CHECK(ubx::timeValid(pvt));
  // 2026-10-25 01:02:03.5 UTC (Python datetime으로 계산한 값)
  CHECK(ubx::epochMs(pvt) == 1792890123500LL);

  // 체크섬이 틀리면 프레임을 받지 않는다.
  frame[fl - 1] ^= 0xFF;
  got = false;
  for (size_t i = 0; i < fl; i++) got |= parser.feed(frame[i]);
  CHECK(!got);

  // 음수 nano는 직전 초로 내려간다: 03.000 - 0.4s = 02.600
  pvt.nano = -400000000;
  CHECK(ubx::epochMs(pvt) == 1792890123000LL - 400);

  // VALSET: 헤더 4바이트 + 항목(키 4 + 값 크기).
  const ubx::ValsetItem items[] = {{ubx::KEY_RATE_MEAS, 100, 2}, {ubx::KEY_UART1OUT_NMEA, 0, 1}};
  n = ubx::buildValset(f, items, 2);
  CHECK(n == 8 + 4 + (4 + 2) + (4 + 1));
  CHECK(f[2] == 0x06 && f[3] == 0x8A);

  printf(failures ? "%d failure(s)\n" : "ok\n", failures);
  return failures ? 1 : 0;
}

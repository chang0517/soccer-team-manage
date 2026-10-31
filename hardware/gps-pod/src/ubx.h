// u-blox UBX 프로토콜 최소 구현. Arduino에 의존하지 않아서 PC에서도
// 컴파일해 시험할 수 있다(test/ubx_test.cpp).
#pragma once
#include <stddef.h>
#include <stdint.h>

namespace ubx {

constexpr uint8_t CLS_NAV = 0x01;
constexpr uint8_t ID_NAV_PVT = 0x07;

inline uint16_t rd16(const uint8_t *p) { return (uint16_t)(p[0] | (p[1] << 8)); }
inline uint32_t rd32(const uint8_t *p) {
  return (uint32_t)p[0] | ((uint32_t)p[1] << 8) | ((uint32_t)p[2] << 16) | ((uint32_t)p[3] << 24);
}
inline int32_t rdi32(const uint8_t *p) { return (int32_t)rd32(p); }

inline void checksum(const uint8_t *data, size_t len, uint8_t &a, uint8_t &b) {
  a = 0;
  b = 0;
  for (size_t i = 0; i < len; i++) {
    a = (uint8_t)(a + data[i]);
    b = (uint8_t)(b + a);
  }
}

// 헤더·체크섬을 붙여 프레임을 만든다. 반환값은 전체 길이(payload + 8).
inline size_t build(uint8_t cls, uint8_t id, const uint8_t *payload, uint16_t len, uint8_t *out) {
  out[0] = 0xB5;
  out[1] = 0x62;
  out[2] = cls;
  out[3] = id;
  out[4] = (uint8_t)(len & 0xFF);
  out[5] = (uint8_t)(len >> 8);
  for (uint16_t i = 0; i < len; i++) out[6 + i] = payload[i];
  checksum(out + 2, 4 + len, out[6 + len], out[7 + len]);
  return (size_t)len + 8;
}

// ---- 구형(M8) 설정 메시지 ----
inline size_t buildCfgRate(uint8_t *out, uint16_t measMs) {
  const uint8_t p[6] = {(uint8_t)(measMs & 0xFF), (uint8_t)(measMs >> 8), 1, 0, 1, 0};
  return build(0x06, 0x08, p, 6, out);
}
inline size_t buildCfgMsg(uint8_t *out, uint8_t msgCls, uint8_t msgId, uint8_t rate) {
  const uint8_t p[3] = {msgCls, msgId, rate};
  return build(0x06, 0x01, p, 3, out);
}
// UART1을 8N1, UBX 입출력만, 지정한 속도로 바꾼다.
inline size_t buildCfgPrtUart1(uint8_t *out, uint32_t baud) {
  uint8_t p[20] = {0};
  p[0] = 1;  // portID = UART1
  p[4] = 0xD0;
  p[5] = 0x08;  // mode 0x000008D0 = 8N1
  p[8] = (uint8_t)(baud & 0xFF);
  p[9] = (uint8_t)((baud >> 8) & 0xFF);
  p[10] = (uint8_t)((baud >> 16) & 0xFF);
  p[11] = (uint8_t)((baud >> 24) & 0xFF);
  p[12] = 0x01;  // inProtoMask: UBX
  p[14] = 0x01;  // outProtoMask: UBX
  return build(0x06, 0x00, p, 20, out);
}

// ---- 신형(M10) 설정: UBX-CFG-VALSET ----
// 키 번호와 크기는 u-blox M10 인터페이스 설명서(CFG-* 설정 항목)와 대조해서 확인할 것.
constexpr uint32_t KEY_RATE_MEAS = 0x30210001;        // U2, ms
constexpr uint32_t KEY_RATE_NAV = 0x30210002;         // U2
constexpr uint32_t KEY_MSGOUT_NAV_PVT_UART1 = 0x20910007;  // U1
constexpr uint32_t KEY_UART1_BAUDRATE = 0x40520001;   // U4
constexpr uint32_t KEY_UART1OUT_UBX = 0x10740001;     // L
constexpr uint32_t KEY_UART1OUT_NMEA = 0x10740002;    // L
constexpr uint32_t KEY_NAVSPG_DYNMODEL = 0x20110021;  // E1 (0=portable, 3=pedestrian)

struct ValsetItem {
  uint32_t key;
  uint32_t value;
  uint8_t size;  // 값 바이트 수 (1, 2, 4)
};

inline size_t buildValset(uint8_t *out, const ValsetItem *items, int count) {
  uint8_t p[96];
  size_t n = 0;
  p[n++] = 0;     // version
  p[n++] = 0x01;  // layers: RAM (부팅마다 다시 설정하므로 저장하지 않는다)
  p[n++] = 0;
  p[n++] = 0;
  for (int i = 0; i < count; i++) {
    for (int b = 0; b < 4; b++) p[n++] = (uint8_t)((items[i].key >> (8 * b)) & 0xFF);
    for (int b = 0; b < items[i].size; b++) p[n++] = (uint8_t)((items[i].value >> (8 * b)) & 0xFF);
  }
  return build(0x06, 0x8A, p, (uint16_t)n, out);
}

// ---- NAV-PVT ----
struct Pvt {
  uint32_t iTow;
  uint16_t year;
  uint8_t month, day, hour, minute, sec;
  uint8_t valid;  // bit0 날짜, bit1 시각
  int32_t nano;
  uint8_t fixType;
  uint8_t flags;
  uint8_t numSv;
  int32_t lon;  // 1e-7 도
  int32_t lat;
  uint32_t hAccMm;
  int32_t gSpeedMms;
  int32_t headMot;  // 1e-5 도
  uint32_t sAccMms;
};

inline bool parsePvt(const uint8_t *p, uint16_t len, Pvt &o) {
  if (len < 92) return false;
  o.iTow = rd32(p + 0);
  o.year = rd16(p + 4);
  o.month = p[6];
  o.day = p[7];
  o.hour = p[8];
  o.minute = p[9];
  o.sec = p[10];
  o.valid = p[11];
  o.nano = rdi32(p + 16);
  o.fixType = p[20];
  o.flags = p[21];
  o.numSv = p[23];
  o.lon = rdi32(p + 24);
  o.lat = rdi32(p + 28);
  o.hAccMm = rd32(p + 40);
  o.gSpeedMms = rdi32(p + 60);
  o.headMot = rdi32(p + 64);
  o.sAccMms = rd32(p + 68);
  return true;
}

inline bool timeValid(const Pvt &p) { return (p.valid & 0x03) == 0x03 && p.year >= 2024; }

// 날짜 -> 1970-01-01 기준 일수 (Howard Hinnant의 civil 알고리즘).
inline int64_t daysFromCivil(int y, unsigned m, unsigned d) {
  y -= m <= 2;
  const int era = (y >= 0 ? y : y - 399) / 400;
  const unsigned yoe = (unsigned)(y - era * 400);
  const unsigned doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  const unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  return (int64_t)era * 146097 + (int64_t)doe - 719468;
}

// UTC 밀리초. nano는 음수일 수 있어 반올림을 부호에 맞춰 한다.
inline int64_t epochMs(const Pvt &p) {
  const int64_t secs = daysFromCivil(p.year, p.month, p.day) * 86400 + p.hour * 3600 + p.minute * 60 + p.sec;
  const int32_t ms = p.nano >= 0 ? (p.nano + 500000) / 1000000 : (p.nano - 500000) / 1000000;
  return secs * 1000 + ms;
}

// 바이트 단위로 먹이면 완성된 프레임에서 true를 돌려준다.
class Parser {
 public:
  static constexpr uint16_t MAX_PAYLOAD = 128;
  bool feed(uint8_t b) {
    switch (state_) {
      case 0:
        if (b == 0xB5) state_ = 1;
        break;
      case 1:
        state_ = (b == 0x62) ? 2 : (b == 0xB5 ? 1 : 0);
        ckA_ = ckB_ = 0;
        break;
      case 2:
        cls_ = b;
        sum(b);
        state_ = 3;
        break;
      case 3:
        id_ = b;
        sum(b);
        state_ = 4;
        break;
      case 4:
        len_ = b;
        sum(b);
        state_ = 5;
        break;
      case 5:
        len_ |= (uint16_t)(b << 8);
        sum(b);
        if (len_ > MAX_PAYLOAD) {
          state_ = 0;
        } else {
          got_ = 0;
          state_ = len_ ? 6 : 7;
        }
        break;
      case 6:
        buf_[got_++] = b;
        sum(b);
        if (got_ == len_) state_ = 7;
        break;
      case 7:
        state_ = (b == ckA_) ? 8 : 0;
        break;
      case 8:
        state_ = 0;
        return b == ckB_;
    }
    return false;
  }
  uint8_t cls() const { return cls_; }
  uint8_t id() const { return id_; }
  uint16_t len() const { return len_; }
  const uint8_t *payload() const { return buf_; }
  void reset() { state_ = 0; }

 private:
  void sum(uint8_t b) {
    ckA_ = (uint8_t)(ckA_ + b);
    ckB_ = (uint8_t)(ckB_ + ckA_);
  }
  uint8_t state_ = 0, cls_ = 0, id_ = 0, ckA_ = 0, ckB_ = 0;
  uint16_t len_ = 0, got_ = 0;
  uint8_t buf_[MAX_PAYLOAD];
};

}  // namespace ubx

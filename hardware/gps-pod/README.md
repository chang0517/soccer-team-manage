# GPS 포드 펌웨어 (초안)

조끼 등판에 넣는 **로깅 전용** 기기입니다. 경기 중에는 위치만 저장하고, 경기 후 Wi-Fi로 파일을 받아 앱에 올립니다. 로그 형식은 [docs/gps-pod-log-format.md](../../docs/gps-pod-log-format.md)에 있습니다.

> **상태: 초안입니다.** 하드웨어가 아직 없어서 실제 기기에서 돌려 보지 못했고, 작성한 환경에서는 PlatformIO 패키지 서버에 접속할 수 없어 **`main.cpp`는 한 번도 컴파일해 보지 못했습니다.** PC에서 시험한 건 UBX 프레임 처리(`test/ubx_test.cpp`)뿐입니다. 처음 `pio run` 때 컴파일 오류가 나올 수 있고, GNSS 설정 키·핀·ADC 보정·Wi-Fi 받기는 기기가 도착한 뒤 하나씩 확인해야 합니다.

## 부품

Seeed XIAO ESP32-S3 + u-blox GNSS 모듈 + LiPo 배터리 + NTC/퓨즈 등. 전체 목록은 대화에서 정리한 부품표를 따릅니다.

## 배선

| XIAO 핀 | 연결 |
|---|---|
| D6 (TX) | GNSS RX |
| D7 (RX) | GNSS TX (TX/RX는 엇갈려 연결) |
| 3V3, GND | GNSS VCC, GND |
| D0 | 배터리 전압 분압 중간점 (배터리+ → 100kΩ → D0 → 100kΩ → GND) |
| D1 | NTC 분압 중간점 (3V3 → 10kΩ → D1 → NTC 10kΩ → GND). NTC는 배터리 표면에 붙인다 |
| BAT+ / BAT− 패드 | 배터리 (+는 PTC 퓨즈와 슬라이드 스위치를 거쳐서) |

핀 이름은 Seeed 위키의 핀 배치도와 대조해서 확인하세요.

## 빌드와 올리기

```bash
pip install platformio
cd hardware/gps-pod
pio run -e xiao_m10 -t upload     # MAX-M10S, SAM-M10Q 등 M10 모듈
pio run -e xiao_m8  -t upload     # Beitian BN-220, BN-880 등 M8 모듈
pio device monitor                # 부팅 로그와 상태 확인
```

기기 이름(`DEVICE_ID`)은 `platformio.ini`에서 포드마다 다르게 바꾸세요(예: `POD-02`). Wi-Fi 이름으로도 쓰입니다.

## 사용법

| 동작 | 결과 |
|---|---|
| 대기 중 BOOT 버튼 길게(1.5초) | 기록 시작 (GPS 시간을 잡으면 파일이 열림) |
| 기록 중 길게 | 기록 종료 |
| 대기 중 빠르게 두 번 | Wi-Fi 받기 모드. 폰에서 `POD-01` 접속(비밀번호 `podpod12`) 후 `http://192.168.4.1` |
| 받기 모드에서 길게 | 재시작 |

LED: 대기는 2초마다 짧게, 시작 대기는 빠른 깜박임, 기록 중 위치가 잡히면 두 번씩 깜박(못 잡으면 빠른 깜박), 받기 모드는 켜짐, 오류는 아주 빠른 깜박임.

## 안전 동작

- 배터리 전압이 3.3V 아래로 3번 연속(6초) 읽히면 기록을 멈추고 파일을 닫습니다.
- NTC 온도가 55℃를 넘으면 기록을 멈춥니다.
- NTC가 읽히지 않으면(빠짐, 단선) 기록을 시작하지 않습니다(`REQUIRE_NTC`, 기본 켜짐).
- 오류가 나면 15초 뒤 딥슬립합니다. **GNSS 모듈은 3V3에 계속 연결되어 있어서 전류를 계속 씁니다.** 최종 하드웨어에서는 GNSS 전원을 MCU가 끊을 수 있게(MOSFET 등) 설계해야 합니다.
- 저장 공간이 200KB 아래로 줄면 기록을 멈춥니다. 8MB 플래시 기준 로그 영역이 약 6MB라 한 경기(약 4MB)는 들어갑니다. 경기 후 파일을 받아 지워 두세요.

## 기기에서 확인할 것 (도착 후)

0. 구매한 모듈은 안테나 일체형 u-blox M10이라 `env:xiao_m10`으로 올립니다. 모듈 상품 설명의 동작 전압이 3.3V인지, UART(TX/RX) 핀이 나와 있는지 먼저 확인하세요.
1. `pio device monitor`에서 `[gnss] NAV-PVT가 안 나와요`가 뜨지 않는지. 뜨면 TX/RX 교차와 전원 확인. 정상이면 1초마다 `[IDLE] fix=3 sv=.. hacc=..m …` 상태가 출력됩니다. 안테나 방향과 위치를 바꿔 가며 `hacc`(작을수록 좋음)와 `sv`(위성 수)를 비교하세요.
2. M10 설정 키(`ubx.h`의 `KEY_*`)가 실제 모듈에서 받아들여지는지. u-center에서 같은 키를 읽어 대조.
3. `analogReadMilliVolts` 값으로 계산한 배터리 전압이 멀티미터 값과 맞는지(분압 저항 오차로 보정이 필요할 수 있음).
4. NTC 온도가 실온에서 합리적인지, 손으로 쥐었을 때 올라가는지.
5. 보행자 모드(`DYNMODEL=3`)와 portable(0)에서 스프린트 속도가 어떻게 다른지 같은 코스로 비교.
6. 10Hz로 90분 기록했을 때 플래시 쓰기 중 UART 수신 누락이 없는지(`rowCount` 대 기대 행 수).

## PC에서 하는 시험

```bash
g++ -std=c++11 -Wall -Wextra -Isrc test/ubx_test.cpp -o /tmp/ubx_test && /tmp/ubx_test
```

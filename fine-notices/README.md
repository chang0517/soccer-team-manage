# 미투표자 벌금 안내 자동발송

레이븐 회칙: 그 달 경기 투표는 그 달 1일 자정까지 완료해야 함. 이 launchd 작업은
**매월 1일 00:01**에 맥미니에서 실행되어, `raven-fc.vercel.app`의
`/api/admin/monthly-nonvoters` API로 그 달 경기 중 하나라도 투표하지 않은
정식 멤버(용병 제외) 목록을 가져온 다음, 전화번호가 등록된 사람에게
Messages.app(iMessage 우선, 안 되면 SMS)으로 정해진 벌금 안내 문구를 보낸다.

## 안전장치: DRY_RUN

`com.ravenfc.finenotices.plist`의 `DRY_RUN`이 기본값 `true`로 설치돼 있다.
이 상태에서는 실제로 아무 메시지도 보내지 않고, 누구에게 무엇을 보낼 예정인지
`/tmp/fine-notices.log`에만 기록한다.

**실제 발송을 켜려면:**

1. 멤버 탭(`/members`)에서 전화번호를 먼저 입력해 둔다(운영진 또는 본인이 입력).
2. 아래 명령으로 수동 실행해서 로그를 확인한다(DRY_RUN 상태로):
   ```bash
   DRY_RUN=true FINE_NOTICE_SECRET=$(grep FINE_NOTICE_SECRET ../.env.local | cut -d= -f2) node send-fine-notices.mjs
   ```
3. 문제 없으면 `com.ravenfc.finenotices.plist`의 `DRY_RUN` 값을 `false`로 바꾸고 다시 로드:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.ravenfc.finenotices.plist
   cp com.ravenfc.finenotices.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.ravenfc.finenotices.plist
   ```

## 설치 / 재설치

저장소의 plist에는 실제 시크릿 대신 `__FINE_NOTICE_SECRET__` 자리표시자만
있다(git에 진짜 키를 올리지 않기 위함, ollama-gateway와 동일한 방식). 설치할
땐 `.env.local`의 값을 채워 넣어서 `~/Library/LaunchAgents/`로 복사한다:

```bash
SECRET=$(grep FINE_NOTICE_SECRET ../.env.local | cut -d= -f2)
sed "s/__FINE_NOTICE_SECRET__/$SECRET/" com.ravenfc.finenotices.plist \
  > ~/Library/LaunchAgents/com.ravenfc.finenotices.plist
launchctl unload ~/Library/LaunchAgents/com.ravenfc.finenotices.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.ravenfc.finenotices.plist
```

## 로그 확인

```bash
tail -f /tmp/fine-notices.log
```

## 중지

```bash
launchctl unload ~/Library/LaunchAgents/com.ravenfc.finenotices.plist
```

## 참고

- 전화번호가 없는 멤버는 자동으로 건너뛴다(로그에 "전화번호 없음"으로 표시).
- `FINE_NOTICE_SECRET`은 `/api/admin/monthly-nonvoters`를 세션 로그인 없이
  호출하기 위한 전용 토큰이다. Vercel 프로덕션 환경변수에도 동일한 값이
  설정돼 있어야 API가 이 토큰을 인식한다.
- 이 launchd 작업이 잠들어 있던 맥미니가 새벽 0시에 깨어있지 않으면(잠자기
  모드) 실행이 늦어지거나 건너뛸 수 있다 — 맥미니가 그 시간에 켜져 있는지
  확인할 것.

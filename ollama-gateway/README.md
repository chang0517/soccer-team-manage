# Ollama 게이트웨이 (맥미니용)

Raven FC 서버(Vercel)가 맥미니에서 도는 Ollama를 호출할 수 있게 해주는
구성. 브라우저가 아니라 우리 서버가 이걸 호출하므로, 사용자는 폰이든
어디서든 사이트에서 "AI로 기록 입력"을 쓸 수 있다.

## 구성 요소

- `gateway.mjs` — Bearer 토큰을 검사한 뒤 로컬 Ollama(`127.0.0.1:11434`)로
  요청을 그대로 전달하는 인증 프록시. `127.0.0.1:11435`에서만 리슨한다.
- `ngrok-sync.mjs` — ngrok(무료 플랜, 고정 도메인 없음)으로 게이트웨이를
  터널링하고, 재시작마다 바뀌는 공개 주소를 감지해서 Vercel 환경변수
  (`OLLAMA_GATEWAY_URL`)를 자동으로 갱신 + 재배포하는 감시 스크립트.
- `com.ravenfc.ollamagateway.plist` / `com.ravenfc.ngroksync.plist` —
  로그인/재부팅 시 위 둘을 자동 실행하는 launchd 템플릿.

## 왜 ngrok인가

처음엔 Tailscale Funnel로 시도했는데, Vercel의 서버(Node 서버리스·Edge
런타임 둘 다)에서 Tailscale Funnel의 특정 인그레스 IP 대역으로 TCP 연결
자체가 매번 10초 타임아웃으로 실패했다(로컬에서는 즉시 성공). 반면 ngrok은
Vercel에서 문제없이 도달됐다. ngrok 무료 플랜은 고정 도메인을 지원하지
않아 재시작마다 주소가 바뀌므로, `ngrok-sync.mjs`가 그 변화를 감지해서
Vercel 쪽 환경변수와 배포를 자동으로 맞춰준다.

## 설치 순서 (참고용 — 이미 이 맥미니에는 설정되어 있음)

1. `ollama serve`가 `127.0.0.1:11434`에서 떠 있어야 한다 (기본값).
2. 비밀키 생성 후 게이트웨이 launchd 등록:
   ```
   SECRET=$(openssl rand -hex 24)
   sed "s/__GATEWAY_SECRET__/$SECRET/" com.ravenfc.ollamagateway.plist \
     > ~/Library/LaunchAgents/com.ravenfc.ollamagateway.plist
   launchctl load ~/Library/LaunchAgents/com.ravenfc.ollamagateway.plist
   ```
3. ngrok 설치 + 인증 (`ngrok config add-authtoken <TOKEN>`).
4. `vercel` CLI가 이 컴퓨터에 로그인/프로젝트 연결되어 있어야 한다
   (`vercel login`, 프로젝트 디렉터리에서 `vercel link`).
5. ngrok-sync를 launchd로 등록:
   ```
   cp com.ravenfc.ngroksync.plist ~/Library/LaunchAgents/
   launchctl load ~/Library/LaunchAgents/com.ravenfc.ngroksync.plist
   ```
   등록되면 자동으로 ngrok을 켜고, 주소를 감지해서 Vercel
   `OLLAMA_GATEWAY_URL`을 갱신한 뒤 프로덕션에 재배포한다.
6. Vercel에 `OLLAMA_GATEWAY_SECRET`(2번의 SECRET), `OLLAMA_MODEL`(사용할
   모델명, 예: `gemma4`)도 한 번 설정해두면 된다 — 이 둘은 바뀌지 않으므로
   수동으로 한 번만 넣으면 충분하다.

## 로그 확인

- 게이트웨이: `/tmp/ollama-gateway.log`, `/tmp/ollama-gateway.error.log`
- ngrok 동기화: `/tmp/ngrok-sync.log`, `/tmp/ngrok-sync.error.log`

## 보안 메모

- 게이트웨이는 Bearer 토큰이 정확히 일치해야만 요청을 통과시킨다. 토큰이
  새면 누구나 이 Ollama로 무료 추론을 돌릴 수 있으니, 비밀키는 저장소에
  커밋하지 말고 Vercel 환경변수와 맥미니의 launchd plist에만 보관한다.
- ngrok 터널은 해당 포트를 인터넷에 공개한다. Bearer 토큰 검증이 유일한
  방어선이므로, 토큰이 유출되지 않도록 주의한다.
- `ngrok-sync.mjs`는 주소가 바뀔 때마다 `vercel deploy --prod`를 사람
  확인 없이 자동 실행한다. 이 컴퓨터에서 `vercel` CLI 로그인 세션이
  살아있는 한 계속 동작하며, 세션이 만료되면 동기화가 조용히 실패하니
  가끔 `/tmp/ngrok-sync.log`를 확인하는 게 좋다.

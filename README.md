# Raven FC 조끼 GPS 경기 분석

조끼 등판에 넣는 GPS 포드(또는 스마트폰·시계 GPS 기록)의 로그를 올려, 경기마다 선수별 활동량과 같이 뛴 팀원 비교를 보여주는 웹앱입니다.
[Next.js](https://nextjs.org) App Router + TypeScript로 만들어졌고, 모바일 홈 화면에 설치해 쓰는 것을 기준으로 합니다.

예전에 이 주소에서 운영하던 팀 관리(일정·투표·스쿼드·랭킹 등) 기능은 모두 제거했습니다. 그 코드는 git 이력에 남아 있고, DB의 기존 테이블과 데이터는 지우지 않았습니다.

## 목차

- [핵심 기능](#핵심-기능)
- [권한 / 계정](#권한--계정)
- [기술 스택 · 아키텍처](#기술-스택--아키텍처)
- [프로젝트 구조](#프로젝트-구조)
- [로컬 개발](#로컬-개발)
- [환경 변수](#환경-변수)
- [배포](#배포)
- [관련 문서](#관련-문서)

## 핵심 기능

- **경기 세션**: 경기마다 세션을 만들고 선수별 로그를 올립니다. 같은 선수의 로그를 다시 올리면 이전 것을 대체합니다.
- **선수별 분석**: 이동거리, 최고속도, 스프린트 횟수와 거리, 가속·감속, 걷기/조깅/빠른 달리기/스프린트 시간 비율, 히트맵, 이동 경로, 주로 뛴 구역, 분당 이동거리
- **팀 비교**: 같은 경기에서 같이 뛴 선수들의 비교표, 팀 전체 히트맵, 팀 속도 구간 비율, 경기 요약 문장
- **구장 등록**: 구장 네 모서리 좌표를 한 번 등록하면 모든 경기를 같은 틀로 분석합니다. 구장을 바꾸면 보관된 원본으로 다시 분석합니다.
- **로그 형식**: 포드 CSV와 GPX를 읽습니다. 형식은 [docs/gps-pod-log-format.md](docs/gps-pod-log-format.md)에 있습니다.
- **예시 경기**: 운영진이 시뮬레이션으로 만든 가짜 경기를 만들어 화면을 둘러볼 수 있습니다(실제 기록이 아님).
- **선수 명단**: `/members`에서 분석 대상 선수를 관리합니다.

## 권한 / 계정

- 가입 → 운영진 승인 → 기존 선수와 연결하거나 새 선수로 등록
- **운영진**: 세션·구장 관리, 로그 업로드·삭제, 가입 승인
- **일반 선수**: 분석 결과 조회
- 아이디·비밀번호 찾기는 휴대폰 문자 인증을 씁니다(`ollama-gateway/`의 문자 발송 기능, 아래 환경 변수 참고).

## 기술 스택 · 아키텍처

- **프레임워크**: Next.js 16 (App Router) + React 19 + TypeScript
- **스타일**: Tailwind CSS 4
- **DB**: `DATABASE_URL`이 있으면 PostgreSQL(Supabase 등, `lib/pg.ts`), 없으면 로컬 SQLite(`better-sqlite3`, `lib/sqlite.ts`). `lib/db.ts`가 두 구현을 같은 인터페이스로 감쌉니다.
- **인증**: 자체 세션 쿠키 + bcryptjs
- **분석**: `lib/gps/`의 순수 TypeScript 모듈. 업로드 요청 안에서 선수당 1초 미만으로 계산합니다.
- **배포**: Vercel (서울 리전 `icn1`, DB도 서울)

## 프로젝트 구조

```
app/
  page.tsx                  # /gps로 이동
  gps/, gps/[id]/           # 경기 세션 목록, 선수별·팀 비교 화면
  members/                  # 선수 명단
  admin/                    # 가입 승인
  login/, signup/, find-id/, reset-password/, account/
  api/gps/                  # 구장, 세션, 로그 업로드, 팀 비교, 예시 경기
  api/auth/, api/members/, api/admin/
components/                 # Nav, 히트맵·팀 비교·업로드 컴포넌트
lib/
  gps/                      # 파서, 구장 좌표 변환, 분석, 팀 요약, 시뮬레이션
  db.ts, sqlite.ts, pg.ts   # DB
  auth.ts, roles.ts, sms.ts, otp.ts, phone.ts
hardware/gps-pod/           # 포드 펌웨어 초안(PlatformIO)
ollama-gateway/             # 문자 발송 게이트웨이(맥미니)
docs/                       # 로그 형식, DB 리전 이전 절차
```

## 로컬 개발

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인합니다. `DATABASE_URL`을 설정하지 않으면 `/data/`에 로컬 SQLite 파일이 생성됩니다.

```bash
npm run build   # 프로덕션 빌드
npm run lint    # ESLint
```

## 환경 변수

| 변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | 설정 시 Postgres(Supabase) 사용, 없으면 로컬 SQLite |
| `SESSION_SECRET` | 세션 쿠키 서명 비밀키 |
| `OLLAMA_GATEWAY_URL` / `OLLAMA_GATEWAY_SECRET` | 문자 발송 게이트웨이(아이디·비밀번호 찾기 인증번호) |

## 배포

Vercel에 배포하며(`vercel.json`의 함수 리전은 DB와 같은 서울 `icn1`), 위 환경 변수를 Vercel 프로젝트 설정에 등록하면 됩니다. DB를 다른 리전으로 옮기는 절차는 [docs/db-region-migration.md](docs/db-region-migration.md)를 참고하세요.

## 관련 문서

- [docs/gps-pod-log-format.md](docs/gps-pod-log-format.md): 포드 로그 형식과 분석 기준
- [hardware/gps-pod/README.md](hardware/gps-pod/README.md): 포드 펌웨어와 배선
- [docs/db-region-migration.md](docs/db-region-migration.md): DB를 인도에서 서울로 옮기는 절차

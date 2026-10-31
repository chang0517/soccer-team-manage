# DB를 인도(뭄바이)에서 서울로 옮기기

Vercel 함수 리전 `bom1`은 **뭄바이(인도)**이고 서울은 `icn1`입니다. 그동안 함수와 Supabase DB가 둘 다 인도에 있었습니다. DB만 서울로 옮기면 함수(인도)와 DB(서울)가 멀어져서 오히려 느려지니, **DB 이전과 함수 리전 변경(`vercel.json`의 `icn1`)을 같은 시점에 반영**해야 합니다.

Supabase는 프로젝트의 리전을 바꿀 수 없어서, 서울 리전에 새 프로젝트를 만들고 데이터를 옮깁니다. 기존 프로젝트는 읽기만 하고 건드리지 않으므로, 문제가 생기면 환경 변수를 되돌려 바로 복구할 수 있습니다.

## 준비

1. Supabase에서 **새 프로젝트를 Northeast Asia (Seoul) 리전**으로 만듭니다. 데이터베이스 비밀번호를 적어 둡니다.
2. 기존 프로젝트와 새 프로젝트의 연결 문자열을 준비합니다. 대시보드의 Connect에서 복사합니다.
   - 덤프·복원에는 **Session pooler(포트 5432)** 문자열을 쓰면 IPv6 문제 없이 연결됩니다.
   - 앱의 `DATABASE_URL`은 지금 쓰는 것과 같은 종류(보통 Transaction pooler, 포트 6543)를 새 프로젝트 것으로 바꿉니다.
3. PC에 `postgresql-client`(pg_dump, pg_restore, psql)를 설치합니다. 버전은 두 프로젝트의 Postgres 메이저 버전 이상이어야 합니다.
4. 연결 문자열에는 비밀번호가 들어 있습니다. 채팅이나 코드에 붙여넣지 말고 환경 변수로만 다루세요.

```bash
export OLD_URL='postgresql://...'   # 기존(인도) 프로젝트
export NEW_URL='postgresql://...'   # 새(서울) 프로젝트
```

## 1. 연습 (서비스에 영향 없음)

```bash
# 기존 DB는 읽기만 합니다.
pg_dump "$OLD_URL" --schema=public --no-owner --no-privileges --format=custom --file=raven.dump

# 새 DB로 복원합니다. 이미 있는 객체는 지우고 다시 만들기 때문에 여러 번 돌려도 됩니다.
pg_restore --no-owner --no-privileges --clean --if-exists --dbname="$NEW_URL" raven.dump

# 테이블별 행 수를 비교합니다.
SQL=$(psql "$OLD_URL" -Atc "select string_agg(format('select %L as t, count(*) from public.%I', tablename, tablename), ' union all ' order by tablename) from pg_tables where schemaname='public'")
psql "$OLD_URL" -Atc "$SQL order by 1" > old.txt
psql "$NEW_URL" -Atc "$SQL order by 1" > new.txt
diff old.txt new.txt && echo "행 수 일치"
```

`pg_restore`가 Supabase 관리용 역할이나 확장 때문에 경고를 몇 개 내는 건 흔하고, 마지막에 행 수가 일치하면 됩니다. 시퀀스(id 자동 증가) 값도 함께 복원됩니다.

## 2. 전환 (조용한 시간에)

덤프는 그 시점의 스냅샷이라, 덤프 이후에 기존 DB에 쌓인 투표·기록은 새 DB에 없습니다. 짧게 쓰기를 멈추고 진행하세요.

1. 팀에 잠깐 점검한다고 알립니다(투표·기록 입력 금지).
2. 위 1단계의 덤프·복원·행 수 비교를 **한 번 더** 실행합니다(최신 데이터).
3. Vercel → 프로젝트 → Settings → Environment Variables에서 **Production의 `DATABASE_URL`을 새 프로젝트 값으로 교체**합니다. Preview에도 같은 변수가 있으면 같이 바꿉니다.
4. `vercel.json`의 `icn1` 변경을 `main`에 머지합니다(자동 재배포). 환경 변수만 바꿨다면 Deployments에서 Redeploy해야 새 값이 적용됩니다.
5. 새 배포가 Ready가 되면 로그인, 일정, 투표, 랭킹, `/gps`를 확인합니다.

세션 쿠키는 `SESSION_SECRET`로 서명하므로 이 값을 바꾸지 않으면 로그인 상태가 유지됩니다. 푸시 알림 구독도 같은 DB 안에 있어서 함께 옮겨집니다.

## 3. 문제가 생기면

Vercel에서 `DATABASE_URL`을 기존 값으로 되돌리고 이전 배포를 Promote(또는 `vercel.json`을 `bom1`로 되돌려 재배포)합니다. 기존 DB는 그대로 있습니다. 단, 전환 이후 새 DB에 쌓인 데이터는 되돌리면 사라집니다.

## 4. 정리

새 DB로 1~2주 문제없이 쓴 뒤에 기존 프로젝트를 Pause하고, 한 달쯤 더 지나 삭제합니다. 그 사이에 덤프 파일(`raven.dump`)도 안전한 곳에 보관하세요.

# Albion ZvZ DB 백업

Supabase 프로젝트의 데이터베이스를 맥미니 로컬 (`~/backups/albion-zvz/`) 에 정기 백업한다.

## 구성

- `backup-db.sh` — 백업 본체. roles + schema + gzip data 3-step pg_dump → tar.gz
- `safe-db-push.sh` — `supabase db push --linked` 직전에 자동 백업 (pre-migration)
- `com.albion-zvz.backup.plist` — launchd 정의 (매일 03:00 KST)
- `install-backup-cron.sh` — launchd 등록/제거/상태/즉시실행

백업 메커니즘: `supabase db dump --linked --dry-run` 이 출력하는 pg_dump 파이프라인을
그대로 bash 에 흘려 로컬 pg_dump 로 실행한다. Docker 의존 없이 Supabase 가 추천하는
sed 정리(시스템 스키마 제외, 권한 정리 등)를 그대로 받는다.

## 의존성

- `brew install libpq` (시스템 `pg_dump` 제공)
- `supabase` CLI 2.95+ (브루)
- `.env.local` 의 `SUPABASE_ACCESS_TOKEN`

## 보관 위치 / 회전

- daily — `~/backups/albion-zvz/daily/`, 30일 이상은 자동 삭제
- pre-migration — `~/backups/albion-zvz/pre-migration/`, 최근 50개 유지

## 일상 사용

마이그를 적용할 때 (Claude / 사람 모두):

```bash
./scripts/safe-db-push.sh mig136
```

수동 백업이 필요할 때:

```bash
./scripts/backup-db.sh                       # daily 폴더에 즉시
./scripts/backup-db.sh pre-migration adhoc   # pre-migration 폴더에 라벨 부착
```

cron 상태 확인 / 즉시 실행:

```bash
./scripts/install-backup-cron.sh status
./scripts/install-backup-cron.sh trigger
```

## 복원

tar.gz 안에 `roles.sql`, `schema.sql`, `data.sql.gz` 가 있다. 데이터 덤프는 로컬
디스크에 수 GB의 평문 SQL을 만들지 않도록 생성과 동시에 압축한다. 새 Supabase 프로젝트로
복원할 때:

```bash
tar -xzf 2026-05-01_160043.tar.gz
psql "$DATABASE_URL" -f roles.sql
psql "$DATABASE_URL" -f schema.sql
gzip -dc data.sql.gz | psql "$DATABASE_URL"
```

같은 프로젝트로 PITR 복원이 필요하면 Supabase 대시보드의 "Database → Backups"
에서 7일치 자동 백업을 사용 (Pro 플랜 기본 제공). 이 로컬 백업은 그것의 backup
of the backup 이며, 7일을 넘기는 사고나 Supabase 자체 장애를 대비한 보험.

## 주의

- 백업 파일은 길드원 디스코드 ID, 이메일 등 PII 를 포함하므로 외부에 공유하지 말 것.
- 권한은 0600 (사용자 only)
- 맥미니가 죽으면 백업도 같이 사라진다. 외부 복제(Backblaze B2 / iCloud)는 별도 결정 사항.

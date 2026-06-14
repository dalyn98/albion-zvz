# Discord OAuth StorageState 검증

실제 Discord OAuth를 한 번 통과한 뒤 Playwright `storageState`를 저장해 멤버/관리자 화면을 자동 검증하는 절차입니다.

## 1회 저장

멤버 세션:

```bash
mkdir -p artifacts/auth
npx playwright codegen \
  --save-storage=artifacts/auth/discord-member-menhera.json \
  "https://menhera.albion-guildmanager.com/api/auth/discord/start?returnTo=/members"
```

관리자 세션:

```bash
mkdir -p artifacts/auth
npx playwright codegen \
  --save-storage=artifacts/auth/discord-admin-menhera.json \
  "https://menhera.albion-guildmanager.com/api/auth/discord/start?returnTo=/admin/dashboard"
```

브라우저가 뜨면 사용자가 직접 Discord 로그인, 2FA, 동의 화면을 완료합니다. 앱 내부 화면까지 도달한 뒤 브라우저를 닫으면 storageState 파일이 저장됩니다.

## 반복 검증과 세션 연장

저장된 세션은 앱 서버에서 7일 만료됩니다. `--refresh-auth-session`을 사용하면 유효한 세션을 검증 시작 전에 `/api/auth/refresh-session`으로 재서명하고 같은 storageState 파일에 다시 저장합니다.

멤버:

```bash
npm run smoke:browser -- \
  --base-url https://menhera.albion-guildmanager.com \
  --groups member \
  --member-storage-state artifacts/auth/discord-member-menhera.json \
  --refresh-auth-session
```

관리자:

```bash
npm run smoke:browser -- \
  --base-url https://menhera.albion-guildmanager.com \
  --groups admin \
  --admin-storage-state artifacts/auth/discord-admin-menhera.json \
  --refresh-auth-session
```

## 동작 조건

- storageState 안의 앱 세션이 아직 유효해야 합니다.
- 7일 이상 검증을 한 번도 실행하지 않으면 다시 Discord OAuth 저장이 필요합니다.
- 권한/역할 변경, 계정 보안 이벤트, 로그아웃, 세션 revoke 후에는 다시 저장합니다.
- refresh endpoint는 유효한 tenant 앱 세션과 `x-agm-session-refresh: 1` 헤더가 있을 때만 쿠키를 재서명합니다.

## 보안

- `artifacts/auth/*.json`은 production 세션 쿠키를 담으므로 secret입니다.
- git에 커밋하지 않습니다.
- CI에서 쓰려면 repository secret 또는 안전한 secret storage에서 파일을 복원한 뒤 검증 후 폐기합니다.

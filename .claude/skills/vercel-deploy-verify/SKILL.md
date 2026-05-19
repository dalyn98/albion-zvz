---
name: vercel-deploy-verify
description: Vercel 자동 배포 결과 확인 (preview / production). `git push origin <branch>` 후 latest deployment 상태를 polling 으로 Ready 까지 기다리거나, ERROR/CANCELED 시 즉시 보고. "배포 됐어?", "Vercel 확인", "production 올라갔어?", "deploy verify", "preview URL 확인" 같은 요청 시 자동 호출. CLI 출력의 ANSI 컬러 코드 처리, zsh 의 `status` read-only 변수 회피.
---

# Vercel Deploy Verify

`main` push → 자동 prod 배포, feature branch push → preview 배포. CLI 로 latest 상태 확인 + Ready 대기.

## 활성화 조건

- `git push` 후 "배포 됐어?" / "Vercel 확인" / "production 올라갔어?"
- PR merge 직후 production 모니터링
- preview URL 생성/Ready 확인

## Phase 1 — Latest deployment 조회

`vercel ls --prod` 또는 `vercel ls` 로 최신 배포 URL 확인.

```bash
# Production
vercel ls --prod 2>&1 | head -10

# Preview (latest)
vercel ls 2>&1 | head -10
```

URL 을 잡으면 `vercel inspect <url>` 로 상태 확인.

## Phase 2 — 상태 polling

**중요 함정 2개:**

1. **zsh 의 `status` 는 read-only 변수.** 이 이름 쓰면 `(eval):1: read-only variable: status` 에러. → `s` 또는 `raw` 같은 다른 이름 사용.
2. **ANSI 컬러 코드.** `vercel inspect` 출력의 "● Ready" 는 실제로 escape sequence 가 끼어 있어 `grep '● Ready'` 가 partial match (`●` 만) 로 false positive. → `sed` 로 ANSI 제거 후 grep.

올바른 polling loop:

```bash
DEPLOY_URL="<vercel inspect 대상 URL>"
for i in $(seq 1 60); do
  raw=$(vercel inspect "$DEPLOY_URL" 2>&1 | sed 's/\x1b\[[0-9;]*m//g')
  s=$(echo "$raw" | grep -E '^\s*status' | head -1)
  echo "[$i] $s"
  case "$s" in
    *Ready*)    echo 'READY'; break ;;
    *Error*)    echo 'ERROR'; break ;;
    *Canceled*) echo 'CANCELED'; break ;;
  esac
  sleep 20
done
```

또는 `run_in_background: true` 로 던지고 완료 통보를 기다림. 폴링 간격은 cache TTL (5분) 고려해 20-60s 가 적당.

## Phase 3 — 실패 시 로그 수집

ERROR 면 `vercel logs <url>` 또는 `vercel inspect --logs <url>` 로 빌드/런타임 로그 확인.

```bash
vercel inspect --logs "$DEPLOY_URL" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | tail -100
```

## Phase 4 — REST API 폴백

CLI 가 보여주지 않는 정보 (예: git 연동 메타) 는 REST API 로 보강. 토큰은 `vercel whoami` / `~/.vercel/auth.json` 에 있음. 메모리 `reference_vercel_api_check` 참고.

## 보고 형식

성공:
> Production Ready (deployment ID xxx, commit 5dfebc9, 1m 23s build).

실패:
> Production ERROR — 1차 원인 (e.g. `Type error in src/app/.../page.tsx:42`). 다음 액션 후보 1-2개.

대기 중:
> Polling... [3] BUILDING (20s 간격, 최대 20분 대기).

## 회귀 위험

- `cd <dir>` + `vercel` 동시 호출 → 권한 프롬프트 트리거. CLI 는 절대경로 + `--cwd` 또는 미리 cd 마쳐둔 shell 에서 호출.
- `vercel deploy` 직접 호출 금지 — `main` push 가 자동 트리거 (프로젝트 룰).

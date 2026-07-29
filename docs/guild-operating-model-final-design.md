# 길드 운영 모델 최종 설계

- 상태: 구현 가능한 제안
- 작성일: 2026-07-24
- 범위: 보급 흐름·자유 리기어 창구, 회원 거래, 길드 상점·재고 베이스라인, 포인트→실버 환전, 실버→포인트 적립, 포인트 양도, 참가예정·확정 참가·이벤트 특별 보상, 이벤트 마감 현황, 사이펀 자산 장부, 루팅 회수 검증, 승인 빌드 템플릿, 전술 실험 기능, 무기 사용 통계·길드 조합 분포, 영구 성취 배지·팀/개인 전투 위업, Menhera 전용 콘텐츠 준수·최근 영상 환전 자격, 회원 신원·길드 표시명·Discord 적용·길드원 내부 명부·회원 운영 명부, 기능 선택 사용, 셀프서비스 최초 설정, 공개 제품 문서·인앱 운영 레시피·도입 진행 체크리스트, 홈 길드 연결·대표권 분쟁, 길드 정지·삭제 생명주기, 비승인 회원 운영 기능 폐기, 다음 행동 홈, 오늘의 업무함, 회원 업무함, 운영 변경 기록·서비스 운영 도구, 전역 시스템 공지, 기능별 운영 안내, 길드·개인 시간대, 개인·길드 언어, 회원 공개 활동 링크, 다중 길드 전환, 공개 길드 프로필
- 제외: 전투로그·전투 집계·공개 전투 탐색의 상세 설계

## 1. 목표

이 설계의 목표는 기능 수를 늘리는 것이 아니라, 현재 기능들이 같은 운영 원칙 아래에서 끝까지 이어지게 만드는 것이다.

최종 상태는 다음 질문에 모두 한 곳에서 답할 수 있어야 한다.

1. 이 길드에서 이 사람은 누구인가?
2. 이 길드가 실제로 사용하는 기능은 무엇인가?
3. 운영진이 지금 처리해야 할 일은 무엇인가?
4. 한 보급 요청은 지금 어느 단계이며 무엇이 실제로 지급됐는가?
5. 중요한 운영 상태를 누가, 왜, 어떻게 바꿨는가?

### 현재 코드에서 확인한 핵심 gap

| 축 | 현재 구조의 한계 |
|---|---|
| 보급 | `src/app/actions/craft-queue.ts`가 제작 전달을 먼저 확정한 뒤 재고를 best-effort로 차감한다. |
| 환전 | `exchange_requests`는 포인트 hold 없이 `pending`이 되고, 운영진의 `approve_exchange_request`가 정책 승인·실버 지급 완료·포인트 차감을 한 상태로 합친다. |
| 자유 리기어 통계 | 운영진 통계는 자유 창구를 실제 리기어 건수·지급액에 포함하지만 정규 이벤트·자유 창구·자동 리기어 출처를 구분해 볼 수 없다. |
| 입금 적립 | `donation_requests`는 회원 주장 금액과 스크린샷만 받아 모든 건을 운영진이 심사하며, 확인 가능한 금고 실버 입금 원본과 연결하지 않는다. |
| 포인트 양도 | 현재 원장 이동은 원자적이지만 별도 양도 batch와 idempotency key가 없어 동일 요청 재전송을 같은 양도로 식별할 수 없고, 회원 거래와의 제품 경계도 명시적이지 않다. |
| 이벤트 특별 보상 | `event_payout_requests`는 생성과 승인을 나누지만 둘 다 `EVENT_MANAGE` 권한을 사용하고 동일인이 자신의 요청을 승인할 수 있어 실질적인 상호 검증이 아니다. 특별한 경우의 지급인데도 모든 건이 `pending` 승인 업무를 만든다. |
| 참가예정 | migration 133의 `cleanup_tentative_on_slot_fill`은 확정 배정뿐 아니라 `requested_discord_id`가 생긴 승인 대기 신청에도 참가예정을 삭제한다. 회원 웹 action은 이벤트 상태를 조회하면서도 모집 중 여부를 검증하지 않아 직접 호출 시 운영 기준 시작 뒤에도 참가예정을 쓸 수 있다. |
| 종료 이벤트 | 아카이브는 `battle_started_at + 1시간`이 지난 이벤트를 목록화하지만 관리자 상세에는 편집 form과 삭제 버튼이 그대로 남아 있어 과거 편성·정책·일정을 바꿀 수 있다. |
| 사후 리포트 | `/events/[id]/report`가 객관적 마감 상태와 전투 결과 추정·MVP·수동 AAR을 한 화면에 섞고 `EventAfterActionReviewCard`가 의도하지 않은 작성 업무와 별도 저장 원본을 만든다. |
| 사이펀 | 현재 UI가 모든 길드의 순입출금을 `사용 가능한 보관 잔량`·`초과 출금`으로 표시해 단순 기록 확인용으로 사용하는 길드에도 개인 소유량·반환 의무 의미를 강제한다. |
| 전술 | 현재 내비게이션과 문구가 전술 보드를 완성된 `ZvZ 교육` 기능처럼 노출한다. 공유 링크 생성은 `expires_at`을 지정하지 않아 비로그인 링크가 기본적으로 만료되지 않는다. |
| Menhera 콘텐츠 준수 | Menhera 전용으로 시작한 모듈이 migration 288에서 기존·신규 모든 tenant에 활성화됐다. migration 289의 최근 영상 조건도 전 길드의 새 포인트→실버 환전에 적용될 수 있어 의도한 길드 경계와 다르다. |
| 신원 | 현재 병합 RPC는 숫자 Discord ID를 전제로 해 `local:<uuid>`를 직접 병합할 수 없고, 캐릭터 단일 활성 길드는 DB 제약이 아니다. |
| 이름·닉네임 | 신뢰된 캐릭터 연결 때뿐 아니라 회원의 수동 `refreshMyAlbionIdentity`도 Discord 서버 닉네임을 다시 덮어쓴다. `site_user_nickname_overrides`는 Discord 사용자 전역 값이고 길드 운영진용 action도 없어, 다중 길드에서 서로 독립적인 길드 표시명을 소유할 수 없다. |
| 비승인 회원 운영 | `member_trial_profiles`와 `member_absences` 및 관련 UI가 도메인 소유자의 의도 확인 없이 추가됐다. 체험 메모와 부재 사유를 저장하며 이벤트 화면에도 연결돼 있지만 제품 기능으로 채택하지 않는다. |
| 기능 | `AppShell`·`AppSidebar`·직접 route·action·알림이 기능 가용성을 각자 판단한다. |
| 시작 화면 | `/`는 모든 허용 사용자에게 게시 이벤트 목록을 중심으로 보여주고 운영진 미처리 카드는 별도 설정이 켜진 경우에만 나타난다. `/admin/dashboard`의 운영 시작점과도 분리돼 역할별 다음 행동이 하나의 기준으로 결정되지 않는다. |
| 업무함 | queue key·count·oldest·권한·deep link가 badge, 대시보드, 승인 tab, 알림에 중복돼 있다. |
| 회원 업무함 | `/me/requests`가 기능별 요약·최근 통합 타임라인·기능별 전체 목록을 반복 노출하며, 회원 행동 필요와 길드 처리 대기를 공통 기준으로 구분하지 않는다. |
| 회원 명부 | `/members`가 활성 회원·게스트·탈퇴 회원·인게임 명단을 한 화면의 tab으로 섞고, Discord 회원 상세와 Albion 인게임 상세가 서로 다른 권한 경계를 사용한다. |
| 기록 | 중요 변경 뒤 별도 best-effort 기록을 남겨 mutation과 기록이 함께 commit된다는 보장이 없다. |
| 서비스 운영 | 대리 접속 cookie는 tenant 문맥만 바꿔 일반 길드 mutation을 그대로 실행할 수 있고, 상태·권한 변경은 영향 미리보기나 필수 재확인 없이 실행된다. `super_admin_audit_log` 기록 실패도 실제 변경을 막지 않으며 진단 화면은 원시 POST endpoint 실행을 안내한다. |
| 시간대 | 길드 시간대는 다수 화면·이벤트 입력·DM에 적용되지만 개인 시간대는 임박 DM에만 쓰이고, `getCurrentWeekStartIso`는 길드 설정과 무관하게 `America/Los_Angeles` 주 경계를 사용한다. |
| 회원 공개 활동 | 명시적 opt-in과 별도 공개 DTO는 존재하지만 `/u/[token]`에 검색 차단 metadata가 없고, 정확한 이벤트 날짜와 킬 시각·상대를 노출한다. 로컬 길드 계정은 링크를 만들 수 없다. |
| 다중 길드 | 길드별 `/me`가 단일 길드 사용자에게도 전 길드 활동 기록 query와 섹션을 노출해 드문 다중 길드 지원이 기본 회원 화면의 복잡도와 비용을 차지한다. |
| 공개 길드 프로필 | 실제 설정과 문서는 기본 비활성인데 마케팅 데모 문구는 봇 초대 직후 자동 공개된다고 안내해 명시적 공개 동의 원칙과 충돌한다. |
| 무기 사용 통계 | 회원 명부·요약은 이벤트 슬롯의 `assigned_weapon_id` 또는 템플릿 `weapon_id`를 집계하지만 회원 상세·공개 길드 통계는 관측된 killboard 장비를 사용한다. 계획된 편성과 실제 사용을 같은 이름으로 보여줘 사용 경험과 숙련도로 오해할 수 있다. |
| 성취 배지 | `src/lib/badges.ts`가 현재 집계값에서 배지를 매번 다시 계산하고 획득 기록을 저장하지 않아 통계 정정·집계 기준 변경으로 이미 얻은 배지가 사라질 수 있다. 참여·킬·무사망·생존율·연속 참여·승리를 모두 개인 배지로 계산해 팀 전투 성과와 역할별로 제한된 개인 지표의 경계도 없다. |
| 홈 길드 연결 | 현재 전역 unique index는 같은 Albion 길드의 중복 연결을 막지만 최초 등록자가 실제 길드를 대표하는지는 증명하지 않는다. 공개 프로필의 Discord 초대 주소도 Discord 형식만 확인하고 봇이 설치된 서버와 같은지는 확인하지 않는다. |
| 셀프서비스 최초 설정 | 현재 3단계 wizard에 리기어 화면은 있지만 안전 기본값을 그대로 완료할 수 있어 미지원·지원 방침이 명시적이지 않다. 이벤트 공지 채널은 `나중에 설정`할 수 있고, 7단계 가이드는 선택 기능까지 모두 필수인 것처럼 안내한다. |
| 도움말 | 공개 MDX 문서 68개, 인앱 운영 가이드와 온보딩 체크리스트가 설명을 중복하고 일부 문서는 현재 확정한 홈·회원 상세·회원 업무함 동작과 다르다. 공개 MDX의 한국어 본문도 ko·ja·en·zh 동등한 제품 문서 계약을 갖지 않는다. |
| 길드 생명주기 | DB에는 `pending/active/suspended/deleted`만 있고 서비스 운영자가 사유 없이 상태를 직접 바꾼다. 공개 FAQ는 운영진 직접 삭제·30일 복구를 약속하지만 요청·철회·열린 의무 검증·실제 purge가 없고, `bot_installed_at`도 봇 제거를 나타내지 못한다. |
| 언어 | 개인 `preferred_language`는 길드 회원·게스트 row에 저장되지만 UI cookie는 전역이라 다중 길드 값이 충돌한다. 개인 DM은 값이 없으면 한국어로 고정되고, 공용 Discord 문구용 길드 기본 언어와 공개 프로필의 모집 사용 언어도 구분되지 않는다. |
| 전역 시스템 공지 | 활성 공지를 여러 개 쌓을 수 있고 만료 시각이 선택 사항이며, 점검 안내와 긴급 보안 공지를 구분하지 않고 모두 붉은 닫기 불가 배너로 표시한다. |
| 기능별 운영 안내 | 이벤트·리기어·상점에 길드별 고정 배너가 있지만 “공지”라는 표현만으로는 반복 운영 규칙인지 일시 소식인지 목적 경계가 드러나지 않는다. |

## 2. 확정 불변식

| 영역 | 불변식 |
|---|---|
| 테넌트 | 모든 업무 데이터는 `guild_id`로 격리한다. |
| 회원 | 하나의 Discord 사용자는 여러 길드 워크스페이스를 가질 수 있다. |
| 회원 | 같은 Discord 사용자라도 길드마다 서로 다른 길드 회원 기록을 갖는다. |
| 회원 | 길드 회원 기록이 활동·보상·권한·상태 이력의 주체다. 로그인 수단은 그 기록에 연결된다. |
| 다중 길드 | 접근 가능한 길드가 하나면 바로 진입하고 둘 이상일 때만 분리된 길드별 요약과 전환을 보조적으로 제공한다. 모든 행동은 정확히 하나의 활성 길드 문맥에 속한다. |
| 재가입 | 같은 길드에 돌아온 회원은 기존 기록·잔액·이력·미완료 의무를 이어받고, 운영 권한만 현재 Discord 역할로 다시 계산한다. |
| 캐릭터 | 하나의 Albion 캐릭터는 동시에 최대 한 길드에만 활성 연결된다. |
| 닉네임 | 확인된 Albion 캐릭터명은 사이트의 게임 신원 표시 기준이다. Discord 서버 닉네임은 최초 신뢰 연결 때 한 번 best-effort로 적용하고 이후 자동 refresh로 강제하지 않으며, 실제 캐릭터명 변경이나 권한 있는 운영진의 명시적 재적용 때만 다시 시도한다. |
| 병합 | 로컬 계정과 Discord 접근 신원을 합쳐도 기존 길드 회원 기록과 이력은 유지한다. |
| 이전 | 캐릭터가 길드를 옮겨도 이전 길드의 활동·포인트·정산 기록은 이동하지 않는다. |
| 권한 | 운영진 자격은 현재 Discord 역할을 기본 원천으로 삼고 앱은 역할별 세부 권한 연결과 집행 기록을 관리한다. 개인 권한은 사유·만료가 있는 예외다. |
| 회원 정보 | 길드 내부에는 활동·업적만 공유하고 포인트·리기어·증빙·준수·운영 메모는 본인과 해당 업무 권한자에게만 노출한다. |
| 회원 명부 | 일반 길드원은 현재 활성 회원의 안전한 신원·역할·긍정적 활동 요약만 검색한다. 게스트·탈퇴 회원·사이트 미연결 인게임 인원·신원 문제와 관리 작업은 운영진 표면으로 분리한다. |
| 폐기 대상 | 체험 멤버 운영과 참여 불가 일정은 신규 사용을 중단하고 잔존 데이터 보호 여부를 확인한 뒤 제거한다. 이벤트·보상·리기어·권한은 이 데이터에 의존하지 않는다. |
| 기능 | 완전히 꺼진 기능은 내비게이션뿐 아니라 직접 경로, 업무함, 알림, 자동화에서도 동작하지 않는다. 미처리 업무가 있으면 먼저 draining 상태로 전환한다. |
| 시작 화면 | 로그인 직후에는 활성 길드와 현재 역할에 맞는 임박 이벤트·행동 필요 업무·운영 차단 문제만 우선한다. 회원·운영진·게스트·연합 참가자는 같은 원본 상태를 각 권한 범위에서 보며 통계·전체 이력·기능 목록은 전용 화면으로 분리한다. |
| 보급 | 상태 변경, 재고 변경, 지급 원장, 중요 변경 기록은 한 트랜잭션에서 함께 성공하거나 함께 실패한다. |
| 보급 | 리기어가 없는 이벤트도 정상 완료 상태다. |
| 리기어 정책 | 여러 설정은 이벤트별 최종 기준을 만드는 운영진용 입력이며, 이벤트 시작 시 참가자·역할별 유효 정책을 고정해 신청·지급에 사용한다. |
| 자유 리기어 | 신청·승인·지급액은 출처가 구분된 리기어 운영 통계에 포함하지만 신청자를 이벤트 참가율·참여 보상·이벤트 성과에 사용하지 않는다. |
| 업무함 | 업무함은 승인·예외·후속 조치만 모으며 상태 통계나 전체 기록을 섞지 않는다. |
| 회원 업무함 | 회원 본인의 행동 필요를 최우선, 길드 처리 대기를 다음으로 보여주고 완료 이력은 접힌 조회 영역으로 분리한다. |
| 기록 | 화면 조회와 일반 탐색은 운영 변경 기록에 남기지 않는다. |
| 서비스 운영 | 서비스 운영 도구는 조회 전용이 기본이며 대리 조회에서는 길드 업무를 수정하지 않는다. 필요한 변경은 대상·사유·영향 미리보기·재확인·idempotency·서비스 운영 기록이 있는 목적별 복구 명령으로만 수행한다. |
| 채널 | 앱이 운영 원본이며 Discord는 같은 command로 일상적인 단건 업무를 완료하는 빠른 실행 Adapter다. 되돌리기 어려운 단건 행동은 Discord 안에서 최종 확인한다. |
| 알림 | 길드 전체 공지·개인 결과·운영진 행동 필요·운영 요약을 수신자와 긴급도별로 분리하고, 같은 원본의 중복 전달과 처리 후 반복 완료 알림을 만들지 않는다. |
| 전역 시스템 공지 | 서비스 운영자가 장애·점검·보안 영향을 모든 길드의 앱 사용자에게 잠시 알리는 안전 채널이다. 활성 공지는 하나이고 만료가 필수이며, 즉시 위험이 있는 긴급 공지만 닫을 수 없다. |
| 기능별 운영 안내 | 길드 운영진이 이벤트·리기어·상점의 반복 이용 규칙을 해당 페이지에 닫기 불가로 고정하며 일시 소식이나 Discord 방송에 사용하지 않는다. |
| 시간대 | 일정·마감·자동화·일·주 경계는 길드 운영 시간대가 결정한다. 개인 시간대는 회원 개인 화면과 개인 DM 표시만 바꾸며 공용·운영·공개 화면은 시간대 약어를 포함한 길드 시간으로 표시한다. |
| 도입 | 새 길드는 봇 초대 뒤 Discord 역할·이벤트 공지 채널·운영 시간대·Albion 홈 길드와 리기어 미지원 또는 최소 지원 정책을 명시적으로 확정하면 회원 접근이 열려야 한다. 다른 선택 기능과 7단계 가이드는 활성화를 막지 않는다. |
| 도움말 | 공개 제품 문서는 현재 제품 계약, 인앱 운영 레시피는 현재 권한·기능 상태의 실행 도움, 도입 진행 체크리스트는 비차단 완료 상태만 소유한다. 같은 규칙을 중복 정의하지 않고 네 언어와 미완성·실험 상태가 제품과 함께 갱신돼야 한다. |
| 홈 길드 연결 | 홈 길드 선택은 운영 기준을 정하는 연결이지 소유권·공식 대표권 인증이 아니다. 정상 도입에는 인게임 코드·영상·서비스 운영자 승인을 요구하지 않고 중복 연결이나 신빙성 있는 사칭 신고가 생길 때만 예외적으로 대표권을 확인한다. |
| 길드 생명주기 | 봇 제거·장기 미사용은 데이터가 유지되는 일시 정지이고 자동 삭제 사유가 아니다. 영구 삭제는 열린 의무를 해소한 뒤 권한자의 명시적 요청, 30일 복구 기간과 실제 guild-scoped purge를 거쳐야 한다. |
| 언어 | 개인 UI·개인 DM 언어는 전역 사용자 선택 하나를 공유하고, 길드 공용 시스템 문구는 길드 기본 언어를 사용한다. 공개 프로필의 사용 언어는 모집 정보일 뿐이며 운영진·회원 작성 원문은 자동 번역하지 않는다. |
| 데모 | 로그인 없는 격리된 세션 상태에서 소수의 대표 운영 흐름을 실제 상태 전이로 끝까지 체험하며, 운영 데이터에는 쓰지 않고 언제든 초기화할 수 있어야 한다. |
| 요금 | 현재는 종료일 없는 무료 베타이고 향후 길드 워크스페이스 단위 유료 플랜을 도입한다. 전환 시점·가격·포함 기능은 아직 결정하지 않는다. |
| 회원 거래 | 회원 거래장은 같은 길드 포인트를 에스크로로 사용하지만 주문·분쟁 기록은 길드 상점·기부 정책 및 길드 재정과 분리한다. |
| 길드 상점 | 일반 주문은 재고·포인트를 원자적으로 예약해 자동 접수하고 운영진은 실제 전달만 처리한다. |
| 상점 재고 베이스라인 | 일상 재고관리 수단이 아니라 최초 도입과 장부·실물 불일치 복구 때만 운영진이 전체 완제품 재고를 새 기준으로 확정하는 예외 조치다. |
| 환전 | 정상 포인트→실버 환전은 포인트를 원자적으로 보류해 자동 접수하고 운영진은 실제 인게임 지급만 처리한다. |
| 월말 정산 | 포인트 잔액을 월말 실버 채권·채무로 바꾸는 기능은 폐기하며, 과거 schema만 호환 목적으로 보존한다. |
| 입금 적립 | 금고 로그는 입금 사실만 증명하고 회원의 명시적 용도 지정이 포인트 적립 의사를 증명하며, 정확히 연결된 건만 자동 적립한다. |
| 포인트 양도 | 양도는 취소·분쟁 보호가 없는 즉시 선물·개인 정산이며 물품 거래는 회원 거래장의 에스크로를 사용한다. |
| 참가예정 | 슬롯 확정 전 참가 가능 여부와 수행 역할을 알리는 약한 가용성 신호다. 승인 대기 중에도 유지되며 확정 배정 때만 종료하고, 출석·노쇼·참여 보상·리기어·참가율의 근거로 사용하지 않는다. |
| 참여 보상 | 슬롯 배정자를 미리 채운 뒤 운영진이 예외만 수정해 한 번에 참가 명단·공통 금액·원장을 확정하며, 그 명단만 데스·리기어 여부와 무관한 지급 자격으로 사용한다. |
| 이벤트 특별 보상 | 종료된 이벤트의 예외적 기여·운영 사유에만 지급하며, 전용 권한을 가진 운영진의 한 번의 강한 최종 확인으로 원장을 원자적으로 생성한다. 정기 참가 보상이나 별도 승인 queue로 사용하지 않는다. |
| 종료 이벤트 | 종료 시 일정·편성·유효 정책·장비 기준을 변경 불가 확정본으로 잠근다. 실제 참가·보상·리기어·루팅과 정정은 연결된 별도 기록이고, 재사용은 참가 이력 없는 새 초안 복제로만 한다. |
| 이벤트 마감 | 독립 사후 리포트나 평가형 AAR을 만들지 않고 종료 이벤트 상세에서 참가 대조와 남은 보상·리기어·제작·루팅 상태만 원본 기능 링크와 함께 자동으로 보여준다. |
| 사이펀 | 길드가 기록 모드와 보관 장부 모드 중 의미를 선택하며, 어느 모드에서도 원본 로그를 바꾸거나 로그 지연만으로 자동 제재하지 않는다. |
| 루팅 검증 | 공식 회수 판정은 이벤트의 품목별 총량 기준이며, 개인 루팅·입고 행은 부족분 조사 근거일 뿐 자동 책임·제재의 근거가 아니다. |
| 빌드 템플릿 | 템플릿은 길드가 승인한 장비 선택 범위이고, 이벤트에서 실제 선택한 확정본은 이후 템플릿 수정과 분리해 리기어 기준으로 보존한다. |
| 전술 | 현재는 정확한 ZvZ 전술을 제품이 보증하지 않는 실험 기능이며 기본 비활성화한다. 외부 공유는 초대한 참가자용 만료·폐기 가능한 비공개 읽기 링크로 제한한다. |
| Menhera 콘텐츠 준수 | Menhera에만 부여하는 tenant 확장 기능이다. 참여·영상 기준의 상태와 근거는 관찰 자료이며 미준수만으로 리기어·포인트 적립·사용·양도·권한을 자동 제한하지 않는다. 다른 길드의 기능 catalog·최초 설정·내비게이션·제품 문서에는 나타나지 않는다. |
| Menhera 최근 영상 환전 자격 | Menhera의 새 포인트→실버 환전 신청에만 최근 5일 안의 유효한 영상 제출을 요구한다. 제출 성공 즉시 별도 승인 없이 자격을 얻고, 5일 경과 또는 제출 무효화 뒤 다른 유효 제출이 없으면 새 신청만 다시 제한한다. 기존 신청·리기어·포인트 적립과 사용·양도·권한에는 영향이 없다. |
| 통계 | 길드원 리더보드는 긍정적 동기부여, 운영진 통계는 운영 개선, Menhera 콘텐츠 준수는 명시적 기준 확인에만 사용하며 서로를 자동 평가·제재 근거로 대체하지 않는다. |
| 무기 사용 통계 | 통계 포함 전투에서 관측된 실제 장비를 무기군·전투 단위로 집계해 개인의 자주 사용한 무기와 길드의 조합 분포를 보여주는 편성 참고 자료다. 슬롯 배정이나 숙련도·실력·보상·권한 판정으로 사용하지 않는다. |
| 성취 배지 | 객관적 길드 활동 이정표를 처음 달성했을 때 해당 길드 회원 기록에 영구 귀속되는 비경제적 인정이다. 이후 집계 변화나 같은 길드 재가입으로 사라지지 않으며 포인트·리기어·권한·준수 판정에 사용하지 않는다. |
| 팀 전투 위업 | 공식 전투 판정이 확정한 공동 성과를 확인된 참가자 모두에게 같은 성취로 부여하는 주 전투 업적이다. 모호하거나 집계 제외된 전투, 수동 AAR·MVP·전술 평가는 입력으로 사용하지 않는다. |
| 개인 전투 위업 | 킬 기여·생존처럼 직접 관측되는 개인 사실만 인정하는 보조 전투 업적이다. 역할별 의미를 드러내고 전 역할 공통 실력 점수나 데이터로 확인할 수 없는 힐·클렌즈·클럼프 평가를 만들지 않는다. |
| 공개 프로필 | 길드 홍보·모집이 주목적이고 공개 통계는 신뢰 보조다. 프로필 전체는 명시적으로 켜며 모집 마감이어도 활성 페이지는 유지하고 가입 CTA만 제거한다. 비식별 길드 집계만 기본 공개하고 개인 식별·내부 경제 정보는 섹션별 선택을 요구한다. |
| 회원 공개 활동 | 회원 본인이 길드별로 켜는 비목록 포트폴리오 링크다. 집계형 활동 성과만 보여주고 검색 색인을 차단하며 본인의 폐기·재발급 또는 길드 연결 폐기 즉시 이전 주소를 무효화한다. |
| 백업 | 현재 잔액·재고·예약·미이행 의무와 그 최소 참조만 원본 길드에 원자적으로 복원한다. 완료 이력·일반 설정·템플릿 공유와 Discord 서버 이전은 분리한다. |

## 3. 목표 구조

```text
웹 UI ───────┐
Discord ─────┼─ Adapter ──> Application Command / Query Interface
cron·worker ─┘                         │
                                      ▼
       ┌────────────────────────────────────────────────┐
       │ 회원 신원 │ 기능 가용성 │ 오늘의 업무함       │
       │ 보급 흐름 │ 길드 상점 │ 회원 거래 │ 입출금  │
       │ 운영 변경 기록                                │
       └────────────────────────────────────────────────┘
                                      │
                                      ▼
                   Postgres transaction + outbox
                                      │
                        알림·Discord·후속 worker
```

화면이나 Discord 명령이 데이터 갱신 순서를 직접 알지 않게 한다. 각 Module은 작은 Interface 뒤에 여러 상태 변경 규칙을 숨긴다. 웹·Discord·cron은 같은 Interface를 호출하는 Adapter이며, Postgres 함수가 중요한 변경의 원자성을 보장하는 Implementation이다.

공통 명령 문맥은 다음 정보를 가진다.

```ts
interface CommandContext {
  guildId: string
  actorMemberId: string | null
  actorIdentity: {
    kind: 'discord' | 'local' | 'system'
    subjectId: string
  }
  source: 'web' | 'discord' | 'cron' | 'support'
  correlationId: string
  idempotencyKey: string
}
```

- `correlationId`: 한 사용자 행동과 후속 알림을 연결한다.
- `idempotencyKey`: 중복 클릭, Discord 재시도, worker 재실행을 한 번의 명령으로 만든다.
- `source=support`: 예외 지원용이며 정상 운영의 우회 경로로 사용하지 않는다.

### 3.1 웹과 Discord의 실행 경계

Discord는 알림과 웹 링크만 제공하는 채널이 아니라 조회와 일상적인 단건 업무를 끝내는 빠른 실행 표면이다.

- Discord와 웹은 별도 mutation을 구현하지 않고 같은 application command와 원자적 DB 경계를 호출한다.
- 조회·상태 확인, 단건 참가 취소, 수주·반납·수령, 정상 상점 주문처럼 대상과 결과가 명확한 행동은 Discord에서 완료한다.
- 포인트 양도·상점 주문·제작 납품·이벤트 시작처럼 금전·재고·후속 상태를 바꾸는 단건 행동은 대상·금액·차감·결과 snapshot을 ephemeral 메시지로 먼저 보여주고 확인 버튼으로 실행한다.
- 확인 버튼은 길드·실행자·command·입력 snapshot에 묶고 짧게 만료하며, 재클릭·Discord 재전송은 같은 idempotency key로 기존 결과를 돌려준다.
- 설정·권한·대량 작업·분쟁·복합 예외는 필요한 비교 문맥을 가진 웹 심화 처리로 연결한다.
- 완료 응답은 성공 여부만 말하지 않고 바뀐 최신 상태와 상세 웹 링크를 제공한다.
- 현재 포인트 양도·상점 주문·제작 납품·이벤트 시작 명령이 입력 즉시 mutation을 실행하는 부분은 확인형 빠른 실행으로 교체한다.

## 4. 회원 신원 Module

### 4.1 책임

회원 신원 Module은 “로그인한 주체가 이 길드의 어떤 길드 회원 기록인가”만 책임진다. 포인트, 이벤트, 리기어 같은 다른 Module은 Discord ID나 로컬 계정 ID를 직접 소유자로 사용하지 않는다.

### 4.2 데이터 모델

#### `guild_member_records`

길드 안에서 변하지 않는 회원 주체다.

| 필드 | 의미 |
|---|---|
| `id` | UUID, 다른 업무 테이블이 참조할 영속 식별자 |
| `guild_id` | 길드 워크스페이스 |
| `status` | `active`, `withdrawn`, `suspended` |
| `display_name_override` | nullable, `MEMBERS_MANAGE` 운영진이 설정한 길드 범위 표시명 |
| `joined_at`, `withdrawn_at` | 길드 범위 재적 이력 |
| `created_at`, `updated_at` | 관리 시각 |

화면에서 사용하는 길드 표시명은 저장된 projection이 아니라 `display_name_override → 확인된 Albion 현재 캐릭터명 → 안전한 Discord 표시명` 순서로 해석한다. 전역 지원용 `site_user_nickname_overrides`는 이 필드로 재사용하거나 모든 길드에 일괄 backfill하지 않는다.

#### `guild_member_access_identities`

한 길드 회원 기록에 접근 수단을 연결한다.

| 필드 | 의미 |
|---|---|
| `guild_member_id` | 길드 회원 기록 |
| `guild_id` | RLS·검증용 중복 테넌트 키 |
| `identity_kind` | `discord`, `local` |
| `subject_id` | Discord 사용자 ID 또는 로컬 계정 ID |
| `status` | `active`, `revoked` |
| `linked_at`, `revoked_at` | 접근 이력 |

제약:

- `unique(guild_id, identity_kind, subject_id)`로 한 접근 신원이 같은 길드의 두 회원 기록에 동시에 붙지 않게 한다.
- 같은 Discord `subject_id`는 다른 `guild_id`에서 다시 사용 가능하다.
- 로컬 비밀번호 hash는 이 테이블이 아니라 기존 로컬 자격 증명 저장소에 둔다.

#### `albion_characters`

게임 캐릭터의 전역 식별 정보다.

| 필드 | 의미 |
|---|---|
| `id` | 내부 UUID |
| `server` | Albion 서버 |
| `player_id` | API가 제공하는 안정 ID |
| `current_name` | 현재 닉네임 |
| `last_verified_at` | 마지막 API 확인 시각 |

`unique(server, player_id)`를 둔다. 닉네임 문자열은 식별자가 아니다.

#### `guild_character_memberships`

캐릭터와 길드 회원 기록의 길드 재적 이력을 보존한다.

| 필드 | 의미 |
|---|---|
| `character_id` | Albion 캐릭터 |
| `guild_member_id` | 그 기간의 길드 회원 기록 |
| `guild_id` | 길드 |
| `relation` | `home`, `alliance`, `external` |
| `trust_status` | `verified`, `unverified`, `disputed` |
| `started_at`, `ended_at` | 활성 기간 |

핵심 제약:

```sql
unique (character_id) where ended_at is null
```

이 제약이 동시에 두 길드에 같은 캐릭터가 활성화되는 경쟁 조건까지 DB에서 막는다.

### 4.3 Interface

```ts
interface GuildIdentityModule {
  resolveMember(context: AccessContext): Promise<ResolvedGuildMember>
  linkDiscordIdentity(command: LinkDiscordIdentity): Promise<LinkResult>
  mergeMemberRecords(command: MergeMemberRecords): Promise<MergeResult>
  transferCharacter(command: TransferCharacter): Promise<TransferResult>
  setGuildDisplayName(command: SetGuildDisplayName): Promise<DisplayNameResult>
  applyDiscordNickname(command: ApplyDiscordNickname): Promise<DiscordNicknameResult>
  listAccessibleWorkspaces(discordUserId: string): Promise<WorkspaceAccess[]>
}
```

호출부는 `local:<uuid>`와 숫자 Discord ID를 구분하는 분기를 갖지 않는다.

### 4.4 로컬 계정 → Discord 연결

1. 로컬 사용자가 현재 길드에서 Discord 연결을 선택한다.
2. OAuth callback이 동일 길드의 Discord 접근 신원을 확인한다.
3. Discord 접근 신원이 아직 없으면 현재 길드 회원 기록에 추가한다.
4. 이미 다른 길드 회원 기록에 있으면 병합 후보를 계산한다.
5. 같은 검증된 Albion 캐릭터이고 충돌이 없으면 자동 병합한다.
6. 캐릭터 불일치, 분쟁 상태, 고위험 권한 충돌만 오늘의 업무함에 보낸다.
7. 활동·포인트·신청 행을 삭제하지 않는다. 최종 `guild_member_id`만 동일한 기록으로 귀속한다.
8. 병합 commit 시 로컬 credential version을 올리고 기존 로컬 session을 폐기한다. 이후 로그인은 연결한 Discord 신원을 사용한다.

운영진이 모든 연결을 승인하지 않는다. 증거가 일치하는 정상 경로는 자동 처리하고 모순만 검토한다.

### 4.5 캐릭터 길드 이전

1. 새 길드에서 캐릭터 인증을 요청한다.
2. Albion API가 새 홈 길드 관계를 확인한다.
3. 트랜잭션에서 현재 활성 `guild_character_memberships` 행을 잠근다.
4. 이전 연결의 `ended_at`을 기록하고 이전 길드 회원 기록을 `withdrawn` 처리한다.
5. 새 길드 회원 기록에 새 활성 연결을 만든다.
6. 이전 길드의 포인트·정산·이벤트·리기어 이력은 그대로 둔다.
7. 양쪽 길드에 운영 변경 기록을 남기고 필요한 알림은 outbox로 보낸다.
8. API 확인이 불가능하거나 길드 정보가 모순일 때만 `identity_conflict` 업무를 만든다.

### 4.6 회원 비활성화와 동일 길드 재가입

회원 비활성화는 기록 삭제가 아니라 같은 길드에서의 신규 행동 자격을 잠시 닫는 재적 상태다.

1. Discord 동기화에서 서버 이탈 또는 활성 회원 역할 상실을 확인하면 기존 길드 회원 기록을 `withdrawn`으로 전환한다.
2. 비활성 회원은 신규 이벤트 신청·상점 주문·환전·회원 거래·리기어 신청과 운영 command를 실행할 수 없다.
3. 기존 포인트·활동·리기어·거래 이력과 미완료 지급·환불·에스크로·제작 의무는 이동하거나 삭제하지 않는다.
4. 담당 운영진과 scheduler는 비활성 회원의 기존 의무를 정상적으로 지급·환불·종결할 수 있다.
5. 같은 Discord 접근 신원이 현재 활성 역할을 다시 얻으면 새 행을 만들지 않고 같은 길드 회원 기록을 `active`로 전환한다.
6. 재가입 시 회원의 과거 잔액과 이력은 그대로 이어지고 capability는 현재 Discord 역할과 유효한 개인 권한 예외만으로 다시 계산한다.
7. 접근 신원이나 Albion 캐릭터가 기존 기록과 모순되면 자동 재활성화하지 않고 `identity_conflict`로 분리한다.

현재 `member-sync`가 `guild_avatars.withdrawn_at`을 설정·해제하며 같은 행을 재사용하는 방향은 이 의도와 일치한다. 최종 신원 모델에서도 이 전이는 안정적인 `guild_member_id` 위에서 유지한다.

### 4.7 여러 길드 전환 UX

다중 길드는 지원하지만 일반적인 사용 방식은 아니다. 단일 길드 사용자의 진입과 회원 화면에 전환 개념을 강요하지 않는다.

- 접근 가능한 활성 워크스페이스가 하나면 별도 선택 화면·전환 카드·전 길드 query 없이 해당 길드를 바로 연다.
- 둘 이상인 Discord 사용자에게만 전역 “내 길드” 선택기와 현재 길드 표시를 보조적으로 노출한다.
- 길드별 카드는 길드명·현재 역할·다음 이벤트·미처리 개인 업무 수·포인트처럼 짧은 요약을 독립적으로 보여줄 수 있다.
- 여러 길드의 잔액·이벤트·리기어·업무를 합산하거나 하나의 timeline·업무함으로 섞지 않는다.
- 앱은 마지막 활성 길드를 기억해 일반 진입점으로 사용하고, 권한 있는 다른 길드 deep link는 대상 길드로 바로 전환한다.
- 워크스페이스 선택 시 대상 길드 host로 짧은 수명의 일회용 handoff token을 보내고, 대상 host가 자체 테넌트 세션을 만든 뒤 token을 폐기한다.
- 전환 뒤 모든 query·command·권한은 하나의 활성 길드 문맥만 사용하며 다른 길드 식별자를 client 입력으로 신뢰하지 않는다.
- 전환은 회원·캐릭터·잔액·권한·이력을 옮기는 조치가 아니고, 길드별 역할과 기능 상태는 대상 문맥에서 다시 계산한다.
- 로컬 길드 계정은 한 워크스페이스에만 속하므로 전환 UI를 노출하지 않는다.
- 현재 `/me`의 전 길드 활동 기록·잔액·신청 query는 다중 길드 선택기로 이동하고, 단일 길드 회원 화면에서는 실행하지 않는다.

### 4.8 회원 상세 정보 가시성

회원 상세는 한 개의 큰 DTO를 권한에 따라 일부 숨기는 방식이 아니라 목적별 서버 응답으로 분리한다.

- **길드원 내부 명부**는 현재 활성 회원만 검색하며 안전한 Discord 표시명·Albion 캐릭터·역할·긍정적 활동 요약만 반환한다.
- 게스트·탈퇴 회원·사이트 미연결 인게임 인원·신원 문제와 관리 작업은 별도 **회원 운영 명부**에서만 다룬다.
- 비활성 회원 기록은 과거 이벤트·원장·의무 참조를 위해 보존하지만 일반 명부와 일반 회원 검색에서는 즉시 제외한다.
- 이벤트 범위의 게스트는 정식 길드 회원으로 전환되기 전에는 길드원 내부 명부에 포함하지 않는다.
- `MEMBERS_VIEW` 또는 길드 내부 활동 조회는 캐릭터·참여·역할·전투 통계·업적만 담은 **길드 내부 활동 프로필**을 반환한다.
- 포인트 잔액·누적 획득/사용·원장, 리기어 신청·금액·영상, 상점·환전·기부 내역과 Menhera 콘텐츠 준수 근거는 **회원 비공개 운영 정보**다.
- 폐기 전 남아 있는 체험 메모와 부재 사유도 본인과 필요한 운영자 외에는 노출하지 않는다.
- 본인은 자신의 비공개 운영 정보를 볼 수 있다. 운영진은 재정·리기어·Menhera 콘텐츠 준수·회원 관리처럼 맡은 업무의 전용 capability 범위만 볼 수 있다.
- 운영진 운영 통계의 집계 조회와 개인별 비공개 상세 조회 권한을 분리한다.
- Client Component에는 이미 필터링된 DTO만 전달하며 CSS 숨김이나 렌더 분기로 민감 필드를 보호하지 않는다.
- 목록·검색·개인 상세·직접 URL·server action은 같은 membership·capability 경계를 적용해 숨겨진 tab 주소나 Albion 상세 주소로 우회할 수 없게 한다.
- 회원 공개 활동 링크는 회원의 명시적 opt-in을 유지하되 집계형 공개 활동 요약 DTO만 사용하고 비공개 운영 정보와 정확한 작전 타임라인을 포함하지 않는다.
- 현재 `/members/[discordId]`가 `MEMBERS_VIEW` 보유자에게 `balance`, `lifetime_earned`, `lifetime_spent`, 리기어 금액·영상이 포함된 전체 `GuildMemberDetail`을 전달하는 동작은 이 경계와 충돌하므로 분리한다.

### 4.9 전환 전략

기존 90개 이상의 Discord ID 참조를 한 번에 바꾸지 않는다.

1. 새 신원 테이블을 추가하고 `guild_avatars`, 로컬 계정, 기존 Albion link에서 backfill한다.
2. 중복 캐릭터 후보를 먼저 `disputed`로 격리한 뒤 활성 membership partial unique index를 만든다.
3. 기존 행에 nullable `guild_member_id`를 추가한다.
4. 신규 쓰기는 `guild_member_id`와 기존 `discord_id`를 dual-write한다.
5. 조회 결과가 같은지 shadow 검증한다.
6. 재정·보급·이벤트처럼 소유권이 중요한 영역부터 `guild_member_id` 읽기로 전환한다.
7. 모든 소비자가 전환된 뒤 기존 `discord_id` 소유권 컬럼을 호환용 projection으로만 유지한다.
8. 최소 두 번의 안정 배포 후 legacy write와 분기 코드를 제거한다.

### 4.10 게임 신원·길드 표시명·Discord 닉네임

세 이름은 소유권과 변경 명령을 분리한다.

1. **확인된 Albion 캐릭터명**은 `albion_characters.current_name`에 API가 확인한 게임 신원이다. 문자열 자체는 영속 식별자가 아니며 길드 운영진이 수정할 수 없다.
2. **길드 표시명**은 `guild_member_records.display_name_override`에 속하는 길드별 운영 별칭이다. `MEMBERS_MANAGE` 운영진만 설정·해제하며 같은 Discord 사용자의 다른 길드 표시명이나 전역 사용자명에는 영향을 주지 않는다.
3. **Discord 서버 닉네임**은 외부 Discord 서버가 소유한 값이다. 사이트의 길드 표시명 저장과 Discord 서버 닉네임 적용은 별도 command다.

길드 표시명 resolver는 명시적 override, 확인된 Albion 현재 캐릭터명, 안전한 Discord 표시명 순서다. override를 해제하면 다음 요청부터 fallback 결과를 사용한다. 회원 상세·리기어·통계처럼 게임 신원 확인이 중요한 표면은 길드 표시명만으로 원본을 가리지 않고 확인된 Albion 캐릭터명도 함께 구분해 보여준다.

길드 표시명 설정·해제는 현재 길드와 대상 회원을 서버에서 해석하고, 변경 전·후 값·실행자·시각을 같은 트랜잭션의 운영 변경 기록에 남긴다. 전역 서비스 지원용 `site_user_nickname_overrides`를 이 기능의 저장소로 사용하지 않는다.

신뢰된 캐릭터를 처음 연결하면 현재 해석된 길드 표시명으로 Discord 서버 닉네임 적용을 한 번 시도한다. API가 같은 캐릭터 ID의 실제 이름 변경을 확인했고 별도 길드 표시명 override가 없다면 바뀐 resolver 결과로 한 번 더 시도할 수 있다. 그 밖에는 권한 있는 운영진이 명시적인 `Discord에 적용` command를 실행할 때만 현재 resolver 결과를 한 번 전송한다.

일반 신원 refresh와 길드 표시명 저장은 Discord 서버 닉네임을 바꾸지 않는다. 회원이 Discord에서 직접 바꾼 값도 자동으로 되돌리지 않는다. Discord 권한·역할 순위 문제로 적용이 실패하면 사이트의 길드 표시명·캐릭터 연결·회원 접근·재화 기능을 rollback하지 않고 실패 결과와 재시도 경로만 제공한다. Discord 적용은 Albion 캐릭터 신원을 수정하거나 캐릭터 소유권을 증명하는 조치가 아니다.

## 5. 보급 흐름 Module

### 5.1 현재 가장 큰 위험

현재 제작 전달 흐름은 제작 작업을 `delivered`로 확정한 뒤 애플리케이션에서 재고를 best-effort로 차감한다. 두 번째 작업이 실패하면 “전달 완료지만 재고는 그대로”인 상태가 가능하다.

현재 정산 흐름도 제작자가 납품 시 `material_silver_cost`를 직접 입력한 뒤 운영진이 `pending` 건을 승인·조정·거절한다. 최종 구조에서는 이 사후 입력·건별 심사를 제거하고 작업 수락 때 고정된 조건을 박스 입고와 함께 자동 확정한다.

최종 구조에서는 보급 상태, 재고, 지급 원장, 운영 변경 기록을 Postgres의 같은 트랜잭션에서 처리한다. 알림 전송만 commit 이후 outbox에서 수행한다.

### 5.2 데이터 모델

#### `supply_fulfillments`

리기어 요청 또는 길드 제작 주문의 이행 상태를 나타낸다.

| 필드 | 의미 |
|---|---|
| `id` | 이행 ID |
| `guild_id` | 길드 |
| `source_kind`, `source_id` | `regear_request`, `guild_order` |
| `mode` | `silver`, `stock`, `craft` |
| `status` | 아래 상태 머신 |
| `material_source` | `guild_stock`, `crafter_purchase`, `not_applicable` |
| `craft_fee_mode` | `none`, `configured`, `not_applicable` |
| `material_reimbursement_silver`, `craft_fee_silver`, `settlement_total_silver` | 작업 수락 때 고정되는 정산 금액 |
| `settlement_terms_accepted_at` | 제작자가 고정 정산 조건을 수락한 시각 |
| `snapshot` | 승인 당시 빌드·수량·가격의 변경 불가 snapshot |
| `receipt_due_at`, `receipt_overdue_at` | 수령 확인 예정 시각과 지연 전환 시각 |
| `completed_at`, `returned_unclaimed_at`, `cancelled_at` | 수령 완료·미수령 회수·취소 시각 |
| `version` | 낙관적 동시성 검사용 |

상태:

```text
awaiting_decision
  ├─ silver ───────────────────────────────> completed
  ├─ stock ────────────────────────────────> completed
  └─ craft -> queued -> in_progress -> ready_for_pickup ─────> completed
                                      └─> receipt_overdue ───> completed
                                      │        └─ box moved ─> ready_for_pickup
                                      └─ unclaimed return ───> returned_unclaimed
                         receipt_overdue ── unclaimed return ─> returned_unclaimed
awaiting_decision / queued / in_progress ────────────────────> cancelled
```

리기어 신청의 `pending/approved/rejected`는 심사 상태다. `supply_fulfillments.status`는 실제 지급·제작 완료 상태다. 둘을 같은 status로 표현하지 않는다.

제작 리기어에서 `ready_for_pickup`은 **제작 리기어 박스 입고**, `completed`는 **제작 리기어 수령 완료**에 대응한다. 박스 입고는 제작자의 납품 완료일 뿐 보급 이행의 최종 완료가 아니며, 신청자가 수령을 확인해야 `completed`가 된다. 각 박스는 입고 뒤 신청자 수령, 운영진의 미수령 회수 종료 또는 이동이 확인될 때까지 점유한다.

`returned_unclaimed`는 **미수령 회수 종료**에 대응하는 종료 상태다. 운영진이 이 조치를 실행하면 반납 장비를 완제품 장부 재고에 더하고 기존 박스를 해제하며 현재 지급 건을 끝낸다. 리기어 승인 기록과 최초 입고로 발생한 제작자 정산 권리는 유지하지만 활성 재지급 상태는 만들지 않는다. 나중에 다시 지급하려면 새 `supply_fulfillment`를 명시적으로 생성한다.

**제작자 정산** 권리는 `ready_for_pickup` 전환과 동시에 발생한다. 신청자의 수령 확인은 정산의 선행 조건이 아니다. **제작 재료 조달 방식**과 **제작 수수료**는 독립적으로 저장한다.

- `guild_stock + none`: 재료비 0원, 제작 수수료 0원
- `crafter_purchase + none`: 제작자가 부담한 재료비만 정산
- `crafter_purchase + configured`: 재료비와 길드 정책의 제작 수수료 정산
- `guild_stock + configured`: 재료비 없이 제작 수수료만 정산

제작자가 작업을 가져가기 전 **제작 정산 조건**을 품목별 금액과 합계로 보여준다. `crafter_purchase`의 재료비는 승인된 리기어 snapshot에 포함된 제작 대상 품목 가격 합계로 계산하고, `guild_stock`의 재료비는 0원이다. 제작 수수료를 포함한 총액은 `claimCraft` 성공 시 고정하며 실제 원재료 구매액과 이후 시세 변동은 반영하지 않는다.

제작자는 납품할 때 재료비를 입력하지 않는다. `deliverCraft`는 수락된 고정 금액을 변경하지 않고 박스 입고와 함께 **제작 정산 확정**을 자동 기록한다. 건별 `pending → approved/rejected` 심사는 신규 작업에서 제거하며, 실제 묶음 지급 완료는 이 확정과 별도다.

확정된 금액은 제작자별 미지급 실버 합계로 보여준다. 운영진은 고정 정산 주기를 설정하거나 납품 건마다 승인하지 않고, 게임 안에서 실버를 전달한 시점에 포함된 정산 항목을 한 번에 지급 완료 처리한다. 원본 항목은 합계 아래에 남겨 어떤 제작 작업이 포함됐는지 확인할 수 있게 한다.

재료 조달 방식은 제작자 정산에만 사용한다. 완제품 재고 차감 여부를 결정하지 않는다. 제작 리기어는 원재료·예약·정확한 출처를 추적하지 않고, 모든 박스 입고를 **완제품 장부 재고**에서 먼저 차감한다.

#### `guild_inventory_movements`

현재 수량만 저장하는 재고 projection과 별도로 변경 원장을 둔다.

| 필드 | 의미 |
|---|---|
| `guild_id`, `item_id` | 테넌트와 아이템 |
| `delta` | 입고 양수, 출고 음수 |
| `reason` | `baseline`, `manual_adjustment`, `stock_fulfillment`, `craft_delivery`, `unclaimed_return`, `reversal` |
| `reference_kind`, `reference_id` | 원인이 된 보급 이행·작업 |
| `line_key` | 같은 item이 여러 slot에 있을 때도 수량을 구분하는 안정 key |
| `actor_member_id` | 실행자 |
| `correlation_id` | 같은 명령·기록·알림 연결 |
| `created_at` | 변경 시각 |

제약:

- `(guild_id, reference_kind, reference_id, reason, line_key)`에 idempotency unique key를 둔다.
- `guild_inventory_gear`는 정확한 실물 원장이 아니라 **완제품 장부 재고**의 현재 수량 projection으로 유지한다.
- movement 삽입과 projection 갱신은 같은 함수·트랜잭션에서 수행한다.
- 직접 재고 출고는 재고가 부족하면 전체 명령을 실패시킨다.
- 제작 리기어 박스 입고는 조달 출처와 무관하게 품목별 현재 장부 수량을 0까지 차감한다.
- 장부 수량보다 많이 납품한 부분은 재고를 음수로 만들지 않고 **재고 외 조달**로 기록한다.
- 수동 절대 수량 재조정은 기존 movement를 수정하지 않고 `manual_reconciliation` movement로 남긴다.

#### `supply_outside_stock_fulfillments`

완제품 장부 재고로 충당하지 못한 정상 납품분을 기록한다. 오류나 운영진 처리 대기 상태가 아니다.

| 필드 | 의미 |
|---|---|
| `fulfillment_id`, `task_id` | 관련 이행과 제작 작업 |
| `item_id`, `line_key`, `quantity` | 장부 재고 밖에서 충당된 품목과 수량 |
| `material_source` | 정산을 위한 `guild_stock`, `crafter_purchase` |
| `actor_member_id`, `correlation_id` | 납품 주체와 명령 |
| `created_at` | 기록 시각 |

재고 외 조달은 박스 입고를 막지 않으며 자동으로 오늘의 업무함에 올리지 않는다. 통계와 재고 보충 판단에만 사용한다.

#### `domain_outbox`

commit 이후 실행할 알림·Discord 메시지를 저장한다.

| 필드 | 의미 |
|---|---|
| `guild_id`, `topic` | 테넌트와 알림 종류 |
| `aggregate_kind`, `aggregate_id` | 관련 업무 객체 |
| `payload` | 최소 알림 데이터 |
| `correlation_id` | 원 명령 |
| `status`, `attempts`, `available_at` | 재시도 상태 |

동일 aggregate·topic·correlation 조합은 한 번만 생성한다.

### 5.3 Interface

```ts
interface SupplyModule {
  approve(command: ApproveSupplyRequest, context: CommandContext): Promise<SupplyResult>
  claimCraft(command: ClaimCraftTask, context: CommandContext): Promise<SupplyResult>
  deliverCraft(command: DeliverCraftTask, context: CommandContext): Promise<SupplyResult>
  collect(command: CollectSupply, context: CommandContext): Promise<SupplyResult>
  closeUncollectedCraft(command: CloseUncollectedCraft, context: CommandContext): Promise<SupplyResult>
  moveCraftBox(command: MoveCraftBox, context: CommandContext): Promise<SupplyResult>
  convertToSilver(command: ConvertSupplyToSilver, context: CommandContext): Promise<SupplyResult>
  cancel(command: CancelSupply, context: CommandContext): Promise<SupplyResult>
  getCase(query: SupplyCaseQuery): Promise<SupplyCase>
}
```

각 command는 명시적인 SQL RPC Adapter로 번역한다. 범용 JSON RPC 하나로 모든 상태를 바꾸지 않는다.

### 5.4 트랜잭션 규칙

`deliverCraft` 한 번에 다음이 함께 일어난다.

1. 길드·권한·현재 상태·version을 검증한다.
2. 같은 `idempotencyKey`가 처리됐으면 기존 결과를 반환한다.
3. 필요한 재고 행을 `for update`로 잠근다.
4. 허용되지 않은 box 번호면 아무 상태도 바꾸지 않고 실패한다.
5. 품목별로 `min(장부 재고, 납품 수량)`을 차감하고 나머지를 재고 외 조달로 기록한다.
6. craft task를 박스 입고로, fulfillment를 `ready_for_pickup`으로 갱신한다.
7. inventory movement를 추가하고 현재 재고 projection을 갱신한다.
8. 작업 수락 때 고정한 재료비와 제작 수수료 합계를 별도 승인 없이 제작자 지급 예정액으로 기록한다.
9. 운영 변경 기록을 삽입한다.
10. 알림 outbox를 삽입한다.
11. 모두 성공하면 commit한다.

Discord 빠른 승인도 웹과 같은 command를 호출하므로 별도 규칙을 갖지 않는다.

신청자의 수령 확인은 별도 `collect` command로 처리한다. 이 command가 박스 점유를 해제하고 fulfillment를 `completed`로 전환한다.

확인 기한이 지나도 자동 완료하거나 박스를 해제하지 않는다.

- scheduler는 `ready_for_pickup`을 `receipt_overdue`로 바꾸고 신청자 알림과 `craft_receipt_overdue` 업무를 만든다.
- `receipt_overdue` 동안 기존 box 번호의 unique 점유를 유지한다.
- 신청자 수령 확인은 `completed`로 전환하고 **회차 박스 해제**를 수행한다.
- 운영진의 **미수령 회수 종료**는 장비를 완제품 장부 재고에 다시 더하고 박스를 해제한 뒤 fulfillment를 `returned_unclaimed`로 종결한다.
- 회수 종료는 리기어 승인 기록과 최초 입고로 확정된 제작자 정산을 되돌리지 않으며 새 업무를 자동 생성하지 않는다.
- 나중에 다시 지급할 때만 운영진이 같은 승인 기록을 근거로 새 지급 건을 만든다.
- 운영진의 박스 이동은 기존 박스를 해제하고 새 박스를 점유하며, 재고·제작자 정산은 변경하지 않는다.
- `craft_box_expiry_days`는 구현 전환 시 `craft_receipt_followup_days` 의미로 이관하고, 기존 `expired` 자동 전이는 제거한다.

### 5.5 기존 데이터 정합성 회복

과거 movement를 추정해 현재 재고를 자동 수정하지 않는다.

1. 현재 재고를 `baseline` movement로 기록한다.
2. 이미 전달된 craft task와 현재 재고의 잠재 불일치를 읽기 전용 보고서로 만든다.
3. 확실한 건만 idempotent repair command로 보정한다.
4. 모호한 건은 `supply_attention` 업무로 보낸다.
5. 기준 시각 이후 신규 변경만 movement 합계와 현재 재고가 항상 같도록 강제한다.

## 6. 회원 거래 Module

### 6.1 경계

회원 거래장은 길드 상점이 아니다. 판매 물품은 회원 소유이고 앱은 아이템을 보관하거나 게임 내 전달을 검증하지 않는다. 다만 구매자의 길드 포인트를 **회원 거래 에스크로**로 보류하고 주문 상태에 따라 회원 사이에서 이전하거나 구매자에게 돌려준다.

- 회원 거래 주문·가격 제안·에스크로·분쟁 기록은 전용 원장에 둔다.
- 사용 가능 포인트 계산과 최종 회원 간 이전은 공통 길드 포인트 원장을 사용한다.
- 거래 금액은 길드 재정의 수입·지출로 잡지 않는다.
- 가격 제안만으로는 포인트를 보류하지 않고 판매자가 수락해 주문이 생길 때 다시 잔액·재고를 검증한다.

### 6.2 주문 상태

```text
active listing / accepted offer
  └─> awaiting_delivery + escrow held
        ├─ cancel or delivery timeout ───────────────> cancelled + escrow refunded
        └─ seller marks delivered ──────────────────> delivered
              ├─ buyer confirms receipt ────────────> completed + escrow released
              ├─ 72h without response ──────────────> completed + escrow auto-released
              └─ buyer opens dispute ───────────────> disputed
                    ├─ operator releases all ────────> completed
                    └─ operator refunds all ─────────> refunded
```

판매자의 전달 완료는 실제 아이템 전달에 대한 자기 신고이며 거래 완료가 아니다. 이 시점에 `confirmation_due_at = delivered_at + 72 hours`를 고정하고 구매자에게 수령 확인과 분쟁 제기 방법을 알린다.

구매자가 **거래 수령 확인 기한** 안에 아무 행동도 하지 않으면 scheduler가 **무응답 자동 지급**을 수행한다. `delivered` 상태와 보류 중인 에스크로를 같은 트랜잭션에서 잠그고 구매자 차감·판매자 적립·에스크로 해제·주문 완료·거래 사건·운영 변경 기록을 함께 반영한다. 알림은 commit 이후 outbox에서 전송한다.

구매자가 기한 안에 **회원 거래 분쟁**을 열면 자동 지급 대상에서 즉시 제외한다. 분쟁은 오늘의 업무함에 표시하고 운영진은 사유를 기록한 뒤 `release_all` 또는 `refund_all`만 선택한다. 부분 지급, 자동 판정, 기한 경과에 따른 분쟁 강제 종결은 지원하지 않는다.

72시간은 첫 구현의 고정 정책으로 두고 길드별 설정을 추가하지 않는다. 기능이나 알림이 일시 중단돼도 이미 생성된 주문의 에스크로 해소 scheduler는 `draining` 처리로 계속 동작한다.

## 7. 길드 상점 Module

### 7.1 주문 구분

현재 코드는 모든 주문을 `pending`으로 만들고 재고만 먼저 예약한다. 포인트는 보류하지 않은 채 운영진 승인 시 다시 잔액을 검사하므로, 정상 카탈로그 주문도 관리자가 처리해야 하고 여러 대기 주문이 같은 포인트를 중복 사용하려는 상태가 생길 수 있다. 또한 `approve_shop_order`의 `p_total_points_override`는 운영진이 신청 금액을 바꾸면서 바로 차감할 수 있어, 인상된 가격에 대한 회원의 추가 동의가 없다.

최종 구조는 주문을 둘로 나눈다.

- **일반 상점 주문**: 카탈로그 가격·재고·포인트를 서버가 확정할 수 있어 자동 접수한다.
- **가격 검토 주문**: 회원 제시 가격·특수 아이템처럼 자동 가격을 신뢰할 수 없어 운영진이 가격만 검토한다.

가격 검토 주문은 드문 예외가 아니라 자주 발생하는 정상 경로로 취급한다. 일반 주문은 관리자 승인 queue에 들어가지 않는다. 운영진에게 필요한 행동은 예약된 물품의 실제 준비와 **상점 전달 완료**뿐이다.

### 7.2 주문 상태와 예약

```text
catalog order submit
  └─> ready_for_fulfillment + stock reserved + points held
        ├─ member cancels before delivery ───────────> cancelled + reservations released
        └─ operator delivers ────────────────────────> completed + point debit committed

price-review order submit
  └─> pending_review + stock reserved + submitted points held
        ├─ rejected or member cancels ───────────────> cancelled + reservations released
        ├─ final price <= submitted price ───────────> ready_for_fulfillment
        │                                               + excess hold released
        └─ final price > submitted price ────────────> awaiting_member_confirmation
                                                        ├─ member accepts + extra points held
                                                        │  └─> ready_for_fulfillment
                                                        └─ member rejects or 48h passes
                                                           └─> cancelled + reservations released
```

**상점 주문 예약**은 주문 생성과 같은 트랜잭션에서 수행한다.

1. 회원의 사용 가능 포인트와 기존 보류액을 잠근다.
2. 카탈로그 가격 snapshot과 재고 행을 잠근다.
3. 모든 주문선의 재고와 포인트가 충분한지 검증한다.
4. 가용 재고에서 주문 수량을 제외하고 주문 금액의 포인트 hold를 만든다.
5. 주문·주문선·예약·운영 변경 기록·알림 outbox를 함께 저장한다.
6. 하나라도 실패하면 주문을 만들지 않는다.

가격 검토 주문도 제출 시 신청 금액만큼의 포인트와 재고를 예약한다. 운영진은 **상점 최종 가격 제안**으로 총액을 한 번 확정한다.

- 최종 가격이 신청 금액과 같거나 낮으면 회원의 기존 동의 범위이므로 바로 `ready_for_fulfillment`로 전환한다. 낮아진 차액의 hold는 같은 트랜잭션에서 해제한다.
- 최종 가격이 신청 금액보다 높으면 `awaiting_member_confirmation`으로 전환하고 회원에게 알린다. 재고와 기존 신청 금액 hold는 유지하지만 차액을 미리 예약하지 않는다.
- 회원은 48시간 안에 수락하거나 거절한다. 수락할 때 차액까지 원자적으로 예약할 수 있어야 `ready_for_fulfillment`로 전환한다. 포인트가 부족하면 상태는 그대로 두고 필요한 차액을 보여준다.
- 거절하거나 48시간 동안 응답하지 않으면 주문을 취소하고 재고와 기존 포인트 hold를 모두 해제한다.
- 운영진이 최종 가격을 제시한 시점에 `shop_price_review` 업무는 끝난다. 이후의 재확인은 회원 셀프서비스 상태이며 운영진의 미처리 업무로 계산하지 않는다.
- 회원이 동의한 금액보다 높은 포인트를 운영진이 바로 차감하는 경로는 허용하지 않는다.

예약 포인트는 회원 잔액에 표시하되 상점·회원 거래·환전에서 사용할 수 없다. 운영진이 **상점 전달 완료**를 실행하면 hold를 실제 `shop_purchase` 차감으로 전환하고 주문을 `completed`로 끝낸다. 회원의 별도 수령 승인은 요구하지 않는다.

전달 전 회원 취소나 운영진 거절은 재고와 포인트 예약을 같은 트랜잭션에서 모두 복구한다. 일반 주문은 `shop_fulfillment` 업무에, 가격이 확정되지 않은 주문만 `shop_price_review` 업무에 표시한다.

### 7.3 상점 재고 베이스라인

**상점 재고 베이스라인**은 평소 재고를 입력하는 화면이 아니다. 완제품 재고는 상자 입출고 로그, 상점 전달, 제작 리기어 지급 같은 정상 사건으로 계속 증감하고, 베이스라인은 다음 두 경우에만 사용한다.

1. 길드가 상점 재고 장부를 처음 도입할 때
2. 로그 누락이나 과거 오류로 장부와 인게임 상자의 실제 수량이 어긋나 복구가 필요할 때

운영진은 인게임 상자의 완제품을 전량 출고한 뒤 다시 입고한 구간의 로그를 붙여넣고, 품목별 수량·총량·입고 구간·입고자·기존 장부와의 변경 차이를 미리 본 뒤 명시적으로 확정한다. 확정은 기존 베이스라인을 대체하되 기준 시각 뒤에 발생한 정상 입출고를 다시 반영해 최신 사건을 잃지 않는다. 적용 결과와 변경 차이, 실행 운영진, 메모는 운영 변경 기록으로 남긴다.

이 기능은 정기 업무·자동 스케줄·운영진 업무함 항목을 만들지 않는다. 일상적인 재고 조정은 정상 입출고나 사유가 있는 별도 조정 기록으로 처리하며, 베이스라인을 편리한 수동 덮어쓰기로 사용하지 않는다.

### 7.4 공통 시세 기준과 업무 확정 가격

상점과 리기어는 같은 외부 시세 설정을 사용하지만 시세를 업무상 확정 가격으로 취급하지 않는다. **길드 시세 기준**은 서버·기준 도시·가격 기간·품질 기준을 소유하고, 각 기능은 **시세 추정값**의 신뢰도에 맞는 별도 행동을 결정한다.

| 기능·시점 | 시세의 역할 | 확정 규칙 |
|---|---|---|
| 상점 카탈로그 | 수동 고정가가 없을 때 자동 표시 가격 | 주문 접수 시 실버·환율·포인트 총액 snapshot |
| 자동 리기어 생성 | 부위별 수정 가능한 초기 추산 | 항상 `pending`, 청구자 수정 뒤 승인 시 고정 |
| 제작 작업 | 승인된 리기어 품목 가격의 입력 근거 | 제작자 수락 시 제작 정산 조건 고정 |

- 기준 도시의 정확한 값, 품질·기간 대체, 다른 안전 도시, 레드존 도시와 시세 없음은 하나의 숫자로 평탄화하지 않는다.
- 시세 추정값은 가격·원본 source·실제 도시·관측 시각·사용 품질·fallback tier·confidence를 함께 가진다.
- 상점의 **수동 고정가**는 운영진이 해제할 때까지 자동 동기화보다 우선하며 할인율 적용 전 실버값으로 보존한다.
- 상점 자동 동기화는 새 카탈로그 견적만 갱신한다. 접수된 주문선에는 적용 실버값, 할인율, 포인트 단가·소계·총액과 가격 source snapshot을 보존한다.
- 자동 리기어는 모든 경우 `pending`으로 만들고 청구자가 부위별 단가를 편집할 수 있다. 낮은 신뢰도와 시세 없음은 구체적인 입력 필요 사유를 표시한다.
- 리기어 승인과 제작자 수락 뒤의 금액은 시세·길드 기준·환율이 바뀌어도 해당 업무 안에서 다시 계산하지 않는다.
- 외부 시세 장애는 기존 주문·리기어·제작을 취소하거나 되돌리지 않는다. 유효한 최근 값이 없으면 가격 미정으로 두고 수동 가격·청구자 입력·운영진 검토로 진행한다.
- 현재 코드는 공통 AODP 설정, 시간별 상점 가격 동기화, 수동 가격 우선과 리기어 confidence를 일부 구현했다. 다만 상점 주문 snapshot에는 실제 AODP source·관측 시각·fallback·confidence가 충분히 보존되지 않아 과거 가격 근거를 완전히 설명하기 어렵다.

## 8. 길드 경제 Module

### 8.1 경계

포인트→실버 환전은 운영진의 정책 심사 대상이 아니다. 길드원·Albion 신원·양수 금액·사용 가능 포인트 조건을 서버가 검증할 수 있으므로 정상 신청은 즉시 접수한다. 운영진에게 남는 일은 Albion 안에서 실버를 실제로 전달하는 외부 이행뿐이다.

현재 `approve_exchange_request`는 운영진이 승인 버튼을 누를 때 잔액을 다시 확인하고 `approved` 상태와 `exchange_paid` 차감을 함께 만든다. 신청 시 포인트를 보류하지 않기 때문에 운영진이 지급을 준비하는 사이 상점·회원 거래 등에서 포인트가 먼저 사용될 수 있고, `approved`가 정책 승인인지 실제 지급인지도 불명확하다.

최종 상태는 다음과 같다.

```text
member submits valid exchange
  └─> awaiting_payout + exchange points held
        ├─ member edits amount ───────────────────────> awaiting_payout + hold adjusted
        ├─ member/operator cancels before claim ─────> cancelled + hold released
        └─ operator claims before in-game transfer ──> paying
              ├─ transfer not started; operator releases claim
              │  └─> awaiting_payout
              └─ silver delivered; operator confirms
                 └─> paid + hold converted to point debit
```

- 환전 금액과 보류 포인트는 1:1이며 상점의 환율/할인율을 적용하지 않는다.
- 신청·포인트 hold·상태·운영 변경 기록·알림 outbox는 한 트랜잭션에서 생성한다.
- `awaiting_payout`에서는 회원이 금액을 수정하거나 취소할 수 있고 hold도 같은 트랜잭션에서 조정한다.
- 운영진은 실버를 보내기 전에 요청을 claim해 `paying`으로 바꾼다. 이 상태에서는 회원 수정·취소와 다른 운영진의 중복 claim을 차단한다.
- 실제 지급 뒤 `markExchangePaid`가 hold를 한 번의 `exchange_paid` 차감으로 전환하고 요청을 `paid`로 끝낸다.
- 지급을 시작하지 않았다면 운영진은 사유와 함께 claim을 해제할 수 있다. `paying`은 시간 경과만으로 자동 완료·취소하지 않는다.
- 정상 경로에는 승인·거절을 두지 않는다. 지급 전 운영상 취소가 필요하면 사유를 남기고 hold를 복구한다.
- 일반 환전은 `exchange_fulfillment` 업무에 표시하고 승인 queue에는 넣지 않는다.

### 8.2 원자성과 외부 지급 경계

Postgres는 포인트 보류·상태 전이·중복 처리를 원자적으로 보장할 수 있지만 Albion의 실버 전달 자체와 DB commit을 하나의 트랜잭션으로 묶을 수는 없다. 따라서 지급 전 claim을 외부 작업 잠금으로 사용한다.

1. `claimExchangePayout`이 `awaiting_payout`을 잠그고 실행 운영진과 시작 시각을 기록한다.
2. 운영진이 Albion에서 실버를 전달한다.
3. 전달에 성공한 경우에만 `markExchangePaid`를 실행한다.
4. 전달하지 않았다면 `releaseExchangePayoutClaim`으로 대기 상태에 돌리고 사유를 기록한다.
5. 지급 여부가 불명확하면 자동으로 되돌리지 않고 오늘의 업무함에서 운영진 확인 대상으로 유지한다.

완료·취소·claim 해제는 모두 idempotency key를 사용한다. 같은 환전에 포인트 차감은 정확히 한 줄만 존재해야 하며, `paid` 상태와 `exchange_paid` 원장이 분리 commit되면 안 된다.

### 8.3 실버→포인트 적립 경계

길드 금고 로그는 입금자·금액·시각을 확인할 수 있지만 그 실버가 포인트 적립, 길드 회비, 보급 정산 등 어떤 목적으로 입금됐는지는 알려주지 않는다. 따라서 로그 행이 존재한다는 이유만으로 포인트를 자동 생성하지 않는다.

정상 흐름은 회원의 **입금 용도 지정**과 **금고 실버 입금 원본**을 결합한다.

```text
guild silver deposit log imported
  └─> unallocated deposit visible to its member
        ├─ member leaves it unselected ───────────────> no point change
        └─ member designates whole deposit for points
              ├─ deposit is valid and unallocated ──> credited + deposit allocated
              └─ missing/conflicting/already used ──> deposit_match_exception
```

- 회원에게는 자신의 활성 Albion 캐릭터와 연결된 미배정 입금만 보여준다.
- 회원은 별도 금액을 입력하지 않고 원본 입금 한 건을 선택한다. 적립 금액은 원본 금액과 1:1이다.
- 한 입금 원본은 한 용도에 전체 배정한다. 여러 용도로 나누려면 Albion에서 별도 입금하도록 안내한다.
- 원본 입금 배정·`donation_approved` 포인트 가산·운영 변경 기록·알림 outbox는 같은 트랜잭션에서 생성한다.
- 원본 입금 ID에는 tenant 범위 unique allocation을 걸어 더블 클릭·재신청·다른 지원 기능에서의 중복 사용을 막는다.
- 정확히 확인된 정상 지정은 운영진 승인 없이 끝난다. 운영진에게는 `deposit_match_exception`만 표시한다.

현재의 스크린샷 제출은 정상 경로에서 제거한다. 로그 반영 지연, 누락, 캐릭터명 연결 실패처럼 원본을 선택할 수 없는 경우에만 신청 금액·스크린샷을 보조 증빙으로 받는다. 보조 증빙만으로 자동 적립하지 않고 운영진이 실제 원본에 연결하거나 사유와 함께 거절한다.

### 8.4 원본과 용도 배정

`guild_silver_deposit_logs`는 금고 로그 원문과 파싱된 입금자·금액·시각·dedupe fingerprint를 tenant별로 보존한다. `guild_silver_deposit_allocations`는 각 원본이 어떤 지원 용도에 배정됐는지를 정확히 한 번 기록한다.

```text
guild_silver_deposit_logs
  id, guild_id, logged_at, albion_player_name, silver,
  source_fingerprint, imported_at

guild_silver_deposit_allocations
  guild_id, deposit_log_id UNIQUE, purpose,
  guild_member_id, reference_id, allocated_at
```

금고 원본은 사실 기록이고 allocation은 앱 안의 용도 기록이다. 원본을 수정해 용도를 표현하거나 스크린샷을 원본으로 승격하지 않는다. 포인트 적립을 취소·정정해야 하면 기존 원장과 allocation을 삭제하지 않고 반대 포인트 원장과 정정 기록을 추가한다.

### 8.5 회원 간 포인트 양도

포인트 양도는 거래 결제 기능이 아니다. 같은 길드의 활성 회원 사이에서 선물이나 개인 정산을 위해 포인트를 즉시 이전하는 단순한 원장 이동이다.

- 송신자는 수신자별 금액과 전체 합계를 최종 확인한 뒤 실행한다.
- 수신자는 활성 길드 회원이어야 하며 본인·게스트·다른 길드 회원은 선택할 수 없다.
- 사용 가능 포인트만 보낼 수 있고 상점·환전·회원 거래에 hold된 금액은 제외한다.
- 한 번에 여러 수신자를 선택하면 모든 `transfer_out`·`transfer_in` 원장 쌍이 함께 성공하거나 모두 실패한다.
- 완료 즉시 수신자 잔액에 반영하며 수신자 수락, 운영진 승인, 취소, 환불, 분쟁 상태를 만들지 않는다.
- 거래 보호가 필요한 아이템·서비스 대금은 회원 거래장을 사용하도록 양도 확인 화면에 명시한다.
- 양도는 길드 재정의 수입·지출이 아니다.

현재 RPC는 한 요청마다 새 `ref_id`를 만들기 때문에 네트워크 재전송을 동일 요청으로 식별할 수 없다. 최종 구조는 `point_transfer_batches`에 idempotency key, 송신 회원, 수신 목록 snapshot, 총액을 먼저 기록하고 원장 쌍이 같은 트랜잭션에서 그 batch를 참조하게 한다.

잘못 보낸 양도를 회원이 되돌리는 기능은 제공하지 않는다. 운영진이 예외적으로 바로잡아야 하면 원본 batch를 보존한 채 사유와 원본 참조를 가진 별도 포인트 조정을 기록한다.

### 8.6 이벤트 특별 보상

이벤트 특별 보상은 모든 이벤트 참가자에게 정기적으로 주는 출석 포인트가 아니다. 종료된 이벤트에서 특별한 기여나 운영상 명확한 사유가 있을 때 운영진이 한 번만 집행하는 재량 보상이다. 리기어 지급과도 별개다.

현재 흐름은 요청 생성과 승인을 나누지만 같은 `EVENT_MANAGE` 권한을 가진 동일인이 두 행동을 모두 할 수 있다. 따라서 `pending → approve/reject`는 실질적인 이중 통제가 아니라 운영진 클릭과 업무만 늘리는 형식적 승인이다.

최종 흐름은 다음과 같다.

- `EVENT_REWARD_GRANT` 같은 별도 지급 권한을 둬 일반 이벤트 편집 권한과 포인트 생성 권한을 분리한다.
- 운영진은 종료된 이벤트의 참가자 일부 또는 전부를 선택하고 한 지급 건에 공통으로 적용할 금액을 입력한다.
- 사람마다 다른 금액이 필요하면 금액별로 특별 보상 건을 나눠 각각 사유와 원장을 명확히 남긴다.
- 운영진은 지급 대상 snapshot, 공통 지급 금액, 필수 사유, 총 지급 포인트를 한 화면에서 검토한다.
- 화면은 대상 수·공통 금액·총액을 강조하고 되돌릴 수 없는 원장 생성임을 알린 뒤 강한 최종 확인을 한 번 받는다.
- 확정 command는 `event_special_reward_grants`, 대상별 포인트 원장, 운영 변경 기록, 알림 outbox를 한 트랜잭션에서 생성한다.
- idempotency key로 중복 클릭·네트워크 재시도에도 같은 지급이 한 번만 생기게 한다.
- 정상 지급에는 `pending`, 승인, 거절, 두 번째 자기 승인, `event_payout_review` 업무를 만들지 않는다.
- 이벤트 종료나 참가 확정만으로 자동 지급하지 않는다. 정기 참가 보상이 필요해지면 별도 정책과 기능으로 설계한다.
- 오지급은 원본 지급을 삭제·수정하지 않고 원본을 참조하는 별도 관리자 포인트 조정으로 바로잡는다.

### 8.7 사이펀 운영 정책

사이펀 기능은 같은 인게임 입출금 원본을 보존하되 길드의 운영 목적에 따라 해석을 분리한다.

| 정책 | 회원 화면 | 운영 의미 |
|---|---|---|
| `record` | 누적 입금·누적 출금·순입출금 | 사실 기록 확인용이다. 음수를 초과 출금·채무로 표시하지 않고 운영 업무도 만들지 않는다. |
| `custody` | 보관 잔량·출고 가능량·반환 확인 수량 | 개인별 보관 장부다. 양수는 출고 가능한 수량이고 음수는 반환 확인 대상이다. |

- 정책은 `asset_accounting` 기능의 `siphon_policy` 설정으로 관리한다.
- 두 정책은 같은 immutable 원본 로그와 중복 제거 규칙을 사용한다.
- 정책 전환은 과거 원본이나 합계를 다시 쓰지 않고 라벨·설명·주의 상태만 바꾼다.
- `custody`의 음수는 운영진과 회원에게 주의 상태로 보여주지만 수동 로그 반영이 늦을 수 있으므로 자동 제재·권한 제한·다른 기능 차단을 하지 않는다.
- 기록 확인 목적의 길드에 채무 의미를 강요하지 않도록 새 길드의 기본값은 `record`로 두고 설정에서 `custody`를 명시적으로 선택하게 한다.
- 기존 길드는 현재 화면 의미를 보존하기 위해 `custody`로 backfill한 뒤 운영진이 기록 모드로 바꿀 수 있게 한다.

### 8.8 루팅 회수 검증

루팅 회수 검증의 공식 책임 단위는 개인이 아니라 이벤트의 감사 대상 아이템 pool이다.

```text
A가 아이템 10개 루팅
  └─ B가 같은 아이템 10개를 대신 입고 ──> 품목 회수 완료
  └─ 전체 입고가 7개뿐임 ───────────────> 품목 3개 미회수 의심
```

- 감사 대상 길드원·연합길드원의 품목별 루팅 총량과 길드 금고의 같은 품목 입고 총량을 비교한다.
- 입금자 이름은 책임 지정이 아니라 실제 입고 증거다. 루팅자와 입금자가 달라도 총량이 맞으면 완료다.
- 부족분은 `미회수 의심 항목`으로 품목별 한 건을 만들고 루팅자별·입금자별 행은 조사 근거로 연결한다.
- 개인별 화면에 `미반납 확정`, 채무, 벌점 같은 판정을 자동 생성하지 않는다.
- 운영진은 실제 이동·사망 소실·로그 누락 같은 맥락을 확인해 의심 항목을 해결하거나 오탐으로 종결할 수 있다.
- 원본 로그, 총량 계산, 운영진 종결 기록은 보존하고 결과만 덮어써 개인 책임을 만들어내지 않는다.

### 8.9 전술 기능의 성숙도와 공유 경계

현재 전술 기능의 한계는 편집기 UI가 덜 다듬어진 정도가 아니다. Albion ZvZ의 상황·역할·판단을 제품이 정확한 정답으로 설명하거나 검증할 수 없으므로 **전술 실험 기능**으로 취급한다.

- 최종 목표는 콜러가 자신의 전술을 단계·콜·역할별 지침으로 직접 작성하고 참가자에게 전달하는 도구다.
- 제품은 문서 구조·편집 충돌·접근 권한·snapshot·공유 안전성을 보장하지만 전술을 자동 생성·추천하거나 정확성·효율을 판정하지 않는다.
- 전술 기능의 완성도는 보편적인 ZvZ 정답을 설명하는 능력이 아니라 콜러 작성·참가자 이해·이벤트 당시 내용 보존·외부 공유의 안전성으로 평가한다.
- 신규 길드에는 기본 비활성화하고 운영진이 실험 기능임을 확인한 경우에만 켠다.
- 안정 기능인 빌드·파티 템플릿과 전술의 성숙도를 묶지 않는다.
- 마케팅 핵심 기능, 셀프서비스 필수 설정, 검증된 `ZvZ 교육`으로 소개하지 않는다.
- 이벤트에 전술을 연결할 때는 현재처럼 published 원본의 immutable snapshot을 남겨 이후 원본 편집이 진행 중 이벤트·회고를 바꾸지 않게 한다.

외부 공유는 연합·게스트 참가자를 위한 **전술 공유 링크**로 한정한다.

- 로그인 없이 읽을 수 있지만 검색·공개 목록·SEO에는 노출하지 않는다.
- 생성 시 만료 시각을 필수로 두고 기본값은 7일로 한다.
- 운영진은 링크별로 즉시 폐기할 수 있다.
- 링크는 읽기 전용이며 원본 전술 편집·다른 길드 데이터·내부 운영 메모 권한을 주지 않는다.
- 만료·폐기 뒤에는 전술 내용을 반환하지 않는다.

### 8.10 승인 빌드 템플릿과 이벤트 확정본

빌드 템플릿은 단순 참고 이미지가 아니라 길드가 역할별로 승인한 장비 선택 범위다.

- 고정 장비는 반드시 그 장비를 사용한다.
- 복수 장비 옵션은 참가자가 선택할 수 있는 허용 대안이다.
- 무기별 조건부 옵션은 선택한 무기에 따라 허용되는 보조무기·방어구·소모품 조합을 좁힌다.
- tier·enchant·스킬 조건은 템플릿의 최소 또는 지정 기준으로 함께 전달한다.
- 범위 밖 대체가 필요하면 운영진이 이벤트 슬롯에서 명시적으로 수정하고 변경 주체를 남긴다.

참가자의 실제 선택이 확정되면 템플릿 참조만 저장하지 않고 **이벤트 빌드 확정본**을 만든다.

- 역할, 모든 실제 장비 ID, tier·enchant, 스킬, 운영진 예외를 snapshot으로 보존한다.
- 이후 승인 빌드 템플릿을 수정·덮어쓰기·삭제해도 기존 이벤트 확정본은 바뀌지 않는다.
- 이벤트 시작 뒤에는 확정본을 자동 갱신하지 않는다.
- 리기어의 지급 대상과 가격 기준은 현재 템플릿이 아니라 손실 당시 이벤트 빌드 확정본이다.
- 새 템플릿 버전은 이후 배정과 운영진이 명시적으로 다시 적용한 시작 전 슬롯에만 사용한다.

### 8.11 Menhera 콘텐츠 준수와 최근 영상 환전 자격

이 모듈은 일반 길드용 제품 기능이 아니라 Menhera 운영 규칙을 지원하는 tenant 전용 확장이다.

- 세션 참여 원본, 운영진의 수동 참여 보정, 영상 제출·검토 이력은 Menhera 콘텐츠 준수 상태의 근거로 함께 보여준다.
- 기준 충족·미달·영상 제출 대기·기한 초과는 관찰된 상태이며 그 자체가 회원 제재 결정은 아니다.
- 참여 미달이나 영상 의무 미충족만으로 전투 참가, 리기어 접수·지급, 포인트 적립·사용·양도, 길드 권한을 자동 제한하지 않는다.
- 운영진은 근거를 확인한 뒤 안내·면담·예외 인정 또는 길드 외부 정책에 따른 후속 조치를 별도로 판단한다.
- **최근 영상 환전 자격**은 콘텐츠 준수 상태에서 파생한 제재가 아니라 Menhera의 새 포인트→실버 환전에 직접 적용하는 독립 규칙이다.
- 회원이 유효한 YouTube 영상을 제출해 저장에 성공하면 운영진 승인 없이 즉시 환전 자격을 얻는다. 자격은 해당 제출 시각부터 5일 동안 유지된다.
- 5일이 지나거나 제출이 무효화됐을 때 다른 최근 유효 제출이 없으면 이후 새 환전 신청만 다시 제한한다. 이미 접수된 환전 신청은 영향을 받지 않는다.
- 운영진이 참여 근거를 보정하거나 제출을 무효화해도 원본과 변경 주체를 보존하고, 자격은 남아 있는 최근 유효 제출 전체로 다시 계산한다.
- 일반 통계·리더보드는 참여 동기와 운영 개선용이고, Menhera 콘텐츠 준수 상태는 명시적 기준 확인용이므로 화면과 용어를 분리한다.

### 8.12 공개 길드 프로필의 단계별 공개 동의

공개 프로필은 모집·홍보·신뢰 형성을 위한 길드 표면이지만, 활성화 한 번을 모든 내부 데이터의 공개 동의로 사용하지 않는다.

- 정보 우선순위는 길드 정체성·소개, 모집 상태·조건·활동 시간·언어, Discord 가입 경로, 신뢰를 보조하는 공개 활동·성과 순서다.
- 공개 프로필 전체는 신규 길드에서 기본 비활성화하고 운영진이 명시적으로 켠다.
- 프로필 공개 여부와 `open`·`selective`·`closed` 길드 모집 상태는 독립적으로 저장한다.
- 활성 프로필이 `closed`로 바뀌어도 페이지·검색 색인·공유 URL은 유지하고 모집 마감 배지를 표시하며 Discord 가입 CTA와 모집 역할·가입 절차만 숨긴다.
- `open` 또는 `selective`일 때 유효한 Discord 초대 URL이 있어야 가입 CTA를 보여주며, 잘못되거나 빈 주소에는 동작하지 않는 버튼을 만들지 않는다.
- 앱 안에 길드 지원서·지원자 목록·승인 workflow를 추가하지 않고 실제 지원·상담·가입은 Discord에서 진행한다.
- 활성화 직후에는 길드명·소개·모집 상태·활동 시간대·사용 언어와 비식별 길드 집계만 기본 노출한다.
- 비식별 길드 집계에는 길드 규모, 길드 단위 활동량, 전투 성향, 무기 분포와 길드 단위 라이벌 정보가 포함될 수 있다.
- 운영진 명단, 개인 리더보드, 개인 기여자 카드처럼 특정 회원을 식별하는 섹션은 각각 별도 공개 선택을 요구한다.
- 리기어 같은 내부 경제 통계도 기본 비공개이며 운영진의 섹션별 명시적 선택 뒤에만 집계값을 노출한다.
- 회원 잔액·원장·신청·정산, 역할·권한, 운영 변경 기록과 비공개 이벤트 데이터는 공개 가능한 섹션으로 제공하지 않는다.
- 공개 설정 화면은 각 섹션의 실제 공개 예시와 노출 대상을 보여주고 저장 전 미리보기를 제공한다.
- 공개를 끄면 검색 색인을 중단하고 외부에는 내용을 반환하지 않되 설정과 과거 집계 원본은 보존한다.
- 마케팅·데모 문구는 봇 초대만으로 자동 공개된다고 안내하지 않고, 운영진이 공개를 켠 뒤 공유 URL과 모집 CTA가 생긴다는 실제 절차를 설명한다.

#### 홈 길드 연결과 사후 대표권 분쟁

홈 길드 설정은 공개 Albion 데이터를 어느 길드의 운영 기준으로 사용할지 정하는 연결이다. 이를 공식 인증으로 표시하거나 모든 길드에 별도 증명 절차를 요구하지 않는다.

- 정상 최초 설정은 Discord 봇 설치 권한과 Albion 서버·길드 선택만 확인하며 인게임 코드, 영상 제출과 서비스 운영자 승인을 요구하지 않는다.
- 같은 Albion 서버·길드 ID에는 활성 홈 길드 연결을 하나만 허용하되, 이 선점은 반박 불가능한 소유권 증명이 아니다.
- 이미 연결된 길드를 선택한 신청자에게 일반 오류나 개발자 문의만 보여주지 않고 길드 대표권 분쟁 신청 경로를 제공한다.
- 일반 사칭 신고는 접수·rate limit·최소 근거 확인을 거쳐야 하며 익명 신고 한 건만으로 공개 표면을 자동 중단하지 않는다.
- 서비스 운영자가 중복 신청 또는 신빙성 있는 신고를 `under_review`로 전환하면 기존 워크스페이스의 공개 길드 프로필과 Discord 가입 CTA만 임시 중단한다. 내부 기록·미완료 의무·다른 길드 데이터는 그대로 격리한다.
- 대표권 확인은 분쟁 건에만 수동으로 수행한다. 기존 공개 모집 근거를 우선 사용하고 부족할 때만 인게임 권한 증거를 요청한다.
- 기존 연결 유지, 신고 기각, 연결 해제 또는 새 워크스페이스 재지정 중 하나로 종결하며 실행자·근거 요약·시각을 운영 변경 기록에 남긴다.
- 연결을 잃은 워크스페이스는 홈 길드 의존 동기화와 신규 운영을 멈추고 `setup_required`로 돌아가지만 과거 내부 데이터는 상대 워크스페이스로 이전하거나 자동 삭제하지 않는다.
- 증거 원본은 분쟁 종결 뒤 정해진 짧은 보존 기간에 삭제하고 판정에 필요한 최소 metadata만 보존한다.
- 제품·마케팅·공개 페이지에는 별도의 검증 체계를 실제로 운영하기 전까지 `공식 인증 길드` 배지를 표시하지 않는다.
- 공개 프로필의 Discord 초대 코드는 Discord API로 해석해 대상 서버 ID가 봇이 설치된 `discord_guild_id`와 일치할 때만 가입 CTA에 사용한다.

### 8.13 리기어·참여 보상·특별 보상의 분리

세 흐름은 모두 회원에게 가치를 지급할 수 있지만 자격과 목적이 다르다.

| 흐름 | 지급 자격 | 목적 |
|---|---|---|
| 리기어 | 이벤트 참가 뒤 발생한 적격 데스와 장비 손실 | 손실 복구 |
| 이벤트 참여 보상 | 운영진이 이벤트 참가 확정 명단에 포함한 참가자 | 참가 자체에 대한 포인트 지급 |
| 이벤트 특별 보상 | 예외적인 기여 또는 운영 사유 | 재량성 추가 보상 |

- 참여 보상은 데스가 없어도 지급할 수 있고, 리기어는 참가만으로 지급하지 않는다.
- 같은 회원이 실제 참가하고 적격 데스도 했다면 참여 보상과 리기어를 각각 받을 수 있다.
- 특별 보상은 일반 참여 보상을 대체하거나 모든 참가자에게 반복 지급하는 경로가 아니다.
- 참여 보상 금액·대상 원장과 리기어 신청·승인·이행 상태는 서로 독립적으로 보존한다.
- 사이트는 슬롯 배정과 확인 가능한 활동을 참가 후보·보조 근거로 제시하지만 실제 참가를 자동 확정하지 않는다.
- 참가 일괄 마감 화면은 슬롯 배정자를 기본 선택하고 노쇼 가능성·미배정 활동자 같은 불일치 후보를 강조한다.
- 운영진은 전원 출석표를 다시 만들지 않고 노쇼 제외·현장 참가자 추가 같은 예외만 수정한다.
- 운영진의 한 번의 강한 최종 확인으로 **이벤트 참가 확정 명단**, 모든 대상에게 적용할 공통 금액, 대상별 포인트 원장, 운영 변경 기록과 알림 outbox를 원자적으로 생성한다.
- 참가 일괄 마감은 별도 요청·승인 queue를 만들지 않고 command idempotency key로 재시도 중복 지급을 막는다.
- 코드의 `role_rewards`는 실제로 역할별 리기어 허용 여부·청구 상한·지급 요율을 저장하는 legacy 명칭이므로 사용자 표준 용어는 **역할별 리기어 정책**으로 정한다.
- 현재 이벤트 참여 보상 구현은 종료 이벤트의 슬롯 배정자를 고정한 요청을 만든 뒤 다시 승인하므로, 예외 수정이 가능한 단일 참가 마감 command로 교체한다.

### 8.13A 참가예정과 확정 참가의 분리

참가예정은 운영진이 조합을 만들기 전에 인원과 가능한 역할을 가늠하는 신호이며 참가자의 출석 약속이나 슬롯 신청이 아니다.

- 한 회원은 이벤트마다 참가예정 하나를 가지며 모집 중에는 가능한 역할과 메모를 수정하거나 의향을 취소할 수 있다.
- 슬롯 승인 대기 신청을 하더라도 참가예정은 유지한다. 신청이 거절·취소되거나 다른 슬롯을 다시 고르는 동안에도 같은 가용성 신호를 보존한다.
- 운영진 또는 콜러가 특정 파티·슬롯을 확정 배정한 때에만 현재 참가예정을 종료한다.
- 회원 self-service 쓰기는 모집 중에만 허용한다. 운영 기준 시작 때까지 남은 참가예정은 이벤트 당시 의향의 읽기 전용 snapshot으로 남기고 이후 수정하지 않는다.
- 시작까지 배정되지 않은 참가예정을 노쇼·불참·미달로 판정하지 않고 참가율·성과 통계의 분모나 분자에 넣지 않는다.
- 참가예정만으로 이벤트 참여 보상, 리기어 신청·자동 리기어 또는 참가자용 권한을 열지 않는다.
- 참가 일괄 마감은 확정 배정자를 기본 후보로 사용한다. 참가예정은 운영진이 실제 현장 참가자를 수동 추가할 때 볼 수 있는 보조 문맥일 뿐 자동 선택하거나 지급하지 않는다.
- 초기 `cleanup_tentative_on_slot_fill` trigger의 `requested_discord_id` 삭제 분기는 제거하고 확정된 `assigned_discord_id` 전이만 정리 근거로 사용한다.
- 웹·Discord·관리자 대리 입력은 같은 이벤트 상태 guard와 종료 규칙을 사용하며 UI 비노출만으로 시작 뒤 쓰기를 막지 않는다.

### 8.14 이벤트 유효 리기어 정책

리기어의 길드 기본값·역할·Discord 역할·이벤트 예외·영상 조건은 운영진에게 유연성을 주지만 길드원이 우선순위를 직접 해석하게 하지 않는다.

- 설정 원본들은 이벤트별 최종 기준을 만드는 운영진용 입력으로만 취급한다.
- 모집 중에는 배정된 역할과 현재 회원 조건을 해석해 각 참가자에게 적용될 리기어 허용 여부, 청구 상한, 지급 요율, 인정 데스 횟수, 영상 조건을 하나의 정책 카드로 보여준다.
- 운영진 화면은 최종 결과와 함께 어떤 입력에서 왔는지 설명용 출처를 펼쳐볼 수 있지만, 길드원 화면은 최종 결과를 우선한다.
- 시작 전 정책 변경은 이벤트 유효 정책을 다시 계산하고 영향받는 참가자에게 변경 전·후 결과를 보여준다.
- 이벤트 시작 시 참가자·역할별 유효 정책과 출처를 immutable snapshot으로 고정한다.
- 시작 뒤 운영진이 참가자를 예외 추가하면 현재 전역 설정이 아니라 해당 이벤트의 시작 시점 정책 버전으로 확정한다.
- 이후 길드 기본값·역할·Discord 역할·영상 설정이 바뀌어도 시작한 이벤트의 리기어 신청·가격 계산·승인·제작 기준은 바뀌지 않는다.
- 이벤트 밖 자유 리기어 창구는 생성 시점에 자체 유효 정책을 고정하고 이벤트 정책 우선순위와 섞지 않는다.
- 자유 리기어 신청은 일반 리기어와 같은 검토·지급·제작 이행 흐름을 사용한다.
- 자유 리기어의 신청·승인·지급액은 실제 길드 지원이므로 리기어 운영 통계와 선택 공개된 총 지원 실적에 포함한다.
- 통계에는 `event`, `free_window`, `auto` 출처를 보존해 전체와 출처별 값을 함께 조회할 수 있게 한다.
- 자유 리기어 신청자는 사망하고 신청한 일부 인원일 뿐 전체 참가 명단이 아니므로 이벤트 참가율·참여 보상·이벤트 성과 통계에서는 항상 제외한다.
- 운영진은 출처별 통계를 필터링할 수 있지만 창구별 포함 토글로 사실 집계 기준을 바꾸지는 않는다.
- 현재 구현처럼 신청 생성 시점마다 설정을 다시 해석하는 방식은 같은 이벤트의 늦은 신청자에게 다른 기준을 적용할 수 있으므로 이벤트 시작 snapshot으로 교체한다.

### 8.15 폐기된 월말 잔액 정산

포인트 기말 잔액을 회원별 실버 채권·채무로 전환하는 월말 정산은 활성 제품 흐름이 아니다.

- 실버 리기어는 포인트 적립 뒤 회원의 포인트→실버 환전 신청으로 지급한다.
- 제작자 정산은 납품별 지급 예정 항목을 운영진이 실제 실버 전달 시 묶어 완료하며 포인트 전체 잔액과 상계하지 않는다.
- `settlement_periods`, `settlement_lines`와 reserved capability는 누적 migration·과거 계정 병합 호환을 위해 보존한다.
- 월말 정산 route·내비게이션·권한·업무함·자동화는 다시 활성화하지 않는다.
- 사용자에게 보이는 "이벤트 정산", "제작 정산", "거래 정산"은 각 원본 흐름의 지급 확정이며 월말 잔액 정산을 뜻하지 않는다.

### 8.16 동일 길드 복구와 구성 공유의 분리

길드 백업의 목적은 모든 데이터를 보관하는 것이 아니라, 사고 뒤에도 현재 자산과 아직 끝나지 않은 약속이 달라지지 않게 하는 최소 복구다. 다른 길드로 재정·회원 상태를 복사하는 수단이 아니다.

- 백업은 source workspace ID, 논리적 Albion 길드 식별자, schema version, 생성 시각과 무결성 정보를 가진다.
- 복원 대상은 원본과 같은 길드 워크스페이스여야 하며 출처가 다르면 preview 단계에서 전체를 거부한다.
- `sourceGuildId`를 참고 정보로만 읽고 현재 세션 길드에 덮어쓰는 현재 동작은 금지한다.
- 복구 필수 상태는 다음으로 제한한다.
  - 회원별 포인트 잔액과 연결된 hold·에스크로
  - 완제품 재고 수량과 연결된 예약
  - 완료되지 않은 환전·상점 주문·회원 거래·리기어·보급·제작 의무
  - 위 상태를 올바른 회원·신청·이벤트 유효 정책에 연결하는 최소 식별자와 고정 snapshot
- 일반 운영 설정·권한 전체·재사용 템플릿·미래 이벤트, 완료·취소된 이력 전체, 과거 원장 전체, 통계·리더보드, 알림 전송 기록, 캐시·재계산 가능한 집계는 포함하지 않는다.
- 잔액만 복원하면서 hold·에스크로를 빠뜨리거나 재고만 복원하면서 예약·미완료 주문을 빠뜨리는 부분 묶음은 허용하지 않는다.
- 복구 필수 상태는 하나의 복원 transaction 또는 원자적 restore job으로 함께 성공하거나 함께 실패한다.
- 적용 전에 서버가 현재 상태의 안전 snapshot을 만들고 복원 diff·범위·복원 주체를 영수증으로 보존한다.
- 브라우저 다운로드 성공 여부를 안전 snapshot 생성의 증거로 사용하지 않는다.
- 이벤트·슬롯·빌드 구성을 다른 길드와 나누는 기능은 포인트·재고·회원·원장을 제외한 **템플릿 패키지**로 분리한다.
- Discord 서버 변경은 새 workspace에 백업을 가져오는 방식이 아니라 논리적 길드 소유권과 과거 이력을 보존하는 별도 길드 이전 절차로 처리한다.
- 현재 JSON의 포인트 잔액·일부 템플릿·재고 구성은 복구 필수 상태와 일치하지 않는다. 템플릿은 제외하고 hold·예약·열린 의무와 최소 참조를 보강한다.
- UI와 마케팅에서는 "모든 길드 데이터"나 "완전 백업"이 아니라 **핵심 운영 상태 복구**로 표현한다.

### 8.17 종료 이벤트 확정본·사후 처리·복제

종료 이벤트는 다시 편집하는 작업물이 아니라 당시 운영 사실을 설명하는 변경 불가 확정본이다.

- 종료 시 일정·장소·카테고리·모집 방식, 파티·슬롯 편성, 이벤트 유효 리기어 정책, 이벤트 빌드 확정본과 연결된 전술 snapshot을 잠근다.
- 종료 시점의 편성은 당시 계획·배정 사실이고, 실제 참가 확정 명단은 별도의 사후 처리 결과다.
- 참여 보상·리기어·제작 이행·루팅 검증·사후 보고서는 종료 이벤트를 참조하지만 원본 필드를 수정하지 않는다.
- 참가자 누락·오지급·잘못된 상태는 원본 행 삭제나 덮어쓰기가 아니라 사유·실행자·원본 연결을 가진 정정 행과 반대 원장으로 보완한다.
- 종료 이벤트의 영구 삭제와 재개는 지원하지 않고 아카이브에서 확정본·사후 처리·정정의 연결을 읽기 전용으로 보여준다.
- 이벤트 복제는 새 `draft`를 만들고 재사용 가능한 기본 설정·파티·빈 슬롯·빌드 구성을 복사한다.
- 기존 배정자·게스트 신청·참가 확정·지급 원장·리기어·제작·루팅·활동 기록·사후 정정은 복제하지 않는다.
- 현재 `cloneEvent`가 새 초안으로 만들고 `assigned_*`를 제거하는 방향은 유지하되, 복사 allowlist를 명시해 새 사후 데이터가 추가돼도 따라오지 않게 한다.

### 8.17A 집결 기반 운영 시작

실제 싸움의 시작은 미리 정하거나 운영진이 계속 관찰해 입력할 수 있는 사실이 아니다. 따라서 이벤트 상태는 전투 발생을 추정하지 않고, 확정 가능한 **집결 시각**을 **운영 기준 시작**으로 사용한다.

```text
draft
  └─ publish ─> recruiting
                  ├─ cancel before gather ─> cancelled
                  ├─ reschedule ───────────> recruiting at new gather time
                  ├─ exceptional start now ─> in_progress
                  └─ gather time reached ──> in_progress automatically
```

- 모든 발행 이벤트는 집결 시각에 별도 버튼이나 길드별 opt-in 없이 자동으로 `진행 중`이 된다.
- 운영 기준 시작은 참가자 변경 잠금, 이벤트 유효 리기어 정책·빌드·편성 snapshot과 후속 수집 window의 결정적 경계다.
- 운영 기준 시작은 실제 싸움 시작이나 첫 킬을 뜻하지 않는다. 전투 발생 시각은 전투 데이터가 발견될 때 별도 사실로 연결한다.
- scheduler가 늦게 실행돼도 `started_at`은 worker 실행 시각이 아니라 집결 시각을 기록하고 idempotent transition을 한 번만 만든다.
- 집결 전에 일정이 바뀌면 아직 시작되지 않은 이벤트의 자동 전환 시각과 임박 알림을 함께 옮긴다.
- 초안·취소 이벤트는 자동 시작하지 않는다. 전투나 리기어가 0건인 발행 이벤트도 시작 실패로 보지 않고 정상 종료할 수 있다.
- `지금 운영 시작`은 집결보다 일찍 운영 경계를 열어야 하는 예외 command로만 제공하고 영향 요약·확인·변경 기록을 요구한다.
- 운영 기준 시작을 단순 reset으로 삭제하지 않는다. 잘못된 일정은 원래 경계와 사유를 보존하는 정정으로 처리하고 이미 확정된 후속 사실을 조용히 재작성하지 않는다.
- 현재 cron은 opt-in 설정이 켜진 이벤트의 `battle_started_at`을 집결 시각으로 기록하고, UI는 이를 "전투 시작"과 reset으로 표현한다. 자동화를 정상 경로로 승격하고 저장·화면 용어를 실제 의미인 운영 기준 시작으로 바꾼다.

### 8.17B 평가 없는 이벤트 마감 현황

제품은 전투 당시 콜러의 의도, 음성 지시, 지형, 역할별 임무와 교전 목적을 알 수 없으므로 킬·데스 같은 일부 데이터만으로 잘한 점·문제점·개선안을 판정하지 않는다. 운영진에게 수동 회고 작성을 요구하는 기능도 채택하지 않는다. 종료 뒤 필요한 것은 읽을 리포트가 아니라 남은 운영 업무를 끝내기 위한 **이벤트 마감 현황**이다.

```text
종료 이벤트 상세
  ├─ 종료 이벤트 확정본
  ├─ 이벤트 마감 현황
  │    ├─ 참가 대조
  │    ├─ 참여 보상·리기어 상태
  │    ├─ 제작·루팅 상태
  │    └─ 연결 전투 수와 원본 링크
  └─ 사후 처리·정정 이력
```

- 별도 리포트 생성·저장·작성·승인 절차를 두지 않고 종료 이벤트 상세에서 원본 상태를 파생해 보여준다.
- 참가 대조는 배정자, 전투 기록으로 확인된 참가자, 미확인 신청자와 미신청 전투 참가자를 구분한다. 전투 기록만으로 실제 참가를 자동 확정하지 않는다.
- 참여 보상과 리기어는 서로 다른 제도이므로 대상·지급·미처리 상태를 합치지 않는다.
- 제작형 리기어와 루팅 검증이 적용된 이벤트만 해당 상태를 보여주며, 적용되지 않았거나 건수가 0이면 오류 대신 `해당 없음` 또는 `처리 완료`로 표시한다.
- 전투 영역은 연결된 전투 수·발생 시각·원본 링크 같은 최소 사실만 보여준다. 승리·패배·우세·열세·MVP·전술 평가·자동 개선안은 만들지 않으며 전투 상세와 공개 공유는 별도 전투 기능이 소유한다.
- 미처리 수치와 링크는 **오늘의 업무함** 및 리기어·보상·제작·루팅 원본 화면과 같은 query·권한을 사용한다. 마감 현황에서 별도 queue item이나 알림을 만들지 않는다.
- 전체 참가·경제·루팅 현황은 해당 운영 권한자에게만 보인다. 일반 회원은 기존 이벤트 정보와 본인 상태만 보고, 공개 사용자는 이 화면에 접근하지 않는다.
- 종료 이벤트 확정본은 변하지 않지만 사후 처리·정정이 진행되면 마감 현황은 최신 원본 상태로 갱신된다.
- 현재 `/events/[id]/report`와 `EventAfterActionReviewCard`는 자동 마감 상태, 전투 평가 표현, 수동 AAR을 혼합한다. 필요한 자동 상태만 종료 이벤트 상세로 옮기고 기존 경로는 상세 화면으로 연결한다.

### 8.18 길드 운영 시간대와 개인 표시 시간대

시간대는 운영 규칙의 기준과 개인 편의를 위한 표시 설정을 분리한다.

- 이벤트 집결·시작·마감과 자동화 실행 시점은 UTC 절대 시각으로 한 번만 저장한다.
- 운영진이 입력한 달력 시각은 길드 운영 시간대로 해석해 절대 시각으로 변환한다.
- 오늘·이번 주·리더보드·스트릭·자동 리기어·업무 마감의 달력 경계는 모두 길드 운영 시간대에서 계산한다.
- 운영진 화면, 공개 페이지, 공용 길드원 화면과 길드 전체 Discord 공지는 길드 운영 시간대로 표시하고 시간대 약어 또는 UTC offset을 함께 보여준다.
- 회원의 개인 표시 시간대는 개인 화면과 개인 DM의 표시만 변환하고 저장된 시점·마감·자동화·통계 집계 결과를 바꾸지 않는다.
- 개인 시간대를 선택하지 않았으면 길드 운영 시간대로 표시하며, DM 수신을 꺼도 개인 화면의 시간대 선택은 계속 유효하다.
- 언어 선택과 시간대 선택은 독립적이다. 언어로 시간대를 추정하거나 브라우저 시간대로 운영 기준을 암묵적으로 바꾸지 않는다.
- 길드 운영 시간대를 바꿔도 기존 이벤트의 절대 시각은 이동하지 않고 이후 렌더링과 달력 경계만 새 시간대를 따른다.
- 현재 `getCurrentWeekStartIso`의 `America/Los_Angeles` 고정 경계와 전역 `Asia/Seoul` 표시 fallback을 업무 규칙에서 제거하고 모든 호출부가 명시적인 길드 시간대를 받게 한다.
- 현재 임박 DM에 한정된 개인 시간대 적용을 회원 개인 화면의 이벤트·마감 시각까지 확장하고, 공유 링크는 항상 길드 시간대로 유지한다.

### 8.19 회원 공개 활동 링크

회원 공개 활동 링크는 길드나 서비스가 회원 명단을 공개하는 기능이 아니라, 회원 본인이 외부 포트폴리오·구인·성과 공유에 사용하는 길드별 비목록 주소다.

- 길드별 기본값은 비활성이며 운영진이 일괄 활성화하거나 공개 프로필 설정에 따라 자동으로 켜지지 않는다.
- 확인된 Albion 캐릭터 신원을 가진 회원 본인만 활성화·폐기·재발급할 수 있고 Discord 연결 여부는 필수 조건이 아니다.
- 링크는 활성 중에는 자동 만료 없이 안정적으로 유지한다. 본인이 폐기·재발급하거나 해당 길드 연결이 폐기되면 이전 주소는 즉시 `not found`가 되고 캐시도 제거한다.
- 페이지와 미리보기에는 `noindex`, `nofollow`, `noarchive`를 적용하고 sitemap·공개 회원 목록·검색 API·길드 프로필의 회원 디렉터리에 포함하지 않는다.
- 공개 DTO는 allowlist로 Albion 캐릭터명·길드명, 참여 집계, 성취 배지, 역할 분포, 무기 카테고리, 생존·승패 같은 집계 성과만 제공한다.
- Discord ID·사용자명·아바타, 포인트·원장·리기어·영상·신청·정산·준수·운영 메모는 제공하지 않는다.
- 정확한 이벤트 제목·ID·날짜·시각·파티·슬롯과 개별 킬의 시각·상대 타임라인도 기본 공개 요약에서 제외한다. 공개 전투 탐색은 별도 공개 전투 기능을 사용한다.
- 회원은 활성화 전에 외부 방문자가 보게 될 정확한 공개 활동 요약을 미리 보고 동의한다.
- 공개 URL과 원본 token은 운영 로그·분석 이벤트·오류 메시지에 기록하지 않고 충분히 추측하기 어려운 값과 요청 제한을 사용한다.
- 공개 화면은 개인 표시 시간대가 아니라 링크가 속한 길드 운영 시간대를 명시적으로 사용한다.
- 현재 `toPublicMemberActivityDetail`의 `events`·`kill_history`와 사용되지 않는 Discord 기반 필드를 제거하고 집계 allowlist 계약 테스트로 고정한다.

### 8.20 개인 언어와 길드 공용 언어

언어는 시간대처럼 개인 표면과 공용 표면의 소유자를 분리한다.

| 표면 | 언어 기준 |
|---|---|
| 로그인 사용자의 UI·개인 DM | 전역 접근 신원의 개인 표시 언어 |
| 비로그인 guest 관리 화면·개인 알림 | 해당 guest profile에서 선택한 언어 |
| 길드 전체 Discord 공지·공용 시스템 문구 | 길드 기본 언어 |
| 공개·마케팅 시스템 UI | 방문 URL의 locale |
| 운영진·회원이 직접 작성한 제목·설명·공지·메모 | 저장된 원문 |
| 공개 프로필의 사용 언어 목록 | 길드의 실제 소통 언어를 알리는 모집 metadata |

- 한 Discord 사용자의 개인 표시 언어는 모든 길드에서 하나다. 어느 길드 설정에서 변경해도 전역 preference와 locale cookie를 함께 바꾼다.
- 첫 선택 전에는 Discord locale·브라우저 지원 언어를 제안할 수 있지만, 사용자 선택 없이 길드별 서로 다른 값을 영구 저장하지 않는다.
- Discord 계정 없이 guest link만 사용하는 사람은 guest별 선택 언어를 사용한다. 이후 전역 접근 신원과 연결될 때 이미 개인 표시 언어가 있으면 덮어쓰지 않는다.
- 길드 기본 언어는 설치자의 활성 언어로 seed하고 운영진이 바꿀 수 있지만 최초 설정의 activation gate에는 넣지 않는다.
- 개인 DM 번역은 전역 개인 표시 언어를 사용하고 길드 기본 언어로 강제하지 않는다. 길드 공지 채널은 수신자별 번역이 불가능하므로 길드 기본 언어 하나를 사용한다.
- 시스템이 생성한 라벨·버튼·상태 설명만 번역한다. 이벤트 제목·설명, 공지 본문, 모집 소개, 운영 메모와 회원 입력은 자동 번역하거나 번역된 값으로 원문을 덮어쓰지 않는다.
- 공개 페이지의 시스템 chrome은 URL locale로 번역하지만 길드 작성 원문과 길드명은 그대로 표시한다.
- `guild_profile_languages`는 길드 사용 언어 목록이며 개인 표시 언어와 길드 기본 언어의 fallback으로 사용하지 않는다.
- 기존 길드별 `guild_avatars.preferred_language`가 모두 같으면 전역 preference로 backfill한다. 서로 충돌하면 임의 선택하지 않고 전역 값을 비운 뒤 다음 로그인에서 한 번만 다시 선택하게 한다.
- guest의 `preferred_language`는 guest 전용 preference로 유지하고, 길드 회원 row의 언어 read/write가 끝난 안정 배포 뒤 호환 컬럼을 제거한다.

## 9. 기능 가용성 Module

### 9.1 원칙

모든 설정 boolean을 기능 토글로 바꾸지 않는다.

- 기능 상태: 이 길드가 이 Module을 사용하는가?
- 기능 정책: 켜진 Module 안에서 어떤 운영 규칙을 사용하는가?

예를 들어 `auto_regear_enabled`는 보급 기능의 자동화 정책이고, `regear_window_minutes`는 보급 정책이다. 둘 다 기능 catalog의 별도 항목이 아니다.

### 9.2 저장 구조

코드의 `FEATURE_CATALOG`가 기능의 의미·경로·의존성·필요 권한을 정의한다. DB는 길드별 상태와 설정값만 저장한다.

#### `guild_feature_states`

| 필드 | 의미 |
|---|---|
| `guild_id`, `feature_key` | 길드와 기능 |
| `state` | `disabled`, `setup_required`, `enabled`, `draining` |
| `config` | 기능별 작은 설정 |
| `updated_by_member_id`, `updated_at` | 변경 주체와 시각 |

상태 의미:

- `disabled`: 데이터는 보존하되 탐색·경로·업무·알림·자동화를 막는다.
- `setup_required`: 운영진의 설정 화면만 열고 회원용 기능은 숨긴다.
- `enabled`: 권한과 정책에 따라 정상 제공한다.
- `draining`: 신규 신청·자동 생성을 막고 기존 미처리 건의 처리 화면·업무·필수 알림만 유지한다.

기능을 끌 때 열린 업무가 없으면 바로 `disabled`로 간다. 열린 업무가 있으면 `draining`으로 전환하고 마지막 건이 종결되면 자동으로 `disabled`가 된다.

예를 들어 환전 포인트 보류가 남아 있으면 새 신청은 막되 기존 실버 지급·취소는 계속한다. 회원 거래 에스크로와 상점 주문 예약도 같은 원칙으로 먼저 해소한다.

### 9.3 최초 catalog

항상 켜진 기반 기능:

- `workspace`
- `events`
- `members`
- `member_self_service`
- `settings_and_permissions`

선택 기능:

| 기능 key | 포함 범위 |
|---|---|
| `operation_assets` | 빌드·파티 템플릿 |
| `tactics` | 미완성 전술 보드와 임시 외부 공유; maturity=`experimental`, 기본 disabled |
| `supply` | 리기어, 제작, 재고; config로 `silver/stock/craft` mode 선택 |
| `guild_economy` | 포인트, 참여·특별 보상, 포인트→실버 환전, 실버→포인트 적립 |
| `guild_shop` | 길드 상점과 주문 |
| `member_market` | 같은 길드 포인트의 에스크로를 사용하는 회원 거래장 |
| `asset_accounting` | 사이펀·루팅 검증; config로 사이펀 `record/custody` 정책 선택 |
| `insights` | 내부 통계·리더보드 |
| `public_guild_profile` | 외부 길드 프로필; 비식별 집계 기본 공개, 인물·경제 섹션 별도 opt-in |

전투 관련 기능 key의 재설계는 이 문서 범위에서 제외한다.

Menhera 콘텐츠 준수와 최근 영상 환전 자격은 이 고객 catalog에 포함하지 않고 명시적인 tenant 확장 entitlement로만 제공한다.

`member_market`과 `guild_shop`은 공통 포인트 잔액을 사용하므로 `guild_economy`에 의존한다. 다만 회원 거래 주문·가격 제안·에스크로·분쟁은 별도 거래 기록에 보존하고 최종 회원 간 포인트 이동만 공통 포인트 원장에 반영한다. `guild_economy`를 끄려면 두 기능을 먼저 `disabled`로 만들거나, 열린 주문이 있으면 함께 `draining`해 에스크로를 모두 해소해야 한다.

### 9.4 Interface와 Adapter

```ts
interface GuildFeatureModule {
  getSnapshot(guildId: string, actor: Actor): Promise<GuildFeatureSnapshot>
  requireUse(
    guildId: string,
    featureKey: FeatureKey,
    use: 'setup' | 'read' | 'intake' | 'process' | 'notify' | 'automate',
  ): Promise<void>
  changeState(command: ChangeFeatureState, context: CommandContext): Promise<void>
}
```

`draining`에서는 `read/process/notify` 중 기존 업무 종결에 필요한 use만 허용하고 `intake/automate`는 거부한다.

같은 snapshot을 다음 Adapter가 사용한다.

- AppShell·AppSidebar 내비게이션 Adapter
- page/layout 직접 경로 guard Adapter
- server action command guard Adapter
- 오늘의 업무함 필터 Adapter
- 알림·Discord·cron 필터 Adapter
- 셀프서비스 도입 checklist Adapter

내비게이션 숨김만으로 기능을 차단하지 않는다.

### 9.5 기존 설정 이관

- `craft_regear_enabled`: `supply` 상태와 `craft` mode로 이관
- `guild_profile_enabled`: `public_guild_profile` 상태로 이관
- `alliance_content_compliance_enabled`: 일반 고객 catalog와 셀프서비스 설정에서 제외하고 명시적인 Menhera tenant 확장 entitlement로 이관한다. 같은 resolver가 내비게이션·직접 경로·action·RPC와 최근 영상 환전 guard를 모두 통제한다.
- 나머지 운영 boolean은 해당 Module의 정책으로 유지한다.

기존 길드에는 현재 보이는 기능이 그대로 보이도록 backfill한다. 새 길드는 설치 wizard에서 필요한 기능만 선택하고 `setup_required → enabled`로 전환한다. 다만 리기어는 선택 여부 자체를 최초 설정에서 반드시 확정하며, 미지원을 선택하면 `supply=disabled`, 지원을 선택하면 최소 정책 완료 전까지 `supply=setup_required`로 둔다.

### 9.6 셀프서비스 운영 시작 기준

새 길드의 최초 설정은 첫 이벤트를 안전하게 운영하는 데 필요한 연결과 리기어 방침만 activation gate로 삼는다.

- Discord 멤버 역할과 운영진 역할을 각각 한 개 이상 선택한다.
- 이벤트 공지 채널을 하나 선택한다. `나중에 설정`으로 완료할 수 없으며 봇의 채널 보기·메시지 보내기·임베드 권한은 자동 사전 점검으로 안내한다.
- 길드 운영 시간대와 Albion 서버·홈 길드를 확정한다.
- 홈 길드 확정은 일반적인 운영 연결이며 인게임 코드·영상·수동 승인을 요구하지 않는다. 이미 활성 연결이 있으면 최초 설정을 거짓 완료하지 않고 대표권 분쟁 신청으로 안내한다.
- 리기어는 `미지원` 또는 `지원`을 운영진이 직접 선택해야 하며 안전 기본값의 묵시적 저장이나 단계 건너뛰기로 완료하지 않는다.
- `미지원`은 정상적인 최초 설정 완료이며 `supply`를 비활성화한다. 이후 지원으로 바꾸면 `setup_required`에서 정책을 마친 뒤 활성화한다.
- `지원`은 청구 허용 범위, 기본 지급 기준과 운영진 승인 방식을 확인해야 완료된다.
- 자동 리기어 생성, 제작·완제품 재고 방식, 역할별 고급 예외와 이벤트 자동 시작은 최초 activation의 필수가 아니며 해당 설정 화면에서 이어서 조정한다.
- 운영 시작 기준을 충족하면 길드원 접근을 열고 운영진을 첫 이벤트 생성으로 안내한다.
- 7단계 운영 가이드는 선택 기능을 발견하고 품질을 높이는 진행률 checklist이며 한 단계가 남아도 길드나 회원 접근을 차단하지 않는다.

이 기준은 리기어를 모든 길드에 강제하는 것이 아니라, 핵심 기능의 사용 여부를 운영진이 모른 채 기본값으로 지나치지 않게 하는 것이다.

### 9.7 Discord 역할 기반 권한

운영진 권한의 대상은 기본적으로 길드의 현재 Discord 역할이다. 앱은 역할을 직접 대체하지 않고 역할별 capability 묶음, 집행 결과와 변경 기록을 관리한다.

- Discord 역할 선택 UI에서 역할 이름과 현재 인원 수를 확인하고 사전 정의된 운영 권한 묶음 또는 세부 capability를 연결한다.
- `admin_role_ids`, 이벤트 종류별 생성자 역할, 밤스쿼드 콜러 역할과 `permission_role_grants`를 하나의 역할→권한 연결 모델로 합친다.
- Discord 역할 추가·제거가 확인되면 웹 세션의 유효 권한을 다시 계산하며, 권한·재정·복구 같은 고위험 command는 오래된 세션 snapshot만으로 허용하지 않는다.
- `permission_user_overrides`는 일반적인 운영진 지정 화면에서 분리한다. 긴급·단기 예외만 사유·실행자·만료 시각과 함께 허용하고 만료 시 자동 회수한다.
- 로컬 길드 계정은 회원 셀프서비스용이며 운영 capability를 직접 부여하지 않는다. 운영진이 되려면 같은 회원 기록에 Discord 접근 신원을 연결한다.
- Discord는 운영진 자격의 기본 원천이지만 업무 상태·원장·승인·변경 기록의 원본은 계속 앱이다.

### 9.8 통계·리더보드·준수의 분리

`insights`는 같은 데이터를 보여주는 하나의 순위 화면이 아니라 목적이 다른 두 표면으로 나눈다.

- **무기 사용 통계**는 회원 간 순위를 만드는 지표가 아니라 편성 참고 자료다. 회원 활동 프로필은 자주 관측된 무기군을, 길드 통계는 기간·표본 수와 함께 최근 조합 분포 및 낮게 관측된 무기군을 보여준다.
- 집계 원본은 길드 통계에 포함되는 전투에서 실제 장착이 관측된 장비다. 이벤트 슬롯의 배정·선택 무기는 계획된 편성 기록으로 별도 표시하고 실제 관측값의 대체 자료로 사용하지 않는다.
- 티어·인챈트·품질·알려진 아티팩트 변형은 같은 무기군으로 정규화하되 킬·데스 원본의 정확한 Albion item type은 그대로 보존한다.
- 같은 전투에서 같은 무기군이 여러 번 관측되어도 회원·무기군별 사용 전투 한 번으로 집계한다. 장비가 관측되지 않으면 `데이터 없음`이며 미사용·미숙련으로 판정하지 않는다.
- 무기 사용 횟수에는 숙련도·실력·성과 등급 표현을 붙이지 않고 포인트·보상·리기어·권한·참가 자격·자동 편성의 입력으로 사용하지 않는다. 제한된 객관적 전투 인정은 팀·개인 전투 위업이 별도로 담당한다.
- 공개 길드 프로필이나 회원 공개 활동 요약에 무기 분포를 노출할 때도 기간·표본과 사용 빈도라는 의미를 유지하고 개인 실력 추천처럼 표시하지 않는다.
- **길드원 성취 리더보드**는 킬·참여·생존·K/D·승률 같은 지표별 상위 성취와 개인 진행을 보여주는 동기부여 화면이다.
- 서로 다른 지표를 단일 종합 점수로 합치거나 하위 순위·미달자 명단을 강조하지 않는다.
- 지표마다 기간, 모집단, 최소 표본과 제외 기준을 설명해 역할·표본 차이를 성과 등급으로 오해하지 않게 한다.
- 기간별 리더보드와 **성취 배지**를 분리한다. 순위는 현재 집계에 따라 변하지만 배지는 객관적 이정표를 처음 달성한 시점의 영구 기록이다.
- 성취 배지는 해당 길드의 회원 기록에 귀속하고 포인트·실버·리기어·기능 접근·권한·준수 판정과 연결하지 않는다.
- 전투 배지는 **팀 전투 위업**을 중심에 두고, 공식 전투 판정이 규모·교전량·결과와 참가자를 확정한 경우에만 확인된 참가자 모두에게 같은 위업을 idempotent하게 부여한다.
- 결과가 모호하거나 전투 집계에서 제외된 기록은 팀 전투 위업을 만들지 않고 운영진의 주관적 승패 입력이나 AAR로 보완하지 않는다.
- 킬 기여·생존처럼 직접 확인되는 **개인 전투 위업**은 별도 보조 트랙으로 두며 역할과 지표의 한계를 함께 표시한다.
- 힐량·클렌즈·클럼프·방어 저지·포지셔닝·콜 수행처럼 현재 데이터가 증명하지 못하는 역할 수행을 추정하거나, 개인 위업을 전 역할 공통 실력 등급·MVP로 합치지 않는다.
- **운영진 운영 통계**는 포인트 흐름·참여 추세·탈퇴자 잔액·상점·리기어·영상 검토 같은 운영 질문별로 구성한다.
- 운영 통계의 개인 행은 예외를 조사하는 근거일 뿐 자동 제재·권한 회수·보상 삭감 command로 연결하지 않는다.
- Menhera의 인원 관리 기준은 전용 콘텐츠 준수 정책·상태·근거로 다루며 리더보드 순위를 입력으로 사용하지 않는다.
- 공개 프로필의 개인 리더보드는 **공개 인물 정보**이므로 길드의 섹션별 opt-in 없이는 외부에 노출하지 않는다.

### 9.9 무료 베타와 향후 길드 유료 플랜

현재 상용화 상태는 모든 현재 제공 기능을 결제 정보 없이 사용하는 **무료 베타**다. 향후 **길드 유료 플랜**을 도입하지만 전환 날짜를 정하지 않는다.

- 유료 entitlement의 단위는 Discord 사용자나 길드원 좌석 수가 아니라 길드 워크스페이스다.
- 한 Discord 사용자가 여러 길드를 운영하면 각 길드는 서로 독립된 플랜 상태를 가진다.
- 무료·유료 기능 경계, 가격, 등급과 결제 주기는 후속 상용화 설계에서 정한다. 현재 무료 기능 목록으로 미래 entitlement를 추정하지 않는다.
- 전환 결정 전에는 결제 수단을 받거나 베타 길드에 자동 만료일을 부여하거나 기능을 과금 사유로 제한하지 않는다.
- 유료 전환은 핵심 운영 흐름의 신뢰성, 셀프서비스 도입, entitlement·결제·지원, 데이터 내보내기와 downgrade 경로가 준비된 뒤 명시적으로 결정한다.
- 결정 뒤에는 현재 공개 약속인 최소 30일 사전 공지를 지키고 가격·포함 기능·적용일·유예 기간·계속 사용과 내보내기 선택지를 함께 안내한다.
- 가격 페이지는 단일 상용화 상태에서 생성해 앱의 실제 entitlement와 다른 날짜·가격·기능을 약속하지 않는다.

### 9.10 체험형 데모 시나리오

공개 데모는 화면 모음이 아니라 로그인 없이 제품의 운영 결과까지 확인하는 **체험형 샌드박스**다. 모든 기능을 얕게 복제하기보다 제품 가치와 도메인 차이를 설명하는 소수의 종단 간 흐름을 제공한다.

- 첫 대표 시나리오는 `운영진 이벤트 공개 → 길드원 슬롯 신청 → 운영진 참가 마감 → 참여 보상 확정 → 사망 참가자의 리기어 처리`다.
- 운영진과 길드원 역할을 명시적으로 전환해 한 역할의 행동이 다른 역할의 화면과 후속 업무를 어떻게 바꾸는지 보여준다.
- 참여만으로 받는 보상과 적격 사망 뒤 받는 리기어가 서로 다른 흐름임을 같은 시나리오에서 드러낸다.
- 버튼은 안내 toast로 끝나지 않고 상태, count, 다음 행동과 완료 결과를 실제로 갱신한다.
- 데모 세션 상태는 `sessionStorage` 수준으로 격리해 새로고침에는 유지하고 새 브라우저 세션에는 이어지지 않게 한다.
- 모든 시나리오는 명시적 초기화로 알려진 seed 상태로 돌아간다.
- 실제 제품의 용어·허용 전이·필수 확인을 가능한 한 재사용하지만 운영 DB, Discord, outbox, 결제와 실제 길드 데이터에는 쓰지 않는다.
- 아직 구현하지 않은 기능이나 실제 제품과 다른 제약을 체험 가능한 기능으로 표시하지 않는다.

### 9.11 비승인 회원 운영 기능 폐기

`체험 멤버 운영`과 `참여 불가 일정`은 코드에 존재하지만 도메인 소유자가 의도한 제품 기능이 아니다. 선택 기능이나 실험 기능으로 유지하지 않고 안전하게 제거한다.

- 체험 상태·검토일·운영 메모와 부재 기간·사유는 이벤트 참가, 편성, 참여 보상, 리기어, Menhera 콘텐츠 준수와 권한 판정에 사용하지 않는다.
- 마케팅·가이드·데모·공개 프로필에서 지원 기능으로 소개하지 않는다.
- 첫 배포는 입력 UI와 이벤트 충돌 경고를 제거하고 server action/RPC 신규 쓰기를 차단한다.
- 운영 환경의 두 테이블과 관련 운영 기록 건수를 길드별로 읽기 전용 확인한다.
- 저장 데이터가 없으면 호환 read와 계정 병합 분기를 제거한 뒤 후속 migration에서 테이블·RPC를 제거한다.
- 저장 데이터가 있으면 삭제 전에 해당 길드가 내려받을 수 있는 최소 내보내기 또는 폐기 안내 기간을 제공하고, 처리 결과를 기록한다.
- 스키마 제거는 코드가 더 이상 해당 테이블을 읽거나 쓰지 않는 안정 배포 뒤 별도 migration으로 수행한다.

### 9.12 알림 수신자·긴급도 분리

알림은 상태의 원본이 아니라 필요한 사람이 제때 앱의 상태를 알거나 처리하도록 돕는 전달 Adapter다. 하나의 상태 변경을 모든 Discord 표면에 동시에 방송하지 않는다.

| 종류 | 수신자·채널 | 즉시 전달 기준 |
|---|---|---|
| 이벤트 공지 | 길드 전체·이벤트 공지 채널 | 모집 시작, 중요한 일정·집결 변경 |
| 개인 결과 알림 | 해당 길드원·개인 DM | 본인의 신청·배정·마감·지급 결과와 임박 기한 |
| 행동 필요 알림 | 담당 운영진·이벤트 또는 운영진 채널 | 운영진의 판단·처리가 필요한 신청·오류·예외 |
| 운영 요약 알림 | 운영진 채널 | 즉시 대응이 필요 없는 현황을 설정 주기로 묶음 |

- 개인 DM은 전체 수신과 이벤트 카테고리별 설정을 따르며, 수신 거부·전송 실패가 앱 안의 권리나 상태를 바꾸지 않는다.
- 운영진 채널에는 단순 생성·조회·정상 자동 처리처럼 조치가 필요 없는 상태를 즉시 보내지 않는다.
- 같은 `guild + source + audience + delivery kind`는 한 번만 전달한다.
- 웹이나 Discord에서 업무가 끝나면 원래 행동 필요 메시지와 업무함 상태를 완료 결과로 동기화하고 별도 중복 완료 메시지를 만들지 않는다.
- 요약 알림은 오늘의 업무함과 같은 snapshot을 사용해 count와 deep link가 다르지 않게 한다.
- 알림 payload에는 업무 해결에 필요하지 않은 개인 정보, 관리 비밀과 증빙 원문을 포함하지 않는다.
- 상태 commit과 알림 outbox 생성은 함께 성공하지만 외부 전달 실패는 원본 상태를 되돌리지 않는다.

### 9.12A 전역 시스템 공지

전역 시스템 공지는 길드 업무 알림이 아니라 서비스 운영자가 모든 길드의 앱 표면에 표시하는 임시 안전 안내다.

- `purpose`는 `incident`, `maintenance`, `security` 중 하나만 허용하며 제품 업데이트·마케팅·길드별 안내에는 사용하지 않는다.
- `severity`는 `important`와 `critical`로 구분한다. `important`는 사용자가 닫을 수 있고 `critical`만 활성 중 닫기를 허용하지 않는다.
- 모든 공지는 `expires_at`을 필수로 가지며 서비스 운영자는 만료 전에도 명시적으로 종료할 수 있다.
- 동시에 활성인 공지는 하나만 허용한다. 새 공지를 발행할 때 기존 활성 공지가 있으면 교체 결과를 확인하고 한 트랜잭션에서 기존 공지를 종료한 뒤 새 공지를 활성화한다.
- 만료되거나 종료된 공지는 cache 재검증 지연으로 다시 노출되지 않게 응답 시점에도 유효 시각을 확인한다.
- 사용자가 `important` 공지를 닫은 상태는 같은 공지 버전에만 적용하고, 내용을 바꿔 새 버전으로 발행하면 다시 표시할 수 있다.
- 공지 생성·교체·조기 종료는 서비스 운영 변경 기록에 실행자·목적·심각도·만료 시각과 함께 남긴다.
- 전역 시스템 공지는 이벤트 공지, 개인 DM, 운영진 채널과 별개이며 자동으로 Discord에 재전송하지 않는다.

### 9.12B 기능별 운영 안내

기능별 운영 안내는 서비스 전체 공지가 아니라 길드 운영진이 특정 기능을 이용하는 회원에게 반복 규칙을 전달하는 길드별 고정 안내다.

- 이벤트 페이지에는 신청·배정 규칙, 리기어 페이지에는 증빙·지급 기준, 상점 페이지에는 수령 장소·시간처럼 매번 확인해야 하는 내용만 둔다.
- 각 페이지에는 길드별 안내를 최대 하나만 두며 빈 값이면 표시하지 않는다.
- 활성 안내는 사용자가 임의로 닫을 수 없고 만료되지 않으며 운영진이 내용을 비우거나 교체할 때까지 유지한다.
- 이미지는 선택적인 보조 자료이고 운영 규칙의 핵심은 텍스트로도 전달한다.
- 당일 일정, 일시 변경, 새 소식은 Discord 이벤트 공지나 대상별 알림으로 전달한다.
- 기능별 운영 안내를 Discord에 자동 전송하거나 다른 길드와 서비스 전체 표면에 노출하지 않는다.
- 생성·교체·제거는 길드 설정 변경 기록에 대상 기능과 실행자를 남긴다.

### 9.13 길드 정지·삭제 생명주기

봇 제거와 영구 삭제를 같은 상태 변경으로 처리하지 않는다.

| 상태 | 허용 표면 | 전이 조건 |
|---|---|---|
| `pending` | 설치·최초 설정 | 운영 시작 기준 완료 시 `active` |
| `active` | 정상 길드 운영 | 봇 제거·운영 정지 시 `suspended`, 명시적 삭제 요청 시 `deletion_pending` |
| `suspended` | 운영진 상태 확인·봇 재연결·필수 백업 | 봇과 운영 시작 기준 재확인 시 `active`, 명시적 삭제 요청 시 `deletion_pending` |
| `deletion_pending` | 운영진 삭제 철회·필수 백업 | 요청 후 30일 안에 철회하거나 만료 뒤 purge |
| `deleted` | tombstone과 허용된 최소 보존 기록만 | 제품 내 복구 불가 |

- `suspended`에는 `bot_removed`, `inactive`, `policy`, 향후 `billing`처럼 원인과 전환 주체·시각을 별도 기록한다.
- 봇 제거와 장기 미접속은 `suspended`만 만들며 삭제 countdown을 시작하지 않는다.
- 일시 정지 즉시 길드원 session·신규 command, 공개 프로필·게스트 링크·회원 공개 활동 링크, Discord 전송, outbox 신규 생성, sync와 cron을 막고 관련 public cache를 제거한다.
- 운영진은 일시 정지 화면에서 원인, 보존된 데이터, 재연결 절차와 필수 백업만 확인한다. 일반 운영 mutation은 허용하지 않는다.
- 재활성화는 봇 설치·Discord 역할·공지 채널·운영 시간대·Albion 홈 길드와 리기어 도입 결정을 다시 검증하고 기존 회원·경제·보급·미완료 의무를 그대로 이어받는다.
- 삭제 요청은 일반 관리자 권한과 분리된 `WORKSPACE_DELETE` capability, 최근 재인증, 정확한 길드명 입력과 되돌릴 수 없는 결과의 최종 확인을 요구한다.
- 포인트 hold, 회원 거래 에스크로, 상점·재고 예약, 미완료 환전·리기어·제작·보급·지급 의무가 하나라도 있으면 요청을 거부하고 해결 업무와 deep link를 제공한다.
- 삭제 대기 전환은 요청자·사유·요청 시각·`purge_at`과 당시 필수 상태 요약을 원자적으로 기록한다.
- 삭제 대기 시작과 함께 공개·게스트·회원 token과 초대를 폐기하고 모든 session을 철회하며 cache·검색·Discord 미리보기에서 길드를 제거한다.
- 30일 안의 삭제 철회는 같은 전용 capability와 재인증을 요구한다. 봇과 운영 시작 기준이 유효하면 `active`, 아니면 `suspended`로 돌아간다.
- purge worker는 `purge_at`을 지난 대기 건만 claim하고 guild-scoped 제품 데이터·비밀·파일·접근 경로를 모두 제거한 뒤 복구 불가 영수증과 tombstone을 남긴다.
- 같은 사람의 전역 접근 신원과 다른 길드 회원 기록은 삭제하지 않는다. 동일 Discord 길드를 다시 설치하면 과거 워크스페이스를 되살리지 않고 새 워크스페이스로 시작한다.
- 법적 의무·보안 조사에 필요한 최소 기록은 제품 DB의 복구 가능한 길드 데이터와 분리하고 일반 운영진·회원 화면에 노출하지 않는다.
- 공개 FAQ의 30일 약속, 개인정보 안내와 실제 `purge_at`·철회 가능 시점을 같은 resolver에서 표시한다.

### 9.14 공개 문서·인앱 레시피·도입 체크리스트

세 도움말 표면은 같은 설명을 복사한 문서 묶음이 아니라 독자와 사용 시점이 다른 Adapter다.

- **공개 제품 문서**는 도입 전 평가자와 도입 후 사용자 모두가 로그인 없이 공유할 수 있는 현재 제품 계약이다.
- 공개 문서는 배포된 동작·제약·권한·상태만 설명하고 미구현 계획, 길드별 설정값과 과거 동작을 현재 기능처럼 쓰지 않는다.
- **인앱 운영 레시피**는 활성 tenant의 현재 capability·기능 상태·미완료 업무를 기준으로 한 가지 운영 작업의 짧은 절차와 실제 deep link만 제공한다.
- 인앱 레시피는 공개 제품 문서 전체를 복제하거나 제품 정책을 별도로 정의하지 않으며 접근할 수 없는 route와 `disabled` 기능의 일상 사용 절차를 보여주지 않는다.
- **도입 진행 체크리스트**는 운영 시작 뒤 선택 기능 발견과 설정 품질의 완료 상태·다음 설정 링크만 보여주며 설명서 본문을 소유하지 않는다.
- 체크리스트 항목이 남아 있어도 운영 시작 기준을 충족한 길드의 회원 접근·첫 이벤트·정상 운영을 막지 않는다.
- 공통 제품 규칙은 한 canonical source를 참조하고 길드가 작성한 이벤트·리기어·상점 규칙은 **기능별 운영 안내**에 남긴다.
- 미완성·실험·비활성 기능은 공개 문서와 인앱 레시피에서 같은 상태와 제한을 표시하며 핵심 완성 기능처럼 홍보하지 않는다.
- 기능·용어·권한·상태 변경은 관련 ko·ja·en·zh 공개 문서와 인앱 레시피 갱신을 같은 acceptance criterion으로 가진다.
- 문서의 route·CTA는 현재 feature state와 권한에서 열리는 실제 화면을 가리키고 제거·이름 변경된 route는 문서 검증에서 실패한다.

### 9.15 공개 가치와 길드 도입 경로

공개 사용자의 반복 이용과 길드 운영진의 도입 전환은 서로 연결되지만 같은 퍼널이 아니다. 현재 landing·features·pricing·FAQ·상단 nav에서 데모·봇 설치·문서·Discord·길드 로그인이 비슷한 비중으로 반복되는 구조는 방문자가 다음 행동을 스스로 분류하게 만든다.

| 방문 의도 | 시작 표면 | 주 행동 | 다음 연결 |
|---|---|---|---|
| 공개 사용자 | 공유 링크·공개 데이터 탐색 | 로그인 없이 결과 확인·재탐색·공유 | 관련 공개 길드 프로필과 제품 발견 |
| 도입 검토 운영진 | landing·features | 실제 운영 문제와 체험형 데모 확인 | 공개 문서·가격 검토 뒤 봇 초대 |
| 기존 사용자 | 어느 공개 페이지든 | 내 길드로 이동·길드 로그인 | 활성 길드의 다음 행동 홈 |

- 공개 가치 경로는 Discord OAuth, 계정 생성이나 봇 초대를 첫 결과의 조건으로 삼지 않는다.
- 공개 결과 링크의 읽기·공유가 제품 홍보 CTA 때문에 가려지거나 중단되지 않게 한다. 관련 길드 프로필·기능·도입 체험은 결과 뒤의 보조 발견으로 연결한다.
- 길드 도입 경로는 `운영 문제와 실제 흐름 확인 → 체험형 데모 → 문서·가격 검토 → 봇 초대` 순서를 기본으로 한다.
- landing·features는 데모 체험, pricing은 현재 상용화 상태를 확인한 뒤 봇 초대처럼 페이지별 주 행동을 하나만 강조한다. 다른 유효 경로는 nav나 보조 링크로 유지한다.
- 기존 사용자의 `내 길드로 이동`·`길드 로그인`은 모든 공개·마케팅 페이지에서 일관되게 찾을 수 있고, 인증 뒤 활성 길드가 있으면 도입 화면을 다시 거치지 않는다.
- 앱 커뮤니티 Discord는 문의·지원의 보조 경로다. 공개 기능 사용, 제품 평가 또는 봇 설치를 끝내기 위한 필수 단계나 주 전환 CTA로 사용하지 않는다.
- 공개 가치 이용, 데모 시작·완료, 문서·가격 이동, 봇 초대는 서로 다른 전환 사건으로 측정하며 공개 사용자에게 로그인 식별자를 요구하지 않는다.

### 9.16 검색 발견과 공유 결과의 경계

검색엔진 노출과 외부 링크 공유는 별개의 공개 수준이다. 검색은 안정적인 발견 표면을 선별해 제공하고, 개별 결과 주소는 색인하지 않아도 Discord·커뮤니티 공유 가치를 유지한다.

| 표면 | 검색 노출 | 외부 공유·미리보기 |
|---|---|---|
| 마케팅·기능·공개 제품 문서 | 허용 | 허용 |
| 대표 데모·안정적인 공개 기능 시작점 | 허용 | 허용 |
| 운영진이 활성화한 공개 길드 프로필 | 허용 | 허용 |
| 일회성 검색 조건·개별 공개 결과 | 제외 | 허용 |
| 회원 공개 활동·게스트·전술 token 링크 | 제외 | 권한·폐기 정책에 따라 허용 |
| 앱 내부·tenant 관리·개인 화면 | 제외 | 기본 제외 |

- indexable page는 canonical root의 안정 주소, 실제 공개 내용과 올바른 locale alternate를 가져야 하며 sitemap과 metadata 분류가 같은 정책을 사용한다.
- 공개 길드 프로필은 기존 섹션별 공개 동의와 활성 상태를 만족한 경우에만 검색 발견 표면이 된다.
- 일회성 조건·개별 결과는 sitemap과 검색 색인에서 제외하지만 직접 접근, 공유 주소와 Open Graph 미리보기는 유지한다.
- `noindex`는 비공개나 접근 금지가 아니며 `index`는 모든 하위 데이터의 공개 동의가 아니다.
- 현재 `/super-admin/seo`의 `검색 → 설치 흐름`은 길드 도입만 성공으로 본다. 이를 공개 가치와 길드 도입의 두 report로 분리한다.
- 공개 가치 report는 검색 세션의 공개 결과 확인·유효 재탐색·링크 공유를 보고, 길드 도입 report는 데모 시작·완료·문서·가격 이동·봇 초대·tenant 전환을 본다.
- 공개 가치 측정은 로그인이나 Discord 식별자를 요구하지 않고 정해진 page·locale·referrer category·event 단계만 비식별 집계한다.
- 개별 검색어·URL에 사람·Discord·Albion 캐릭터의 비공개 운영 정보를 결합하지 않는다.

### 9.17 서사형 마케팅 홈

`/world-prototype`은 폐기 대상 실험이 아니라 차별점이 약한 기존 랜딩을 대체하기 위해 제작 중인 **서사형 랜딩**이다. 제품 기능이나 별도 데모 route로 장기 운영하지 않고, 완성 전 검토 공간에서 차기 홈을 준비한다.

- 핵심 서사는 `집결 준비 → 전투 → 전후 보급·리기어 → 재출전`으로 길드 운영의 반복 루프와 AGM이 연결하는 결과를 보여준다.
- 분위기와 세계관만 전달하는 게임 홍보물이 되지 않게 각 장면이 실제 제품의 이벤트·전투 기록·보급·리기어·운영 기록 가치와 연결되어야 한다.
- 서사형 랜딩 자체에서 실제 tenant 상태가 변하는 것처럼 가장하지 않는다. 상호작용으로 제품을 확인하려는 방문자는 **도입 체험**으로 이동한다.
- 페이지의 주 CTA는 체험형 데모, 보조 CTA는 봇 초대다. 기존 사용자의 내 길드 진입은 marketing nav에서 계속 제공한다.
- 미완성 동안 `noindex`·주 navigation 미노출을 유지하고 canonical 랜딩과 검색 성과를 나누지 않는다.
- 승격할 때 새 영구 URL을 추가하는 대신 기존 `/`·locale landing 주소의 콘텐츠를 교체하고 metadata·sitemap·attribution을 이어받는다.
- 네 locale에서 같은 장면 순서와 제품 의미를 유지하되 운영진 작성문이나 실제 길드 데이터를 샘플로 노출하지 않는다.
- 큰 배경 이미지와 scroll animation은 모바일 핵심 문구·CTA를 가리키지 않아야 하고 reduced-motion 환경에서도 같은 내용을 읽고 이동할 수 있어야 한다.
- 새 홈이 안정화되면 기존 랜딩 구현과 임시 prototype route 중 하나만 남도록 중복 surface를 제거한다.

## 10. 오늘의 업무함 Module

### 10.1 책임

오늘의 업무함은 도메인 작업을 직접 처리하지 않는다. 각 Module의 미처리 업무를 같은 형태로 모으고 올바른 처리 화면으로 연결한다.

통계, 동기화 건강 상태, 모집 준비도, 이벤트 준비율은 대시보드의 별도 섹션으로 남긴다.

### 10.2 Interface

```ts
interface WorkQueueAdapter {
  key: WorkQueueKey
  featureKey: FeatureKey | null
  requiredCapability: Capability
  getSummary(context: QueueContext): Promise<WorkQueueSummary>
  getHref(item?: WorkQueueItem): string
}

interface TodayWorkQueueModule {
  getSnapshot(context: QueueContext): Promise<TodayWorkQueueSnapshot>
}
```

`TodayWorkQueueModule`은 등록된 Adapter를 병렬 조회하고 기능 가용성·권한·긴급도를 한 번만 적용한다.

### 10.3 표준 출력

```ts
interface WorkQueueSummary {
  key: WorkQueueKey
  count: number
  oldestCreatedAt: string | null
  urgency: 'normal' | 'watch' | 'overdue' | 'critical'
  reason: string
  href: string
}
```

초기 queue:

- `regear_review`
- `exchange_fulfillment`
- `deposit_match_exception`
- `shop_price_review`
- `shop_fulfillment`
- `member_trade_dispute`
- `craft_collection`
- `craft_receipt_overdue`

신규 Module 도입 후:

- `identity_conflict`
- `member_merge_review`
- `supply_attention`
- `outbox_failure`

정상적인 자동 신원 연결과 정상 알림 재시도는 업무로 만들지 않는다. 반복 실패나 모순만 올린다.

### 10.4 단일 source of truth

한 번 만든 snapshot을 다음 화면이 공유한다.

- 관리자 오늘 화면
- 승인 업무 화면의 tab·count
- sidebar badge
- 모바일 빠른 업무 카드
- Discord 일일 요약

`admin_pending_badge_counts`, 직접 fallback query, approval tab 배열, deep link map을 각각 유지하지 않는다. 전환 기간에는 결과를 비교하되 최종 단계에서 legacy fallback을 삭제한다.

업무 해결은 링크된 도메인 Module의 command를 사용한다. 업무함에 범용 “승인” mutation을 만들지 않는다.

### 10.5 회원 업무함

회원 업무함은 운영진의 오늘의 업무함을 그대로 복제하지 않는다. 현재 길드에서 회원 본인과 관련된 요청을 다음 세 영역으로 정규화한다.

1. `action_required`: 가격 인상 재확인, 거래 수령 확인·분쟁 제기, 허용된 수정·취소처럼 회원이 지금 선택해야 하는 요청
2. `waiting_on_guild`: 운영진 검토, 인게임 지급, 물품 준비, 제작·수령 준비처럼 길드 측 처리를 기다리는 요청
3. `history`: 완료·거절·취소되어 행동이 끝난 요청

- 리기어·환전·입금 적립·상점·회원 거래·제작 Adapter가 원본 상태, 다음 행동, 상대 주체, 기한, 금액과 deep link를 같은 형식으로 제공한다.
- `action_required`는 기한 임박과 오래된 순서로 먼저 보여주고 `waiting_on_guild`는 다음 처리 주체와 현재 단계를 명시한다.
- “대기 중”이라는 하나의 모호한 상태 대신 `내 확인 필요`, `운영진 검토 중`, `인게임 지급 대기`, `물품 준비 중`처럼 다음 주체가 드러나는 문구를 사용한다.
- 회원 업무함의 버튼은 원본 Module command를 호출하며 별도 범용 mutation이나 복제 상태를 만들지 않는다.
- 이력은 기능·상태·기간 필터로 조회하되 기본 접힘 상태로 두고 행동 필요·대기 목록과 중복 표시하지 않는다.
- 기능이 `draining`이면 신규 신청은 숨겨도 기존 행동·대기 항목은 종결될 때까지 유지한다.
- 다중 길드 사용자의 항목은 현재 활성 길드 문맥에만 속하며 길드 간 요청을 합산하지 않는다.

### 10.6 다음 행동 홈

**다음 행동 홈**은 기능 요약 대시보드가 아니라 로그인 사용자가 현재 문맥에서 무엇을 먼저 확인하거나 처리할지 정하는 시작 화면이다.

- 모든 홈 응답은 정확히 하나의 활성 길드 문맥과 현재 membership·capability에서 계산한다.
- 일반 길드원은 가장 가까운 참여 가능 이벤트, 자신의 신청·배정 상태와 회원 업무함의 최우선 `action_required`를 본다.
- 운영진은 오늘의 업무함에서 가장 긴급한 항목, 임박 이벤트와 운영을 막는 필수 설정·반복 동기화 실패를 먼저 본다.
- 운영진이 참가자이기도 하면 운영 책임과 개인 참가 상태를 구분하되 같은 이벤트·요청을 중복 카드로 만들지 않는다.
- 게스트·연합 참가자는 초대 또는 명시적으로 허용된 이벤트와 그 이벤트 안의 다음 행동만 보며 회원 경제·운영 업무·다른 이벤트를 받지 않는다.
- 홈 항목은 이벤트·오늘의 업무함·회원 업무함 Module이 제공한 원본 상태와 deep link를 그대로 사용하고 별도 상태·count·mutation을 만들지 않는다.
- 종료 이벤트·완료 이력·통계·리더보드·전체 기능 바로가기는 홈의 우선 카드가 아니며 각 전용 화면에서 조회한다.
- `disabled` 기능은 카드와 빈 상태를 만들지 않고 `draining` 기능은 기존 미완료 행동이 있는 사람에게만 나타난다.
- 보여줄 행동이 없으면 모든 기능 카드를 채우지 않고 다음 참여 가능 이벤트 또는 역할에 맞는 명확한 빈 상태 하나를 보여준다.

## 11. 운영 변경 기록 Module

### 11.1 사용자 용어

사용자 화면의 “감사 로그”는 모두 “운영 변경 기록”으로 바꾼다. 내부 테이블 이름 `admin_audit_log`는 첫 단계에서 유지해도 된다. 슈퍼 관리자 기록은 서비스 운영 기록으로 분리한다.

### 11.2 수집 범위

기록한다:

- 금전·포인트·재고 변경
- 신청 승인·거절·취소
- 보급 상태 변경
- 회원 병합·캐릭터 이전·접근 철회
- 권한·정책·기능 상태 변경
- 대량 import·reset·삭제

기록하지 않는다:

- 화면 조회
- 검색·필터·일반 탐색
- 원본 IP·User-Agent
- OAuth token·session·초대 코드
- Discord 메시지 원문 전체

### 11.3 표준 schema

```ts
interface OperationalChange {
  guildId: string
  action: OperationalChangeKind
  actorMemberId: string | null
  actorIdentityKind: 'discord' | 'local' | 'system' | 'support'
  actorSubjectId: string
  targetKind: OperationalTargetKind
  targetId: string
  beforeSummary: Record<string, JsonValue> | null
  afterSummary: Record<string, JsonValue> | null
  reason: string | null
  source: 'web' | 'discord' | 'cron' | 'support'
  correlationId: string
  createdAt: string
}
```

- action별 schema allowlist로 details를 검증한다.
- 자유로운 metadata dump를 허용하지 않는다.
- 표시명 snapshot은 보조 정보이며 ID를 대체하지 않는다.
- tenant 삭제 전까지 보존하고 별도의 행동 추적 데이터는 추가하지 않는다.

### 11.4 기록 신뢰성

금전·재고·권한·병합처럼 중요한 DB mutation은 같은 RPC 트랜잭션에서 기록한다. 애플리케이션의 fire-and-forget insert를 성공 기준으로 사용하지 않는다.

외부 후속 작업만 outbox를 사용한다. 운영 변경 기록이 실패하면 중요한 mutation도 실패해야 한다.

### 11.5 Interface

```ts
interface OperationalChangeModule {
  appendWithinTransaction(entry: OperationalChangeInput): Promise<void>
  list(query: OperationalChangeQuery): Promise<OperationalChangePage>
}
```

UI나 Discord Adapter는 `appendWithinTransaction`을 직접 호출하지 않는다. 도메인 command Implementation이 상태 변경과 함께 호출한다.

### 11.6 서비스 운영 도구 경계

서비스 운영 도구는 길드 운영진보다 강한 범용 관리자 화면이 아니다. 서비스 전체가 소유하는 공지·진단·SEO와 테넌트 장애·계정 충돌·데이터 복구 같은 예외 지원만 다룬다.

- 테넌트·사용자·의존성·작업 상태 조회가 기본이고 모든 route·action은 server에서 서비스 운영자 신원을 다시 확인한다.
- **지원용 대리 조회**는 짧은 수명의 별도 세션으로 대상 tenant 문맥과 지원 중 배너만 제공하며 길드 운영 capability나 일반 mutation 권한을 부여하지 않는다.
- 대리 조회 시작·종료는 **서비스 운영 기록**에 남기되 그 안의 페이지 방문·검색·필터는 수집하지 않는다.
- 테넌트 생명주기·계정 병합·접근 예외·backfill·복구는 각각 typed input과 허용 범위를 가진 **서비스 복구 명령**으로 분리한다.
- 모든 서비스 복구 명령은 실행 직전 대상·현재 상태·변경 후 상태·영향 건수를 다시 계산하고 필수 사유와 명시적 확인 문구를 요구한다.
- 같은 의도의 재전송은 idempotency key로 한 번만 실행하고 범위를 벗어난 tenant·사용자·row는 함께 수정하지 않는다.
- DB 변경은 서비스 운영 기록과 같은 transaction에서 확정한다. 외부 job은 claim 기록이 성공한 뒤 시작하고 성공·실패·부분 영향 없는 종결 결과를 추가한다.
- 서비스 운영 기록에는 실행자·대상·사유·허용된 전후 요약·correlation ID만 남기며 token·cookie·secret·원문 개인정보와 자유 형식 payload dump를 금지한다.
- tenant에 영향을 주는 복구는 별도 서비스 운영 기록을 원본으로 두고 해당 길드의 운영 변경 근거와 correlation ID로 연결한다.
- 정상 길드 업무와 셀프서비스 설정은 서비스 복구 명령으로 대신하지 않으며 raw SQL·env 토글·원시 POST endpoint를 제품의 정상 운영 절차로 만들지 않는다.

## 12. Module별 Depth와 삭제 테스트

### 12.1 실제 Seam과 Adapter

모든 경계를 Seam으로 만들지 않는다. 실제로 둘 이상의 정책이나 채널 Implementation이 교체되는 곳만 Seam으로 둔다.

| Seam | Adapter |
|---|---|
| 접근 신원 확인 | Discord OAuth Adapter, 로컬 길드 계정 Adapter |
| 보급 재고 소비 정책 | 직접 재고 출고 Adapter, 제작 리기어 장부 차감 Adapter |
| 업무 종류 공급 | 리기어·환전·기부·상점·거래·제작·신원 예외 Queue Adapter |
| 후속 알림 전달 | 앱 알림 Adapter, Discord Adapter |

기능 가용성의 nav·route·action·queue 연결은 서로 교체되는 Implementation이 아니라 같은 결정을 각 surface에 번역하는 Adapter다.

### 12.2 Depth, Leverage, Locality와 deletion test

| Module | 숨기는 복잡성 | 삭제 테스트 |
|---|---|---|
| 회원 신원 | Discord·local·캐릭터·길드 이전·병합·일반/운영 명부 가시성 | 삭제하면 모든 기능이 `discord_id`와 `local:` 분기 및 활성 회원·예외 인원 노출 경계를 다시 알아야 한다. |
| 보급 흐름 | 심사·지급 mode·제작 상태·재고·상환 | 삭제하면 server action이 DB 갱신 순서와 실패 보상을 다시 구현해야 한다. |
| 회원 거래 | 주문·포인트 에스크로·확인 기한·분쟁 | 삭제하면 거래 action과 cron이 포인트 보류·해제 순서와 경쟁 조건을 다시 구현해야 한다. |
| 길드 상점 | 정상·가격 검토 주문·재고 예약·포인트 hold·전달 | 삭제하면 상점 action이 예약과 결제의 원자성 및 업무 분류를 다시 구현해야 한다. |
| 길드 경제 | 환전 hold·외부 지급 claim·금고 입금 배정·포인트 양도 batch·이벤트 특별 보상 확정·공통 원장 | 삭제하면 경제 action이 포인트 예약, 외부 지급, 입금 중복 사용, 즉시 양도와 특별 보상 중복 지급의 경쟁 조건을 다시 구현해야 한다. |
| 자산 장부 | 사이펀 원본 로그·길드별 기록/보관 의미·루팅 품목 pool 회수 검증 | 삭제하면 화면마다 같은 원본을 개인 채무로 볼지, 루팅 입고를 개인 또는 총량 책임으로 볼지 다시 판단해야 한다. |
| 작전 자산 | 안정 빌드·파티 템플릿·전술 실험 상태·이벤트 snapshot·임시 외부 공유 | 삭제하면 재사용 자료와 이벤트 당시 자료의 경계, 미완성 전술의 노출·공유 정책이 화면마다 흩어진다. |
| 기능 가용성 | 상태·의존성·권한·surface 차단 | 삭제하면 route·nav·queue·notification에 같은 조건이 흩어진다. |
| 오늘의 업무함 | queue 목록·count·긴급도·deep link·역할별 홈 우선순위 | 삭제하면 badge·승인 tab·대시보드와 다음 행동 홈이 각자 목록과 우선순위를 유지한다. |
| 운영 변경 기록 | 중요 action allowlist·PII 금지·조회 | 삭제하면 각 action이 기록 schema와 민감정보 기준을 다시 판단한다. |
| 서비스 운영 | 조회·대리 조회·복구 명령·서비스 기록·tenant 영향 연결 | 삭제하면 서비스 운영자가 일반 길드 mutation·raw endpoint·수동 SQL 중 무엇을 써도 되는지 매번 다시 판단해야 한다. |
| 도움말 표면 | 현재 제품 규칙·독자별 표현·권한 deep link·locale 정합성 | 삭제하면 공개 문서·인앱 가이드·도입 체크리스트가 같은 기능을 서로 다르게 설명한다. |

각 Module은 호출부 수보다 내부 규칙이 많아 높은 Depth를 갖는다. 한 규칙 변경이 여러 surface에 반영되는 Leverage를 높이고, 관련 규칙이 한 Module 안에 머무는 Locality를 지킨다. deletion test에서 규칙이 다시 호출부로 퍼지면 그 Module은 실제 경계다.

## 13. 단계별 구현 순서

마이그레이션 번호는 다른 작업과 충돌하지 않도록 구현 시점의 다음 번호를 사용한다. 모든 적용은 사용자의 별도 지시 후 `./scripts/safe-db-push.sh <라벨>`로 수행한다.

### 단계 0 — 기준선과 관측

목표: 데이터 변경 없이 현재 상태를 측정한다.

- 제작 전달·재고 잠재 불일치 보고서
- 길드별 중복 Albion 캐릭터 후보
- 로컬/Discord 중복 회원 후보
- 현재 기능 surface와 설정 매핑
- 기존 queue count 결과 snapshot
- 중요 mutation과 audit coverage matrix

완료 기준:

- 모든 보고서가 `guild_id` 단위로 실행된다.
- 자동 보정은 하지 않는다.
- 이후 단계의 before/after 비교값이 보존된다.

### 단계 1 — 보급 원자성

목표: 가장 치명적인 상태·재고 불일치를 먼저 제거한다.

- `supply_fulfillments`, `guild_inventory_movements`, `domain_outbox`, command idempotency 저장소 추가
- 현재 재고 baseline 생성
- 고위험 RPC가 같은 트랜잭션에서 사용할 최소 운영 변경 기록 append 기반 추가
- 승인·재고 지급·제작 전달 RPC 추가
- 웹·Discord Adapter를 같은 Supply Interface로 연결
- 기존 best-effort 재고 차감 제거
- 작업 수락 전 고정 정산 조건 표시·수락과 박스 입고 시 자동 정산 확정 추가
- 신규 작업의 납품 시 재료비 입력과 건별 정산 승인·거절 흐름 제거
- 전환 시점 이전의 기존 정산 승인 대기 건은 자동 승인하지 않고 기존 운영 흐름으로 해소
- 수령 확인 지연 전환·자동 알림·명시적 박스 해제 command 추가
- 미수령 회수 종료의 재고 복구·박스 해제·지급 종결·업무 제거를 한 트랜잭션으로 처리
- 기존 `expired` 자동 박스 해제 제거
- `supply_attention` 탐지 추가

완료 기준:

- 전달 완료와 재고 projection이 분리 commit될 수 없다.
- 같은 명령을 10번 보내도 movement와 지급은 한 번이다.
- 직접 재고 출고의 부족은 전체 rollback되고, 제작 박스 입고의 부족분은 재고 외 조달로 정확히 기록된다.
- 제작 박스 입고는 완제품 장부 재고를 음수로 만들지 않는다.
- 제작자가 본 고정 정산 조건과 박스 입고 때 기록된 지급 예정액이 항상 일치한다.
- 동일 박스 입고 command를 재시도해도 제작자 지급 예정액은 한 번만 기록된다.
- 확인 기한이 지나도 수령·미수령 회수 종료·이동 확인 전에는 박스가 해제되지 않는다.
- 미수령 회수 종료는 승인·정산 이력을 보존하면서 현재 지급 건을 끝내고 후속 재지급 업무를 만들지 않는다.
- 알림 장애가 보급 상태를 되돌리지 않으며 outbox에서 재시도된다.

### 단계 1A — 회원 거래 에스크로 종결

목표: 전달 완료 뒤 구매자 무응답으로 포인트가 영구 보류되는 상태를 제거한다.

- 회원 거래 주문에 `confirmation_due_at`, `auto_released_at` 추가
- 판매자 전달 완료 시 72시간 기한 고정과 구매자 알림 outbox 생성
- 구매자 수령 확인·분쟁 제기와 scheduler 자동 지급을 동일한 잠금·idempotency 규칙으로 처리
- 분쟁 업무에 전액 지급·전액 환불 command와 필수 운영 사유 연결
- 기존 `delivered` 주문은 배포 시 즉시 지급하지 않고 전환 시점부터 새 72시간 기한을 부여해 구매자에게 알림
- 기존 `disputed` 주문은 자동 변경 없이 운영진 처리 대상으로 유지

완료 기준:

- 정상 `delivered` 주문은 구매자 확인 또는 72시간 무응답 자동 지급으로 종결된다.
- `disputed` 주문은 scheduler가 절대 지급하거나 환불하지 않는다.
- 포인트 원장·에스크로·주문·거래 사건·운영 변경 기록이 분리 commit되지 않는다.
- 같은 자동 지급 작업을 반복 실행해도 포인트는 한 번만 이동한다.

### 단계 1B — 길드 상점 자동 접수

목표: 정상 주문의 중복 승인 업무와 포인트 초과 약속을 제거한다.

- 표준 카탈로그 주문을 `ready_for_fulfillment`, 예외 주문을 `pending_review`로 분리
- 주문 생성 시 재고와 포인트 hold를 함께 만드는 원자적 RPC 추가
- 일반 주문의 관리자 승인·거절 흐름과 알림 제거
- 즉시 금액 변경·차감이 가능한 `p_total_points_override`를 최종 가격 제안 command로 교체
- 최종 가격이 신청 금액 이하이면 자동 준비 전환, 인상이면 48시간 회원 재확인 상태로 전환
- 회원 수락 시 차액 hold를 원자적으로 추가하고 거절·무응답 시 모든 예약을 해제하는 command와 scheduler 추가
- 운영진의 물품 준비 queue와 전달 완료 command 추가
- 전달 완료 시 point hold를 `shop_purchase` 차감으로 전환
- 취소·거절 시 재고와 point hold를 함께 복구
- 기존 `pending` 주문은 `price_review_required`에 따라 두 상태로 backfill하되 기존 재고 예약을 다시 차감하지 않음

완료 기준:

- 일반 주문은 관리자 승인 없이 즉시 물품 준비 queue에 나타난다.
- 여러 주문·회원 거래·환전이 동시에 발생해도 같은 포인트를 중복 예약할 수 없다.
- 주문 생성, 재고 예약, 포인트 hold 중 하나만 남는 부분 성공이 없다.
- 회원이 확인하지 않은 인상 금액은 차감되지 않는다.
- 같은 금액·가격 인하는 운영진 재처리 없이 물품 준비로 넘어가고, 가격 인상은 회원 수락 뒤에만 차액이 예약된다.
- 가격 재확인 거절·48시간 무응답은 재고와 포인트 예약을 모두 복구한다.
- 전달 완료와 포인트 차감이 분리 commit되지 않는다.
- 취소·거절 재시도를 반복해도 재고와 포인트가 한 번만 복구된다.

### 단계 1C — 환전 자동 접수와 지급 이행

목표: 환전 심사 업무를 없애고 포인트 사용과 인게임 지급의 불일치를 막는다.

- 공통 point hold에 환전 보류 유형 추가
- 신청 시 포인트 hold와 `awaiting_payout`을 함께 만드는 원자적 command 추가
- 운영진 승인·거절 UI를 지급 대기·지급 처리 시작·지급 완료 UI로 교체
- `claimExchangePayout`, `releaseExchangePayoutClaim`, `markExchangePaid` command 추가
- 회원 수정·취소 시 hold 조정·해제
- `approved` 표시와 알림을 `paid`/지급 완료 용어로 교체
- 기존 `pending`은 포인트 hold 성공 시 `awaiting_payout`으로 이관하고, 잔액이 부족하면 사유를 알린 뒤 취소
- 기존 `approved`·`rejected` 기록은 과거 결과로 그대로 보존

완료 기준:

- 정상 환전은 운영진 승인 없이 즉시 지급 대기 업무에 나타난다.
- 지급 완료 전에는 포인트가 다른 상점·회원 거래·환전에 중복 사용되지 않는다.
- 지급 처리 중에는 회원 취소와 다른 운영진의 중복 처리가 불가능하다.
- 지급 완료와 `exchange_paid` 차감이 분리 commit되지 않는다.
- claim·완료 재시도에도 지급 완료와 포인트 차감은 한 번만 생긴다.

### 단계 1D — 금고 입금 원본 기반 포인트 적립

목표: 입금 용도를 추정하지 않으면서 정상 적립의 운영진 심사를 제거한다.

- tenant별 금고 실버 입금 원본과 dedupe fingerprint 저장
- 원본별 단일 용도를 보장하는 입금 allocation 추가
- 회원의 미배정 입금 목록과 `포인트 적립용으로 지정` command 추가
- 정상 지정 시 allocation과 `donation_approved` 포인트 가산을 한 트랜잭션으로 처리
- 현재 스크린샷·금액 입력은 원본 누락·불일치 예외 접수로 축소
- 운영진 승인 queue를 `deposit_match_exception` queue로 교체
- 기존 `pending`은 입금자·금액·시각 기준으로 유일한 미배정 원본이 확인될 때만 자동 연결하고 나머지는 예외로 유지
- 기존 `approved`·`rejected`와 스크린샷은 과거 근거로 보존

완료 기준:

- 용도 지정이 없는 금고 입금은 포인트를 만들지 않는다.
- 정확한 원본을 선택한 정상 적립은 운영진 승인 없이 완료된다.
- 한 원본 입금으로 포인트가 두 번 적립되거나 다른 지원 용도와 중복 배정될 수 없다.
- 스크린샷만 있는 신청은 자동 적립되지 않는다.
- 원본 allocation과 포인트 가산이 분리 commit되지 않는다.

### 단계 1E — 포인트 양도 경계와 재시도 안전성

목표: 즉시 양도를 회원 거래와 구분하고 동일 요청의 중복 차감을 막는다.

- `point_transfer_batches`와 command idempotency key 추가
- 송신자·수신자·금액·메모 snapshot과 원장 쌍을 같은 트랜잭션으로 생성
- 확인 화면에 즉시 확정·취소 불가·거래 보호 없음 안내
- 회원 거래 대금은 회원 거래장 사용 안내
- 예외 정정은 원본 batch를 참조하는 별도 관리자 조정으로 기록
- 수신자 조회와 RPC를 안정적인 길드 회원 기록 기준으로 전환

완료 기준:

- 같은 양도 요청을 반복 전송해도 batch와 원장 이동은 한 번만 생긴다.
- 여러 수신자 중 하나라도 유효하지 않거나 총 사용 가능 포인트가 부족하면 전체가 실패한다.
- 완료된 양도는 승인·수령·분쟁 queue를 만들지 않는다.
- 양도 금액은 길드 재정 수입·지출로 집계되지 않는다.
- 원래 양도와 예외 정정 이력이 모두 보존된다.

### 단계 1F — 이벤트 특별 보상 단일 확정

목표: 특별 보상의 형식적 자기 승인을 없애고 권한·최종 확인·원장 신뢰성을 강화한다.

- 일반 이벤트 관리와 분리된 특별 보상 지급 capability 추가
- 요청 생성·승인 RPC를 지급 확정 command 하나로 교체
- 종료 이벤트에서 참가자 일부·전부 선택, 한 건의 공통 지급 금액, 대상·금액 snapshot, 필수 지급 사유, 총액의 강한 최종 확인 UI 추가
- grant·대상별 포인트 원장·운영 변경 기록·알림 outbox를 한 트랜잭션으로 생성
- command idempotency key와 grant 단위 중복 방지 추가
- 전환 당시 기존 `pending` 요청은 자동 지급하지 않고 기존 운영 흐름으로 한 번 종결
- 기존 `approved`·`rejected`는 과거 결과로 그대로 보존
- legacy `pending`이 모두 종결된 뒤 `event_payout_review` queue와 승인 알림 제거
- 오지급 정정은 원본 grant를 참조하는 별도 관리자 조정으로만 처리

완료 기준:

- 특별 보상은 전용 권한을 가진 운영진의 한 번의 최종 확인으로만 지급된다.
- 이벤트 종료나 참가만으로 자동 지급되지 않는다.
- 한 grant의 모든 대상에게 같은 금액이 적용되고 차등 금액은 별도 grant로 구분된다.
- 동일 command 재시도에도 grant와 대상별 포인트 가산은 한 번만 생성된다.
- 대상별 지급 중 일부만 성공하는 상태가 존재하지 않는다.
- 신규 특별 보상은 승인·거절 queue를 만들지 않는다.
- 원본 지급과 예외 정정 이력이 모두 보존된다.

### 단계 1G — 사이펀 기록과 보관 의미 분리

목표: 같은 사이펀 로그를 사용하는 길드마다 기록 확인과 개인 보관 장부의 의미를 정확히 선택하게 한다.

- `asset_accounting.siphon_policy`에 `record`, `custody` 추가
- 원본 입출금·중복 제거·운영 시작 시각은 두 정책에서 공통 사용
- 기록 모드의 `순입출금`과 보관 장부 모드의 `보관 잔량` 라벨·설명·주의 상태 분리
- 보관 장부 모드의 음수는 반환 확인 대상으로 표시하되 자동 제재·기능 차단은 금지
- 신규 길드는 `record` 기본값, 기존 길드는 현재 의미 보존을 위해 `custody` backfill
- 정책 변경 시 원본·합계 불변 검증과 운영 변경 기록 추가

완료 기준:

- 기록 모드에서 음수 순입출금이 채무·초과 출금으로 표시되거나 업무를 만들지 않는다.
- 보관 장부 모드에서 양수와 음수의 운영 의미가 회원과 운영진 화면에 동일하게 표시된다.
- 정책을 반복 전환해도 원본 로그와 입출금 합계가 변하지 않는다.
- 로그 반영 지연만으로 자동 제재·권한 제한·다른 기능 차단이 발생하지 않는다.

### 단계 1H — 루팅 총량 책임 고정

목표: 회수 부족을 찾되 개인 루팅 기록만으로 미반납 책임을 확정하지 않는다.

- 감사 대상의 품목별 루팅 총량과 금고 입고 총량을 공식 판정 기준으로 고정
- 루팅자·입금자가 달라도 같은 품목 pool에서 회수 처리
- 부족분은 이벤트·품목 단위 `미회수 의심 항목`으로 저장
- 개인별 루팅·입고 행은 조사 근거로 연결하고 자동 채무·벌점·권한 제한 금지
- 해결·오탐 종결 시 원본 로그와 최초 부족분을 보존

완료 기준:

- A가 루팅하고 B가 전량 대신 입고한 품목은 미회수로 남지 않는다.
- 품목 총량이 부족할 때만 하나의 이벤트 수준 의심 항목이 생긴다.
- 개인 이름만으로 미반납 확정이나 자동 제재가 발생하지 않는다.
- 종결 후에도 원본 루팅·입고·최초 부족분과 처리 주체를 확인할 수 있다.

### 단계 1I — 전술 실험 기능 격리

목표: 미완성 전술을 완성 기능처럼 약속하지 않으면서 선택한 길드의 제한된 작성·공유는 안전하게 유지한다.

- 안정적인 빌드·파티 템플릿과 별도 `tactics` feature state 추가
- 신규 길드 기본 disabled, 기존 전술 데이터가 있는 길드만 enabled backfill
- 내비게이션·직접 route·이벤트 연결·공유 action을 같은 feature guard로 연결
- `ZvZ 교육`·핵심 마케팅 표현을 실험 기능·길드 작성 자료 표현으로 교체
- 전술 공유 링크에 필수 만료, 기본 7일, 링크별 폐기 command 추가
- 공유 route를 noindex·읽기 전용으로 고정
- 기존 무기한 활성 링크는 운영진에게 알리고 유예기간 뒤 만료하거나 명시적으로 재발급
- 이벤트 전술 immutable snapshot 규칙은 유지

완료 기준:

- 전술을 켜지 않은 길드에는 nav·route·action·이벤트 연결이 모두 노출되지 않는다.
- 전술을 켜도 제품이 전술의 정확성을 추천·보증한다고 표현하지 않는다.
- 전술 내용 없이도 제품이 자동 추천·판정을 시도하지 않고 콜러 작성 내용을 그대로 전달한다.
- 외부 공유 링크는 만료·폐기 후 열리지 않고 편집 권한을 제공하지 않는다.
- 원본 전술 수정·보관 뒤에도 이미 시작한 이벤트의 snapshot은 변하지 않는다.
- 빌드·파티 템플릿은 전술 기능을 끈 길드에서도 정상 사용된다.

### 단계 1J — 승인 빌드와 이벤트 확정본 경계

목표: 재사용 템플릿 수정이 이미 배정된 장비와 리기어 기준을 바꾸지 않게 한다.

- 고정 장비·허용 대안·무기별 조건부 조합·스킬·tier/enchant 기준을 승인 범위로 검증
- 참가자의 실제 선택과 운영진 예외를 이벤트 빌드 확정본으로 저장
- 범위 밖 선택은 거부하고 운영진의 명시적 이벤트 슬롯 수정만 허용
- 템플릿 수정·덮어쓰기·삭제와 기존 이벤트 확정본 분리
- 이벤트 시작 뒤 자동 재적용 차단
- 리기어 snapshot 생성 시 이벤트 빌드 확정본 참조

완료 기준:

- 참가자는 승인 빌드 템플릿의 허용 조합 밖 장비를 직접 확정할 수 없다.
- 템플릿 변경 전후 기존 이벤트 확정본과 리기어 기준이 변하지 않는다.
- 운영진 예외는 해당 이벤트에만 적용되고 재사용 템플릿을 암묵적으로 수정하지 않는다.
- 리기어가 손실 당시 실제 확정 장비가 아닌 최신 템플릿으로 계산되는 경우가 없다.

### 단계 1K — Menhera 전용 콘텐츠 준수 격리와 최근 영상 환전 자격

목표: Menhera를 위해 만든 참여·영상 운영 규칙을 다른 길드의 제품 경험에서 격리하고, 의도한 최근 영상 조건만 새 포인트→실버 환전에 정확히 적용한다.

- migration 288의 전 길드 backfill과 신규 tenant 자동 활성화로 생성된 비-Menhera 설정·정책·제출·환전 제한 이력을 길드별로 읽기 전용 감사
- 일반 고객 기능 catalog·최초 설정·마케팅·공개 문서에서 `content_compliance` 제거
- 흩어진 tenant slug 분기 대신 명시적인 Menhera 확장 entitlement와 단일 resolver 도입
- 같은 resolver를 내비게이션·직접 경로·action·RPC·알림·cron·최근 영상 환전 guard에 적용
- 비-Menhera 데이터의 보존·격리 방침을 확정한 뒤 전 길드 backfill과 신규 tenant 자동 활성화 trigger 제거
- Menhera 안에서는 참여 원본·수동 보정·영상 제출·검토 이력을 관찰형 콘텐츠 준수 상태에 연결
- 참여 미달·영상 의무 미충족 결과를 읽어 전투 참가·리기어·포인트 적립·사용·양도·권한을 자동 제한하는 경로 금지
- 새 포인트→실버 환전 신청에만 최근 5일 유효 영상 제출을 직접 요구
- 유효한 YouTube 영상 제출 저장 성공 즉시 운영진 승인 없이 환전 자격 부여
- 5일 경과 또는 제출 무효화 때 남아 있는 최근 유효 제출 전체를 기준으로 자격 재계산
- 기존 접수 환전은 사후 차단하지 않고 이후 새 신청에만 현재 자격 적용
- 수동 참여 보정과 제출 무효화에 전용 capability, 사유, 운영 변경 기록 적용
- Menhera 회원 화면에는 현재 준수 상태·계산 기간·근거, 최근 영상 환전 자격의 만료 시각과 직접 가능한 제출 행동을 분리해 표시

완료 기준:

- 비-Menhera 길드는 콘텐츠 준수 기능을 보거나 설정할 수 없고 최근 영상 유무와 관계없이 자체 환전 정책만 적용받는다.
- Menhera의 운영진·회원 화면, 직접 경로, action과 RPC가 같은 확장 entitlement를 따른다.
- 참여 기록 누락이나 영상 의무 미충족만으로 전투 참가·리기어·포인트 적립·사용·양도·권한이 바뀌지 않는다.
- 유효 영상 제출 성공 즉시 승인 없이 새 환전이 가능하고 제출 시각부터 5일이 지나면 다른 최근 유효 제출이 없는 경우에만 다시 제한된다.
- 제출 무효화 뒤 남은 최근 유효 제출로 자격이 재계산되고 이미 접수된 환전 신청은 바뀌지 않는다.
- 운영진의 수동 참여 보정과 제출 무효화 뒤 원본, 사유, 변경 주체를 확인할 수 있다.
- 비-Menhera 잔존 데이터를 안전하게 확인·처리한 뒤 전 길드 설정 backfill과 신규 tenant 자동 활성화가 제거된다.

### 단계 1L — 공개 프로필의 안전한 기본 노출

목표: 공개 프로필의 홍보 효용은 유지하면서 프로필 활성화가 개인·경제 정보의 묵시적 공개가 되지 않게 한다.

- 프로필 전체 활성화와 섹션별 공개 설정을 분리
- 프로필 공개 여부와 길드 모집 상태를 분리하고 `closed`에서도 활성 페이지·공유 URL 유지
- `open`·`selective`이고 초대 대상 서버가 봇 설치 서버와 일치하는 Discord 가입 경로에만 CTA 노출
- 일반 온보딩에는 대표권 인증을 추가하지 않고 중복 홈 길드 연결·신빙성 있는 사칭 신고만 분쟁 workflow로 전환
- 대표권 분쟁 `under_review` 동안 공개 프로필·가입 CTA만 중단하고 내부 tenant 데이터와 의무는 보존
- 분쟁 종결은 홈 길드 연결만 유지·해제·재지정하고 워크스페이스 간 데이터 이전을 금지
- 실제 검증 체계가 없는 상태에서 공식 인증 배지를 표시하지 않음
- 앱 내 길드 지원서·지원자 queue 없이 Discord 가입 경로로 handoff
- 페이지 정보 계층을 길드 정체성·모집 정보·가입 경로·보조 공개 통계 순으로 정리
- 길드명·소개·모집 정보와 비식별 길드 집계를 안전한 기본 공개군으로 정의
- 운영진 명단·개인 리더보드·개인 기여자 섹션의 기본값을 비공개로 변경
- 리기어 등 내부 경제 집계의 기본값을 비공개로 유지
- 내부 원장·잔액·신청·정산·권한·운영 변경 기록은 공개 설정 대상에서 제외
- 기존 길드의 저장되지 않은 개인 식별 섹션 기본값은 비공개로 전환하고 운영진에게 재선택 안내
- 활성화·섹션 공개·비공개 전환마다 공개 미리보기와 운영 변경 기록 제공
- 공개 OFF 시 noindex와 비공개 응답을 동일한 feature state에서 강제
- 봇 초대 직후 자동 공개된다는 데모·마케팅 문구를 명시적 활성화 절차로 교체

완료 기준:

- 신규 길드가 공개 프로필을 켜도 사람 이름과 내부 경제 통계가 추가 선택 없이 노출되지 않는다.
- 모집 마감은 공개 프로필을 숨기지 않고 가입 CTA와 모집 세부 정보만 제거한다.
- 모집 중 CTA는 유효한 Discord 가입 경로로만 연결되고 앱 내부 지원 업무를 만들지 않는다.
- 정상 신규 길드는 인게임 코드·영상·서비스 운영자 승인 없이 홈 길드를 연결하고 운영을 시작한다.
- 중복 연결이나 확인된 사칭 분쟁 중에는 공개 프로필과 가입 CTA가 노출되지 않으며 내부 기록은 손실되지 않는다.
- 분쟁 재지정 뒤 이전 워크스페이스의 동기화는 중단되고 어느 내부 데이터도 새 워크스페이스로 이동하지 않는다.
- 비식별 길드 집계는 별도 섹션 설정 없이도 모집·홍보 페이지에 표시된다.
- 운영진이 선택한 인물·경제 섹션만 공개 페이지와 SEO·Discord 미리보기에 반영된다.
- 내부 원장·잔액·신청·정산·권한·운영 변경 기록은 어떤 공개 토글 조합에서도 노출되지 않는다.
- 공개 OFF 또는 섹션 OFF 뒤 캐시된 페이지에서도 해당 정보가 반환되지 않는다.
- 제품·데모·마케팅 어디에서도 운영진 동의 전 공개를 약속하지 않는다.

### 단계 1M — 이벤트 유효 리기어 정책 단일화

목표: 다양한 리기어 설정의 유연성은 유지하되 같은 이벤트의 참가자에게는 예측 가능한 최종 기준 하나만 적용한다.

- 사용자 표면의 "역할 보상"을 "역할별 리기어 정책"으로 교체
- 길드 기본·역할·Discord 역할·이벤트·영상 입력을 해석하는 단일 resolver와 출처 설명 정의
- 모집 중 참가자별 유효 정책 미리보기와 정책 변경 전·후 diff 제공
- 이벤트 시작 command에서 참가자·역할별 정책 snapshot을 원자적으로 고정
- 시작 뒤 운영진 예외 참가자는 이벤트 시작 정책 버전으로 snapshot 생성
- 수동·자동·제작 리기어가 같은 이벤트 snapshot을 사용하도록 read path 통합
- 신청 생성 시점의 전역 설정 재해석 제거
- 자유 리기어 창구는 창구 생성 시 별도 유효 정책 snapshot을 고정
- 리기어 통계 query에 `event/free_window/auto` 출처 분류와 필터 추가
- 자유 리기어는 전체 리기어 신청·승인·지급액에 포함하되 참가율·참여 보상·이벤트 성과 query에서는 제외
- 창구별 통계 포함 토글은 만들지 않고 공개 노출은 기존 공개 프로필의 리기어 통계 섹션 opt-in만 적용
- 기존 진행·종료 이벤트와 기존 신청은 저장된 request snapshot을 보존하고 신규 이벤트부터 단계적으로 전환

완료 기준:

- 길드원은 이벤트마다 자신의 허용 여부·상한·지급률·횟수·영상 조건 하나만 확인한다.
- 같은 이벤트·같은 시작 정책의 참가자가 신청 시각 차이로 다른 리기어 기준을 받지 않는다.
- 이벤트 시작 뒤 전역·역할·Discord·영상 설정을 바꿔도 기존 이벤트 snapshot과 지급액이 변하지 않는다.
- 수동·자동·제작 리기어가 동일한 유효 정책 snapshot을 사용한다.
- 운영진은 최종 정책의 입력 출처를 확인할 수 있지만 길드원은 우선순위를 계산하지 않아도 된다.
- 자유 리기어 창구 변경이 이벤트 리기어 정책에 영향을 주지 않는다.
- 자유 리기어의 신청·승인·지급액은 전체 리기어 통계와 `free_window` 필터에서 일치하고 이벤트 참가 수는 바꾸지 않는다.

### 단계 1N — 참가 예외 수정형 일괄 마감

목표: 사이트가 출석을 과신하지 않으면서 운영진이 전원 수동 체크 없이 정확한 참여 보상을 확정하게 한다.

- 참가예정을 약한 가용성 신호로 고정하고 확정 배정·참가 확정 명단과 DTO·상태·문구 분리
- `cleanup_tentative_on_slot_fill`에서 승인 대기 신청 삭제를 제거하고 확정 배정 때만 참가예정 종료
- 회원의 웹·Discord 참가예정 command에 모집 중 상태 guard를 공통 적용
- 운영 기준 시작 시 미배정 참가예정을 읽기 전용 이벤트 snapshot에 포함하고 후속 쓰기 차단
- 참가예정 행을 참가율·성과·참여 보상·리기어와 참가 일괄 마감의 기본 후보 query에서 제외
- 종료 이벤트의 슬롯 배정자를 기본 선택한 참가 후보로 구성
- 확인 가능한 활동과 후보가 다른 인원만 불일치 그룹으로 강조
- 노쇼 제외와 미배정 현장 참가자 추가를 같은 화면에서 처리
- 참가 명단·공통 보상 금액·총액·확정자를 마지막 확인 화면에 함께 표시
- 참가 확정 명단·대상별 원장·운영 변경 기록·알림 outbox를 단일 command로 생성
- command idempotency key와 이벤트별 마감 중복 방지 추가
- 신규 참여 보상에서 요청 생성·별도 승인 queue 제거
- 기존 `event_payout_requests.pending`은 자동 지급하지 않고 기존 승인·거절 흐름으로 한 번 종결
- 기존 승인·거절 지급 이력은 과거 원장으로 보존

완료 기준:

- 승인 대기 신청·거절·취소는 참가예정을 없애지 않고 확정 배정만 현재 신호를 종료한다.
- 운영 기준 시작 뒤 회원은 참가예정을 등록·수정·취소할 수 없으며 남은 의향은 출석·노쇼로 바뀌지 않는다.
- 참가예정만 남긴 회원에게 참여 보상·리기어 자격이 생기거나 참가율·성과 통계가 변하지 않는다.
- 운영진은 기본 후보 전체를 다시 체크하지 않고 예외만 수정해 마감할 수 있다.
- 사이트의 참가 근거만으로 보상 원장이 자동 생성되지 않는다.
- 한 이벤트 참가 마감의 모든 대상 원장이 함께 성공하거나 함께 실패한다.
- 같은 마감 command를 재전송해도 명단과 포인트 지급은 한 번만 생성된다.
- 신규 참여 보상은 생성 후 다시 승인하는 업무를 만들지 않는다.
- 확정 뒤에도 후보 근거, 최종 명단, 제외·추가 내역, 금액과 확정자를 확인할 수 있다.

### 단계 1O — 동일 길드 복구 경계

목표: 최소 복구 범위만 보존하면서 다른 길드 복사, 잔액·예약 불일치와 부분 적용 사고를 막는다.

- 도메인별 현재 잔액·재고·예약·열린 의무와 필요한 참조를 복구 필수 상태 manifest로 명시
- 일반 설정·권한·재사용 템플릿·미래 이벤트·종결 이력·통계·캐시를 복구 payload에서 제외
- 백업 manifest에 source workspace·논리 길드 ID·schema version·무결성 정보 추가
- preview와 apply 양쪽에서 동일 길드 검증을 강제
- 포인트·템플릿·재고를 순차 적용하는 현재 방식을 잔액·hold·에스크로·재고·예약·열린 의무 단위의 단일 복원 transaction/job으로 교체
- 서버 측 복원 전 안전 snapshot과 복원 영수증 생성
- 실패 시 모든 변경 rollback, 성공 시 diff·주체·원본 백업 ID 보존
- 다른 길드 가져오기를 거부하고 템플릿 패키지 내보내기·가져오기를 별도 제공
- 포인트·재고·회원·원장 데이터를 템플릿 패키지 schema에서 허용하지 않음
- Discord 서버 이전은 별도 서비스 운영 절차와 권한으로 분리
- 실제 포함 범위와 UI·가이드·마케팅의 "전체 백업" 표현 일치

완료 기준:

- 다른 길드에서 만든 복구 백업은 preview와 apply 모두에서 어떤 데이터도 바꾸지 않는다.
- 잔액·재고는 연결된 hold·에스크로·예약·열린 의무 없이 따로 백업하거나 복원할 수 없다.
- 복원 중 한 영역이 실패하면 복구 필수 상태에 부분 변경이 남지 않는다.
- 완료 이력·일반 설정·재사용 템플릿·통계·캐시는 복구 파일에 포함되지 않는다.
- 안전 snapshot을 서버에서 만들지 못하면 복원을 시작하지 않는다.
- 복원 성공 뒤 적용 전·후 차이, 원본 길드, 실행자와 시각을 확인할 수 있다.
- 템플릿 패키지로 다른 길드에 재정·회원 데이터가 이동하지 않는다.
- 백업 화면과 마케팅은 실제 복구 가능한 범위를 과장하지 않는다.

### 단계 1P — Discord 역할 권한 통합

목표: 운영진을 앱에서 중복 관리하지 않고 Discord 역할 변경이 앱의 세부 권한에 일관되게 반영되도록 한다.

- 기존 관리자·이벤트 생성자·밤스쿼드 콜러 역할 설정을 역할→capability 연결로 이관
- Discord 역할 ID 직접 입력을 역할 선택 UI로 교체하고 역할별 권한 묶음·영향 인원 미리보기 제공
- 역할 변경 확인 시 세션 권한 재계산과 고위험 command 재검증
- 개인 override를 사유·만료가 있는 긴급 예외로 제한하고 자동 회수
- 로컬 길드 계정의 운영 capability 부여 차단

완료 기준:

- 일반 운영진 권한은 Discord 역할 연결만으로 부여·회수할 수 있다.
- 같은 의미의 역할 설정과 granular grant가 서로 다른 결과를 만들지 않는다.
- Discord 역할을 잃은 사용자가 오래된 웹 세션으로 고위험 작업을 계속할 수 없다.
- 만료 없는 개인 권한 예외와 운영 capability를 가진 로컬 길드 계정이 존재하지 않는다.
- 역할 연결 변경의 실행자·전후 capability·영향 대상을 확인할 수 있다.

### 단계 1Q — 통계 표면의 목적 분리

목표: 길드원 경쟁·운영 분석·Menhera 콘텐츠 준수 판단을 하나의 회원 평가 점수로 섞지 않는다.

- 회원용 화면과 용어를 길드원 성취 리더보드로 정리하고 지표별 기간·모집단·최소 표본 설명 추가
- 하위 순위·미달자 명단·단일 종합 점수 제거
- 회원 명부·회원 상세·공개 활동·길드 통계의 `weapon` DTO를 계획된 슬롯 무기와 관측된 실제 무기로 분리
- 무기 사용 통계는 관측된 실제 장비만 사용하고, 무기군 정규화와 회원·무기군·전투별 1회 집계를 공통 resolver로 통합
- 슬롯 배정만 있고 실제 장비 관측이 없는 참가를 무기 사용 횟수로 보완하지 않으며 데이터 없음과 표본 수를 표시
- 개인 화면은 자주 사용한 무기군, 길드 화면은 기간이 명시된 조합 분포로 구성하고 숙련도·실력 순위 표현 제거
- 무기 사용 통계를 포인트·보상·리기어·권한·참가 자격·자동 편성으로 소비하는 application path 금지
- 현재 통계에서 배지를 즉석 계산하는 방식을 획득 시각·배지 정의 버전·근거를 가진 idempotent 성취 배지 기록으로 전환
- 획득 뒤 집계 정정·기준 변경·탈퇴와 같은 길드 재가입이 배지를 자동 회수하지 않도록 보존
- 성취 배지 결과를 읽어 포인트·실버·리기어·기능 접근·권한·Menhera 콘텐츠 준수 상태를 바꾸는 경로 금지
- 전투 집계의 공식 판정 결과와 참가자 집합을 소비하는 팀 전투 위업 evaluator를 두고 별도의 승패·규모 판정 로직을 복제하지 않음
- 같은 전투의 팀 위업을 확인된 참가자 모두에게 동일한 근거 ID로 중복 없이 fan-out
- 기존 개인 `win` 배지 계열은 팀 전투 위업으로 재분류하고 킬·생존 계열은 한계가 표시된 개인 보조 트랙으로 분리
- 모호하거나 공식 집계에서 제외된 전투의 위업 생성 차단
- 개인 전투 위업은 직접 관측 가능한 사실만 허용하고 역할 간 공통 실력 등급·MVP와 힐·클렌즈·클럼프 추정 지표 금지
- 운영진 통계를 경제·참여·상점·보급의 추세·예외 중심으로 재구성
- 리더보드·운영 통계 결과를 읽어 자동 제재·권한 회수·보상 삭감을 실행하는 경로 금지
- Menhera 콘텐츠 준수와 insights의 기능 상태·권한·화면을 분리

완료 기준:

- 길드원은 어떤 지표에서도 자신이 운영진 평가 점수를 받고 있다고 오해하지 않는다.
- 슬롯에 배정된 무기와 실제 전투에서 관측된 무기가 다르면 무기 사용 통계는 실제 관측값만 집계하고 계획된 편성은 별도로 보인다.
- 개인·길드·공개 표면의 무기 수치는 같은 기간·전투 포함 규칙·무기군 정규화를 사용하며 사용 빈도를 숙련도나 실력으로 표현하지 않는다.
- 한 번 획득한 성취 배지는 이후 통계·기준 변화에도 같은 길드 회원 기록에 남고 경제·보급·권한 결과를 만들지 않는다.
- 판정 가능한 공동 전투 성과는 확인된 참가자 모두에게 같은 팀 전투 위업으로 남고 특정 개인의 MVP로 바뀌지 않는다.
- 개인 전투 위업은 객관적 근거와 지표 한계를 보여주며 다른 역할의 전투 실력과 비교되지 않는다.
- 운영진은 순위 화면이 아니라 운영 질문별 통계에서 추세와 예외를 확인한다.
- 같은 데이터라도 리더보드 순위가 Menhera 콘텐츠 준수 상태나 자동 조치를 바꾸지 않는다.
- 개인 리더보드는 별도 공개 선택 없이는 공개 프로필에 나타나지 않는다.

### 단계 1R — Discord 빠른 실행 표준화

목표: 일상적인 단건 업무는 Discord에서 끝내되 웹과 다른 규칙, 확인 없는 고위험 변경과 중복 실행을 만들지 않는다.

- Discord 명령과 웹 action을 공통 application command로 연결
- 읽기·단순 단건 행동과 웹 심화 처리 대상의 채널 catalog 작성
- 포인트 양도·상점 주문·제작 납품·이벤트 시작에 ephemeral 최종 요약·만료 확인 버튼 적용
- Discord interaction과 확인 token에서 안정적인 idempotency key 생성
- 완료 응답에 최신 상태·실행 결과·상세 웹 링크 제공

완료 기준:

- 지원되는 일상 단건 업무는 웹을 열지 않고 Discord에서 완료된다.
- 같은 업무를 웹과 Discord에서 실행해도 권한·검증·상태 전이·원장 결과가 같다.
- 확인 버튼의 중복 클릭과 Discord 재전송이 mutation을 두 번 만들지 않는다.
- 금전·재고·이벤트 상태를 바꾸는 명령이 최종 요약 확인 없이 실행되지 않는다.
- 구성·대량 작업·분쟁·복합 예외는 충분한 문맥을 가진 웹 화면으로 연결된다.

### 단계 1S — 회원 상세 정보 최소 공개

목표: 현재 활성 회원을 찾는 일반 명부와 예외 인원을 관리하는 운영진 명부를 분리하고, 길드 내부 활동 공유가 개인 경제·신청 증빙·운영 관리 정보의 공통 공개로 이어지지 않게 한다.

- `/members` 기본 표면을 현재 활성 회원용 **길드원 내부 명부**로 제한
- 게스트·탈퇴 회원·사이트 미연결 인게임 인원·신원 문제·관리 작업을 별도 **회원 운영 명부**로 이동
- 명부 목록과 상세에 공통으로 사용하는 안전한 활동 프로필 DTO와 회원 상태 resolver 추가
- 회원 상세 query와 DTO를 활동 프로필·본인 셀프서비스·업무별 운영 정보로 분리
- `MEMBERS_VIEW`에서 포인트·리기어·영상·준수·운영 메모와 폐기 전 잔존 체험·부재 정보 제거
- 재정·리기어·Menhera 콘텐츠 준수·회원 관리별 상세 조회 capability 적용
- 운영 통계 집계 권한과 개인 상세 권한 분리
- Discord 회원 상세·Albion 인게임 상세·검색·직접 URL에 동일한 tenant·membership·capability 검사 적용
- 회원 공개 활동 요약 DTO의 비공개 운영 정보·정확한 작전 타임라인 부재를 계약 테스트로 고정

완료 기준:

- 일반 명부에는 현재 활성 회원만 나타나며 게스트·탈퇴 회원·사이트 미연결 인게임 인원·신원 문제가 섞이지 않는다.
- 운영진은 별도 회원 운영 명부에서 예외 인원과 필요한 관리 작업을 확인한다.
- 일반 회원 상세 조회자는 다른 회원의 잔액·원장·리기어·영상·준수·운영 정보를 받을 수 없다.
- 본인은 자신의 전체 셀프서비스 정보를 계속 확인할 수 있다.
- 운영진은 자신이 맡은 업무 범위의 상세 정보만 확인한다.
- 권한 없는 필드는 HTML뿐 아니라 RSC payload·server action 응답에도 존재하지 않는다.
- 통계 집계 조회나 공개 활동 opt-in이 개인 운영 상세 열람 권한을 만들지 않는다.

### 단계 1T — 상용화 상태의 사실성

목표: 향후 유료화 의도는 명확히 하되 결정되지 않은 시점·가격·포함 기능을 제품이 약속하지 않게 한다.

- 현재 상태를 종료일 없는 무료 베타로 고정하고 결제·entitlement 미적용 보장
- 길드 워크스페이스 단위 미래 플랜 모델 명시
- 전환 날짜·가격·무료/유료 기능 경계를 미정 결정으로 관리
- 가격·FAQ·약관·온보딩 문구를 동일한 상용화 상태에서 생성
- 향후 전환 checklist에 최소 30일 공지, 유예, 계속 사용·내보내기·downgrade 경로 포함

완료 기준:

- 현재 길드는 결제 정보나 만료일 없이 모든 현재 기능을 사용한다.
- 어떤 화면도 유료 전환 날짜·미확정 가격·미확정 entitlement를 표시하지 않는다.
- 한 사용자의 여러 길드 플랜 상태가 서로 영향을 주지 않는다.
- 상용화 결정 전에는 billing 실패나 플랜 상태 때문에 운영 command가 차단되지 않는다.
- 전환을 결정할 때 기존 길드 보호와 데이터 선택지가 준비되지 않았으면 유료 gate를 활성화할 수 없다.

### 단계 1U — 체험형 데모 상태 전이

목표: 로그인 없는 방문자가 대표 길드 운영 흐름의 행동과 결과를 같은 세션에서 끝까지 경험하게 한다.

- 이벤트 공개·슬롯 신청·참가 마감·참여 보상·리기어의 최소 상태 모델과 seed 작성
- 기존 안내 toast 전용 행동을 실제 데모 상태 전이 command로 교체
- 운영진·길드원 역할 전환과 역할별 가능한 행동·화면 분리
- `sessionStorage` 기반 세션 격리, 새로고침 복원과 명시적 초기화 제공
- 실제 도메인 상태·용어·제약과 데모 전이의 parity 테스트
- 운영 DB·Discord·outbox·결제 호출을 구조적으로 차단

완료 기준:

- 로그인 없이 대표 시나리오를 시작부터 최종 결과까지 완료할 수 있다.
- 한 화면의 행동이 다른 역할 화면, count와 후속 업무에 일관되게 반영된다.
- 새로고침 뒤 현재 데모 단계가 유지되고 초기화하면 seed가 정확히 복구된다.
- 다른 방문자·새 브라우저 세션·실제 길드 데이터에 상태가 전파되지 않는다.
- 구현되지 않은 기능을 완료된 것처럼 보여주는 행동이나 문구가 없다.

### 단계 1V — 비승인 회원 운영 기능 안전 폐기

목표: 제품 의도가 없는 체험 멤버·부재 일정 기능을 개인정보성 데이터 손실 없이 제거한다.

- 관련 화면·이벤트 경고·입력 action의 전체 참조 목록 고정
- 신규 입력 UI 제거와 server action/RPC write 차단
- 운영 데이터의 길드별 row count와 최근 사용 시각 읽기 전용 확인
- 잔존 데이터가 있으면 길드별 최소 내보내기 또는 폐기 안내 제공
- 읽기·계정 병합·운영 기록 연결 제거와 회귀 테스트
- 안정 배포 뒤 별도 누적 migration으로 테이블·RPC·불필요 인덱스 제거

완료 기준:

- 체험 멤버·부재 일정 입력이나 이벤트 충돌 경고가 어떤 화면·action에도 남지 않는다.
- 이벤트·보상·리기어·권한·준수 결과가 해당 데이터 제거 전후로 변하지 않는다.
- 저장된 데이터는 확인 없이 삭제되지 않고 길드별 처리 결과가 남는다.
- 애플리케이션 참조 제거가 확인된 뒤에만 스키마를 제거한다.
- 다국어 메시지·테스트·계정 병합 분기에 고아 참조가 남지 않는다.

### 단계 1W — 알림 routing·중복 억제

목표: 한 상태 변경을 올바른 수신자와 긴급도에 한 번만 전달하고, 처리 결과를 기존 메시지와 동기화한다.

- 이벤트 공지·개인 결과·행동 필요·운영 요약의 routing catalog 작성
- topic별 audience, channel, urgency, preference, 민감 필드 allowlist 정의
- 같은 원본·수신자·전달 종류의 idempotency key 표준화
- 웹·Discord 처리 완료 시 원래 메시지와 업무함 종결 상태 동기화
- 비긴급 운영 현황을 오늘의 업무함 snapshot 기반 digest로 통합
- 외부 전송 실패의 outbox 재시도와 영구 실패 업무 연결
- 전역 시스템 공지의 목적·심각도·필수 만료·단일 활성 제약 추가
- `important`의 공지별 닫기 상태와 `critical`의 닫기 불가 표시 분리
- 새 공지 발행 시 기존 활성 공지 교체와 cache 무효화를 원자적으로 처리
- 이벤트·리기어·상점의 고정 배너를 기능별 운영 안내로 명명하고 관리 화면에 용도 예시 표시
- 기능별 운영 안내의 닫기·자동 만료·Discord 자동 전송 경로를 두지 않고 빈 값 저장만 제거로 처리

완료 기준:

- 길드 전체·해당 개인·담당 운영진용 정보가 서로 다른 채널에 섞이지 않는다.
- 단순 현황은 즉시 메시지 폭주를 만들지 않고 운영 요약에서 확인된다.
- 같은 원본 상태가 재시도나 채널 간 처리로 두 번 전달되지 않는다.
- 업무 완료 뒤 미처리로 보이는 Discord 메시지나 새 중복 완료 알림이 남지 않는다.
- DM 수신 설정과 기능 상태가 모든 개인 알림에 동일하게 적용된다.
- 알림 실패가 원본 업무 상태를 실패나 이전 상태로 되돌리지 않는다.
- 전역 시스템 공지는 동시에 하나만 보이며 만료 시각이 없으면 발행할 수 없다.
- 일반 점검·장애 안내는 닫을 수 있고 긴급 보안·데이터 위험 공지만 닫기 불가다.
- 만료·조기 종료·교체 직후 이전 공지가 cache에서 다시 나타나지 않는다.
- 기능별 운영 안내는 해당 길드·페이지에서만 보이고 사용자가 닫거나 일시 소식처럼 외부 채널로 자동 전송할 수 없다.

### 단계 1X — 종료 이벤트 불변성과 안전 복제

목표: 종료 당시 운영 사실은 고정하고, 후속 처리와 재사용은 원본을 바꾸지 않는 별도 흐름으로 만든다.

- 이벤트 종료 command에서 일정·편성·유효 리기어 정책·빌드·전술 연결을 확정본으로 잠금
- 종료 이벤트의 일반 편집·삭제 route와 server action 차단
- 실제 참가·참여 보상·리기어·제작·루팅을 이벤트 참조형 사후 처리 기록으로 분리
- 잘못된 참가·지급·처리 결과에 사유·실행자·원본 연결을 가진 정정 기록과 반대 원장 적용
- 아카이브를 확정본·사후 처리·정정 이력의 읽기 전용 화면으로 전환
- 이벤트 복제 필드 allowlist를 두고 배정자·신청·참가·경제·처리 이력을 명시적으로 제외

완료 기준:

- 종료 이벤트 원본은 UI·직접 action·RPC 어느 경로에서도 수정·삭제할 수 없다.
- 참가 마감·보상·리기어·루팅과 그 정정은 종료 이벤트 확정본을 바꾸지 않는다.
- 아카이브에서 당시 계획과 이후 실제 결과·정정의 차이를 추적할 수 있다.
- 복제된 이벤트는 새 초안이며 재사용 구성만 갖고 참가자·지급·처리 이력은 0건이다.
- 복제 대상에 새 필드가 추가돼도 allowlist에 명시적으로 채택하기 전에는 따라오지 않는다.

### 단계 1Y — 기준 시간대와 개인 표시 분리

목표: 모든 길드 운영 판정은 하나의 달력 기준을 공유하면서 회원은 본인 지역 시각으로 읽을 수 있게 한다.

- 날짜·주간 경계 helper가 길드 운영 시간대를 필수 입력으로 받게 하고 고정 LA·KST 기준 제거
- 이벤트·리기어·통계·업무함·자동화의 달력 판정 호출부를 길드 운영 시간대로 통합
- 운영·공개·공용 화면과 길드 공지에 길드 시간대 및 약어 표시
- 개인 화면 query에 유효 개인 표시 시간대를 전달하고 이벤트·마감 시각만 변환
- 개인 시간대 설정을 DM 활성 여부와 분리하고 미설정 시 길드 시간대로 fallback
- UTC 절대 시각의 이중 변환과 길드 시간대 변경 시 저장 시각 재기록 차단

완료 기준:

- 같은 길드의 운영진과 회원은 개인 표시 설정과 관계없이 같은 이벤트 시점·마감·오늘·이번 주 집계 결과를 본다.
- 개인 시간대 변경은 개인 화면과 DM의 문자열만 바꾸고 DB 시각·자동화 실행·통계 대상 집합을 바꾸지 않는다.
- 길드 시간대 변경 전후 기존 이벤트의 UTC 시각은 동일하다.
- 업무 규칙에 하드코딩된 지역 시간대가 없고 모든 시간 표면에 적용 기준이 명시된다.
- DST 전환이 있는 EU·NA 시간대에서도 입력·표시·일·주 경계가 일관된다.

### 단계 1Z — 회원 공개 활동 링크 안전화

목표: 회원이 자신의 집계 성과를 안정적으로 공유하면서 검색 노출·작전 정보·비공개 운영정보를 함께 공개하지 않게 한다.

- 회원 공개 활동 요약 DTO를 집계형 allowlist로 축소하고 이벤트·킬 상세 제거
- 활성화 전 공개 미리보기와 목적·노출 범위 동의 UI 추가
- 본인 전용 활성화·폐기·즉시 재발급 command와 이전 token 무효화 구현
- 로컬 길드 계정도 확인된 Albion 캐릭터 신원으로 같은 본인 제어 경로 사용
- `noindex`·`nofollow`·`noarchive`, sitemap 제외와 공개 목록·검색 endpoint 부재 검증
- 탈퇴·캐릭터 연결 폐기 시 링크 무효화와 public cache purge
- URL·token의 로그·분석·오류 scrub과 공개 endpoint rate limit

완료 기준:

- 기본 상태에서는 어떤 회원 활동 링크도 외부에서 열리지 않는다.
- 운영진이나 길드 공개 프로필 설정이 회원 링크를 대신 활성화할 수 없다.
- 공개 응답에는 허용된 집계 필드만 있고 정확한 작전·킬 타임라인과 비공개 운영정보가 없다.
- 링크는 활성 중 안정적으로 유지되고 폐기·재발급·길드 연결 폐기 직후 이전 주소가 열리지 않는다.
- 검색엔진·sitemap·공개 목록에서 회원 링크를 발견할 수 없다.
- Discord 계정이 없는 유효 회원도 확인된 Albion 캐릭터를 기반으로 같은 기능을 사용할 수 있다.

### 단계 1AA — 길드 정지와 삭제 경계

목표: 연결 중단은 안전하게 복구하고, 영구 삭제는 공개 약속대로 명시적 요청과 30일 유예 뒤에만 수행한다.

- tenant 생명주기에 `deletion_pending`, 정지 원인·시각·주체, 삭제 요청자·`purge_at`·철회 기록 추가
- Discord 봇 제거 또는 API 접근 불가를 감지해 `bot_installed_at`과 분리된 현재 연결 상태로 반영
- 일시 정지 상태의 회원·공개·guest·token·command·outbox·cron·sync 공통 gate와 운영진 복구 전용 surface 구현
- `WORKSPACE_DELETE` 전용 capability, 재인증·길드명 확인과 열린 의무 blocker resolver 구현
- 삭제 대기 전환과 session·token·초대 철회, public cache·sitemap·SEO 제거를 원자 command/outbox로 연결
- 30일 내 철회와 봇·운영 시작 기준에 따른 `active/suspended` 복귀 구현
- idempotent purge claim, guild-scoped DB·파일·비밀 제거, 다른 길드·전역 신원 보존과 복구 불가 영수증 구현
- 삭제된 Discord 길드의 재설치를 새 workspace로 처리하도록 tombstone과 활성 unique identity를 분리
- FAQ·개인정보 안내·설정 화면의 삭제 시점과 실제 `purge_at`을 단일 정책에서 생성

완료 기준:

- 봇 제거·장기 미사용·향후 결제 정지 어느 경우에도 삭제 대기나 purge가 자동 시작되지 않는다.
- 일시 정지 중 일반 운영과 외부 공개는 막히지만 운영진은 원인·복구·필수 백업 경로를 사용할 수 있다.
- 열린 경제·보급 의무가 있는 길드는 삭제 대기에 들어갈 수 없고 정확한 해결 업무를 본다.
- 명시적 삭제 요청 뒤 정확히 30일 동안 철회 가능하며 그 즉시 모든 외부 접근 경로가 닫힌다.
- purge 뒤 해당 guild-scoped 제품 데이터는 복구할 수 없고 다른 길드 기록과 전역 사용자 신원은 변하지 않는다.
- 공개 FAQ와 실제 제품이 동일한 권한·30일 보존·복구·영구 삭제 결과를 설명한다.

### 단계 1AB — 개인·길드 언어 소유권 분리

목표: 다중 길드에서도 개인 언어가 흔들리지 않고 공용 메시지와 작성 원문이 예측 가능하게 표시되도록 한다.

- 전역 접근 신원에 개인 표시 언어를 두고 UI cookie·개인 DM resolver를 같은 값에 연결
- 길드 워크스페이스에 공용 시스템 문구용 길드 기본 언어 추가
- Discord·브라우저 locale 제안 뒤 한 번의 명시적 개인 선택과 모든 길드 동시 반영
- 길드별 기존 언어가 단일값이면 전역 backfill하고 충돌하면 재선택 대상으로 표시
- guest-only preference를 전역 사용자 preference와 분리하고 계정 연결 시 비덮어쓰기
- 공지 채널·개인 DM·공개 URL·작성 원문별 locale resolver를 하나의 routing contract로 정의
- 자동 번역 금지 필드 allowlist와 원문 보존 검증 추가
- `guild_profile_languages`를 모집 metadata로 고정하고 길드 기본 언어 fallback에서 제외
- 길드 회원 row의 `preferred_language` dual-read 종료 뒤 호환 write와 컬럼 제거

완료 기준:

- 같은 Discord 사용자가 길드를 전환해도 UI와 개인 DM 언어가 바뀌지 않는다.
- 개인 언어 변경은 소속 길드 수와 관계없이 다음 UI 요청과 모든 후속 개인 DM에 한 번만 반영된다.
- 길드 공지 채널의 시스템 문구는 길드 기본 언어 하나로 일관되고 개인 preference에 따라 메시지가 중복 생성되지 않는다.
- 운영진·회원 작성 원문은 어떤 locale에서도 동일하며 자동 번역이나 번역본 덮어쓰기가 없다.
- 공개 프로필의 사용 언어 목록을 바꿔도 사이트 locale·길드 기본 언어·개인 표시 언어는 변하지 않는다.
- 기존 길드별 언어 충돌을 임의로 고르지 않고 해당 사용자에게 한 번만 재선택을 요청한다.

### 단계 1AC — 서비스 운영 지원 경계

목표: 서비스 운영자가 장애와 계정·데이터 예외를 해결하되 길드 운영을 대신하거나 기록 없는 범용 쓰기 권한을 갖지 않게 한다.

- `/super-admin`의 조회·서비스 소유 설정·tenant 예외 복구 surface를 명확히 분리
- 현재 impersonation을 짧은 수명·항상 표시되는 **지원용 대리 조회**로 바꾸고 모든 일반 길드 mutation 차단
- 테넌트 상태·관리 접근 예외·계정 병합·nickname 정정·sync·backfill을 목적별 **서비스 복구 명령**으로 분리
- 각 복구 명령에 typed validation, 정확한 대상 재조회, 영향 preview, 필수 사유·확인 문구, idempotency key 적용
- `super_admin_audit_log`의 자유 형식 best-effort insert를 action별 allowlist가 있는 **서비스 운영 기록**으로 교체
- DB 변경과 서비스 운영 기록을 원자화하고 외부 job에 claim·종결 영수증 적용
- tenant 영향 복구를 길드 운영 변경 근거와 correlation ID로 연결
- 진단 화면에서 임의 POST endpoint 실행 안내를 제거하고 read-only 진단 또는 전용 복구 명령으로 연결

완료 기준:

- 지원용 대리 조회에서 이벤트·리기어·포인트·재고·회원·정책을 바꾸는 어떤 command도 실행되지 않는다.
- 모든 서비스 복구 명령은 실행 전 정확한 대상·현재 상태·예상 영향을 보여주고 사유와 명시적 재확인을 요구한다.
- 서비스 운영 기록을 남기지 못한 DB 변경이나 외부 job 시작이 존재하지 않는다.
- 같은 복구 요청을 재전송해도 대상 상태와 기록은 한 번만 바뀐다.
- 정상 길드 운영과 신규 길드 도입에는 서비스 운영자 대행·raw SQL·env 예외가 필요하지 않다.

### 단계 1AD — 도움말 표면 정합성

목표: 공개 문서·인앱 운영 레시피·도입 진행 체크리스트가 서로 다른 역할을 맡으면서 현재 제품과 같은 사실을 설명하게 한다.

- 기존 공개 MDX 68개를 현재 기능·용어·권한·상태 기준으로 inventory하고 폐기·통합·갱신 대상 분류
- 공개 제품 문서를 ko·ja·en·zh 동일 topic·route·의미 구조로 전환
- 홈·회원 상세·회원 업무함·리기어·보상·상점·백업 등 확정 설계와 충돌하는 과거 설명 제거
- `/admin/dashboard/guide`를 전체 매뉴얼 복제에서 capability·feature state별 짧은 **인앱 운영 레시피**와 deep link로 전환
- 7단계 운영 가이드를 설명 본문 없는 **도입 진행 체크리스트**로 명명하고 선택 항목의 비차단성 고정
- 공통 제품 규칙을 canonical source에서 참조하고 tenant별 작성 규칙을 기능별 운영 안내에 유지
- 미완성·실험·비활성 상태 badge와 비홍보 기준을 공개 문서·인앱 레시피에 공통 적용
- 문서 locale topic parity, placeholder·용어 parity, 내부/외부 link와 route 존재 검증을 CI에 추가
- 기능 변경 PR의 acceptance criterion에 관련 공개 문서·인앱 레시피 갱신 또는 영향 없음 증명 추가

완료 기준:

- 현재 제품 동작·권한·상태와 모순되는 공개 문서·인앱 레시피가 없다.
- 모든 공개 제품 문서 topic은 ko·ja·en·zh에서 같은 의미와 탐색 경로로 제공된다.
- 인앱 운영 레시피는 현재 사용자가 접근할 수 있고 실행 가능한 화면만 연결한다.
- 도입 진행 체크리스트의 선택 항목 미완료가 activation·회원 접근·첫 이벤트를 막지 않는다.
- 같은 제품 규칙을 세 도움말 표면이 서로 다른 값이나 정책으로 다시 정의하지 않는다.

### 단계 1AE — 공개 가치·길드 도입 경로 분리

목표: 공개 사용자가 인증 없이 반복 가치를 얻는 흐름과 길드 운영진이 제품을 검토해 도입하는 흐름을 명확히 분리하되 자연스럽게 연결한다.

- landing·features·pricing·FAQ·marketing nav의 CTA inventory를 만들고 페이지별 단일 주 행동과 보조 링크로 재분류
- 공유 링크와 공개 데이터 표면에서 로그인·봇 설치 선행 gate 제거
- 공개 결과의 조회·재탐색·공유를 최우선에 두고 관련 공개 길드 프로필·제품 발견은 비차단 보조 연결로 배치
- 운영진 경로를 문제·운영 흐름 확인, 체험형 데모, 공개 문서·가격, 봇 초대 순서로 연결
- 모든 공개 페이지에 일관된 기존 사용자용 내 길드·로그인 경로 유지
- 앱 커뮤니티 Discord CTA를 문의·지원 보조 위치로 이동
- 공개 이용·공유, 데모 시작·완료, 문서·가격 이동, 봇 초대를 개인정보 없는 별도 funnel event로 정의
- 각 CTA의 target route·locale·로그인 필요 여부와 실제 feature state를 공개 route 검증에 추가

완료 기준:

- 공개 사용자가 Discord 로그인·계정 생성·봇 초대 없이 첫 핵심 결과를 확인하고 링크를 공유할 수 있다.
- 각 공개·마케팅 페이지에는 방문 의도와 페이지 목적에 맞는 주 CTA가 하나만 있으며 다른 행동은 보조 계층에 있다.
- 길드 운영진은 landing 또는 features에서 시작해 데모·문서·가격을 확인하고 봇 초대까지 끊기지 않고 이동할 수 있다.
- 기존 사용자는 어느 공개 페이지에서도 내 길드로 바로 이동하고 인증 뒤 도입 퍼널로 되돌아가지 않는다.
- 커뮤니티 Discord를 이용하지 않아도 공개 기능 사용과 길드 도입을 모두 완료할 수 있다.

### 단계 1AF — 검색 발견·공유 정책 정합성

목표: 안정적인 공개 표면만 검색으로 발견하게 하면서 개별 결과의 링크 공유 가치를 보존하고 SEO 성과를 공개 가치와 길드 도입으로 나눈다.

- indexable route catalog를 마케팅·기능·공개 문서·대표 데모·공개 기능 시작점·동의한 공개 길드 프로필로 명시
- 일회성 query·개별 결과·token·앱 내부·tenant 관리 route를 sitemap과 index 대상에서 제외
- route classification, metadata robots, canonical, sitemap과 locale alternate가 같은 catalog를 참조하도록 통합
- index 제외 결과에도 직접 접근과 안전한 Open Graph 미리보기 유지
- 공개 길드 프로필의 활성·공개 동의와 sitemap 포함 여부를 같은 resolver로 판정
- SEO acquisition report를 공개 결과 확인·재탐색·공유 report와 데모·문서·가격·봇 설치·tenant 전환 report로 분리
- 공개 가치 event schema를 allowlist 기반 비식별 필드만 허용하고 Discord·Albion·자유 입력 metadata 거부
- 검색 제외 route의 색인 유입, indexable route의 잘못된 noindex와 locale canonical 충돌을 정기 점검

완료 기준:

- sitemap에 있는 모든 URL은 metadata에서도 indexable이고, index 제외 URL은 sitemap에 나타나지 않는다.
- 개별 공유 결과는 검색엔진 결과에 노출되지 않아도 직접 링크와 Discord 미리보기로 정상 이용할 수 있다.
- 공개 프로필을 끄거나 길드가 비활성화되면 sitemap과 검색 노출 대상에서 함께 빠진다.
- SEO 화면에서 공개 기능을 사용·공유한 성과와 길드가 봇을 설치한 성과를 서로 독립적으로 확인할 수 있다.
- 공개 가치 측정을 위해 Discord 로그인이나 개인 식별 metadata를 수집하지 않는다.

### 단계 1AG — 서사형 랜딩 승격

목표: 길드 운영의 반복 서사로 제품 차별점을 전달하는 차기 랜딩을 완성한 뒤 기존 canonical 마케팅 홈을 안전하게 교체한다.

- 네 장면의 주장과 실제 배포 기능·도메인 용어를 대조하고 미구현 약속 제거
- 각 장면에서 관련 기능 증거 또는 체험형 데모의 대응 단계로 연결
- 데모를 단일 주 CTA, 봇 초대를 보조 CTA, 내 길드 진입을 기존 사용자 경로로 정리
- ko·ja·en·zh 장면 의미·CTA·metadata parity 적용
- 모바일 viewport, keyboard 탐색, reduced motion, 이미지 실패와 저속 네트워크 fallback 검증
- 현재 랜딩 대비 핵심 메시지 이해·데모 진입·봇 초대 funnel을 비식별 이벤트로 비교
- 검토 중에는 prototype을 noindex·비목록으로 유지하고 준비 완료 뒤 기존 canonical landing 콘텐츠로 승격
- 승격 안정화 뒤 구 랜딩과 임시 prototype route·번역·asset의 중복을 안전하게 제거

완료 기준:

- 첫 화면과 장면 흐름만으로 대상 고객·해결하는 운영 루프·기존 길드 도구와의 차이를 이해할 수 있다.
- 모든 장면의 제품 주장이 실제 배포 기능과 일치하고 체험 가능한 행동은 실제 데모로 이어진다.
- 모바일·reduced-motion 환경에서도 내용과 CTA가 손실되지 않는다.
- 승격 전에는 검색과 주 navigation에 노출되지 않고, 승격 뒤에는 기존 canonical·locale·attribution 경로가 끊기지 않는다.
- 구 랜딩과 prototype이 서로 다른 공식 홈으로 동시에 남지 않는다.

### 단계 1AH — 시세 추정과 확정 가격 분리

목표: 하나의 길드 시세 기준을 상점·리기어가 공유하되 외부 추정값이 이미 합의된 주문·지급·제작 금액을 소급 변경하지 못하게 한다.

- 길드 시세 기준을 서버·기준 도시·기간·품질 기준의 typed policy로 통합
- AODP 결과의 가격·source·도시·관측 시각·사용 품질·fallback tier·confidence 표준화
- 상점 수동 고정가 우선과 명시적 해제 뒤 자동 시세 복귀 contract 고정
- 상점 주문선에 적용 실버값·할인율·포인트 단가·가격 source와 confidence snapshot 저장
- 자동 리기어의 항상 pending·청구자 부위별 수정·낮은 confidence 입력 요구 규칙 통합
- 승인 리기어와 제작 수락 시 업무 확정 가격을 고정하고 이후 sync 대상에서 제외
- 외부 시세 실패·stale·none 상태의 가격 미정 UI와 수동 입력 fallback 제공
- 설정 변경·동기화와 기존 열린 업무 사이의 비소급 통합 테스트 추가

완료 기준:

- 상점과 자동 리기어가 같은 서버·기준 도시·기간·품질 기준을 읽고 기능별 숨은 시세 설정이 없다.
- 모든 자동 가격은 이용자가 원본 도시·관측 시각·대체 범위와 신뢰도를 확인할 수 있다.
- 수동 고정가가 있는 상점 품목은 자동 동기화로 바뀌지 않고 명시적 해제 뒤에만 자동 시세로 돌아간다.
- 시세나 환율이 바뀌어도 접수된 주문, 승인된 리기어와 수락된 제작 작업의 금액은 바뀌지 않는다.
- 낮은 신뢰도·시세 없음·외부 장애가 자동 확정을 만들지 않으며 기존 업무를 손실시키지 않는다.

### 단계 1AI — 집결 기반 운영 시작

목표: 실제 싸움 시작을 관리자에게 입력받지 않고 모든 발행 이벤트가 집결 시각에 결정적인 운영 경계를 자동 통과하게 한다.

- `battle_started_at`의 사용처를 운영 기준 시작과 실제 전투 발생 시각으로 분류
- 저장 필드·도메인 모델·UI의 "전투 시작" 표현을 `operating_started_at` 의미로 이관
- `events_auto_start_enabled` opt-in과 온보딩 토글을 제거하고 발행 이벤트의 기본 transition으로 통합
- scheduler claim·idempotency·late catch-up을 적용하고 실행 지연에도 집결 시각을 effective start로 저장
- 시작 transition에서 참가 잠금·유효 리기어 정책·빌드·편성 snapshot·후속 outbox를 원자화
- 초안·취소·재예약 이벤트의 자동 시작 제외와 집결 변경 race 통합 테스트 추가
- 수동 전투 시작/reset을 확인형 `지금 운영 시작`과 사유 있는 운영 시작 정정으로 교체
- 실제 전투 record의 시각을 운영 시작 필드와 분리하고 전투 0건 이벤트의 정상 closeout 지원

완료 기준:

- 모든 발행 이벤트는 운영진 조작 없이 집결 시각을 effective time으로 한 번만 진행 중 전환된다.
- worker 지연·재시도·동시 수동 시작에도 운영 시작과 snapshot·알림이 중복되지 않는다.
- UI와 문서 어디에서도 운영 기준 시작을 실제 싸움 시작이 확인된 것으로 설명하지 않는다.
- 초안·취소 이벤트는 자동 시작하지 않고 집결 전 일정 변경은 새 시각에 정확히 반영된다.
- 전투나 리기어가 0건인 이벤트도 관리자 예외 처리 없이 정상 종료할 수 있다.
- 운영 시작 오류는 reset으로 지우지 않고 원본과 사유가 남는 정정으로만 바로잡는다.

### 단계 1AJ — 사후 리포트 축소와 이벤트 마감 현황 통합

목표: 제품이 전투를 평가하거나 운영진에게 회고 작성을 요구하지 않고, 종료 이벤트 상세에서 객관적 후속 상태와 원본 업무 이동만 제공한다.

- 기존 `event_after_action_reviews`의 운영 데이터 존재 여부와 작성 주체를 확인하고 실제 데이터가 있으면 contract 전에 길드별 읽기 전용 내보내기 또는 보존 결정을 남김
- `EventAfterActionReviewCard`, 저장 action, AAR 번역 문구와 신규 write를 제거
- 결과 추정·MVP·평가 표현을 이벤트 마감 표면에서 제거하고 연결 전투의 최소 사실과 원본 링크만 유지
- 참가 대조·참여 보상·리기어·제작·루팅 상태를 종료 이벤트 상세의 파생 **이벤트 마감 현황**으로 통합
- 오늘의 업무함과 원본 기능의 query·권한·deep link를 재사용하고 별도 마감 queue·알림·완료 조건을 만들지 않음
- `/events/[id]/report`와 기존 진입 링크는 권한을 보존한 종료 이벤트 상세로 redirect
- 안정 배포와 잔존 데이터 처리가 끝난 뒤 AAR 전용 table·RPC·타입을 별도 contract migration으로 제거
- 전투·리기어·보상·제작·루팅 0건, 부분 미완료, 권한별 노출과 기존 URL redirect 테스트 추가

완료 기준:

- 운영진이 작성하거나 승인해야 하는 사후 회고 필드·업무·알림이 없다.
- 종료 이벤트 상세가 참가 대조와 미완료 보상·리기어·제작·루팅을 각 원본 기능과 같은 상태로 보여준다.
- 이벤트 마감 표면 어디에도 승패·우열·MVP·전술적 잘잘못이나 자동 개선안이 없다.
- 마감 현황이 별도 저장 원본이나 이벤트 완료 조건을 만들지 않고 사후 처리·정정에 따라 갱신된다.
- 전체 운영 정보는 권한 있는 운영진에게만 보이며 공개 전투 공유와 분리된다.
- 기존 사후 리포트 URL은 유실 없이 종료 이벤트 상세로 이동하고 AAR 잔존 데이터는 확인 없이 삭제되지 않는다.

### 단계 2 — 길드 회원 기록 기반

목표: 로그인 ID와 업무 이력 주체를 분리한다.

- 신원 4개 테이블 추가
- 기존 회원·로컬 계정·Albion link backfill
- `guild_member_records.display_name_override` 추가와 길드별 표시명 resolver 구현
- 기존 길드 범위 표시값만 근거가 명확한 행에 backfill하고 전역 `site_user_nickname_overrides`는 길드별 별칭으로 일괄 복제하지 않음
- `MEMBERS_MANAGE` 기반 길드 표시명 설정·해제 command와 변경 전·후 값·실행자 기록 추가
- 길드 표시명 저장과 분리된 명시적 `Discord에 적용` command 추가
- 캐릭터 최초 신뢰 연결·실제 이름 변경·운영진 명시적 재적용과 일반 refresh를 구분하는 Discord 닉네임 적용 이력 추가
- 일반 refresh의 Discord 닉네임 재적용 제거와 실패 비차단 처리
- `active`·`withdrawn` 재적 전이와 비활성 회원의 신규 command gate 통합
- `guild_member_id` dual-write 시작
- DB partial unique index로 캐릭터 단일 활성 길드 강제
- 재정·보급·이벤트 소유권부터 read cutover

완료 기준:

- 모든 활성 접근 신원이 정확히 한 길드 회원 기록으로 해석된다.
- 같은 Discord는 여러 길드에 존재할 수 있다.
- 같은 캐릭터의 동시 활성 길드가 DB에서 불가능하다.
- 동일 길드 재가입은 새 회원 기록을 만들지 않고 기존 기록을 재활성화한다.
- 운영진이 한 길드의 표시명을 설정·해제해도 확인된 Albion 캐릭터명과 같은 사용자의 다른 길드 표시명은 바뀌지 않는다.
- 길드 표시명 변경과 Discord 서버 닉네임 적용은 별도 결과이며 Discord 실패가 사이트 값을 되돌리지 않는다.
- 최초 신뢰 연결 뒤 회원이 바꾼 Discord 서버 닉네임은 일반 refresh로 되돌아가지 않고, 실제 캐릭터명 변경 또는 운영진 재적용만 새 시도를 만든다.

### 단계 3 — 병합·이전·길드 전환

목표: 운영진 개입을 예외로 줄인다.

- 로컬 계정의 Discord 연결 UX
- 증거 일치 자동 병합과 충돌 업무
- API 확인 기반 캐릭터 이전
- 동일 길드 재가입 시 잔액·이력·미완료 의무 보존과 현재 역할 기반 권한 재계산
- 이전 길드 기록 보존 검증
- 활성 길드가 하나면 전환 UI·전 길드 query 없이 직접 진입
- 둘 이상일 때만 전역 내 길드 목록·분리된 요약 카드·현재 길드 표시 제공
- 마지막 활성 길드 기억과 권한 있는 target deep link의 직접 전환
- 일회용 host handoff와 대상 길드 문맥의 권한·기능 상태 재계산

완료 기준:

- 정상 연결과 정상 길드 이전에는 관리자 승인이 필요 없다.
- 모순·고위험 권한 충돌만 업무함에 나타난다.
- 병합 전후 포인트·활동 총합과 source 이력이 보존된다.
- 단일 길드 사용자는 다중 길드 선택 단계와 전 길드 요약 query를 거치지 않는다.
- 다중 길드 사용자는 길드별 요약을 보되 잔액·이벤트·업무가 합산되지 않는다.
- 전환 뒤 모든 조회와 mutation이 대상 길드 하나에만 적용되고 이전 길드의 세션 권한을 재사용하지 않는다.

### 단계 4 — 기능 catalog

목표: 필요한 기능만 보이는 셀프서비스 제품으로 만든다.

- `guild_feature_states`와 code catalog 추가
- 기존 설정 backfill
- nav·route·action·queue·notification·cron Adapter 연결
- 열린 업무가 있는 기능의 `draining` 전환과 자동 종료
- `guild_economy`와 상점·회원 거래장의 dependency 및 열린 에스크로 draining 연결
- 새 길드 설치 wizard 연결
- 최초 설정의 필수값을 Discord 멤버·운영진 역할, 이벤트 공지 채널, 운영 시간대, Albion 서버·홈 길드와 명시적인 리기어 도입 결정으로 제한
- 리기어 미지원은 `supply=disabled`, 지원은 최소 정책 확인 뒤 `enabled`로 전환하고 묵시적 기본값 완료와 건너뛰기 제거
- 자동·제작·재고·역할별 고급 정책과 이벤트 자동 시작을 activation gate 밖으로 이동
- 운영 시작 완료 뒤 첫 이벤트 생성으로 연결하고 7단계 가이드를 비차단형 진행률 checklist로 변경
- tenant slug·수동 SQL에 의존하는 고객 기능 제거

완료 기준:

- disabled 기능의 모든 surface가 숨거나 거부된다.
- draining 기능은 신규 접수 없이 기존 업무 처리 surface만 유지된다.
- setup_required 기능은 관리자 설정 경로만 열린다.
- 기존 길드의 보이는 기능은 backfill 직후 바뀌지 않는다.
- 봇만 새로 초대한 테스트 길드가 운영자 개입 없이 기능을 켤 수 있다.
- 필수 연결 중 하나라도 없거나 리기어 방침을 직접 선택하지 않으면 회원 접근이 열리지 않는다.
- 리기어 미지원 길드는 보급 기능 없이, 지원 길드는 확인한 최소 정책으로 첫 이벤트를 시작할 수 있다.
- 선택 기능이나 7단계 가이드 미완료는 길드 activation과 회원 접근을 막지 않는다.

### 단계 5 — 오늘의 업무함 통합

목표: 처리 대상 정의를 한 곳으로 모은다.

- WorkQueue Adapter registry 추가
- 단일 queue snapshot query/RPC 추가
- 관리자 오늘·승인 tab·sidebar badge·모바일 카드 연결
- Discord digest는 같은 snapshot 사용
- identity·supply 예외 queue 연결
- 회원 업무함 Adapter와 `action_required/waiting_on_guild/history` 분류 추가
- `/me/requests`의 중복 요약·타임라인·전체 목록을 행동 필요·대기·접힌 이력 구조로 교체
- 회원 업무 버튼을 원본 기능 command와 deep link에 연결
- 활성 길드·membership·capability 기반 다음 행동 홈 resolver 추가
- 일반 회원·운영진·게스트·연합 참가자의 홈 우선순위를 이벤트·오늘의 업무함·회원 업무함 snapshot에 연결
- `/`와 `/admin/dashboard`의 중복 이벤트·pending query를 역할별 홈 snapshot으로 교체
- 통계·전체 이력·전체 기능 바로가기를 홈 우선 카드에서 제거하고 전용 화면으로 연결
- legacy count·link·fallback 제거

완료 기준:

- 모든 surface의 count가 동일하다.
- 권한 없거나 기능이 `disabled`인 queue는 어떤 surface에도 나타나지 않고, `draining` queue는 기존 건 처리에만 나타난다.
- queue에서 이동한 화면이 실제 해결 command를 제공한다.
- 회원 업무함은 내 행동 필요를 길드 처리 대기보다 먼저 보여주고 완료 이력을 기본 목록에 중복 노출하지 않는다.
- 회원과 운영진 중 한쪽이 처리한 요청은 양쪽 업무함에서 같은 상태로 즉시 종결된다.
- 각 역할의 홈 첫 항목은 현재 권한에서 실제로 처리하거나 확인할 수 있고 원본 이벤트·업무함 상태와 일치한다.
- 게스트·연합 참가자 홈에는 접근 가능한 초대 이벤트 밖의 회원·경제·운영 정보가 없다.
- 홈에서 처리한 결과가 별도 상태로 남지 않고 원본 화면과 다른 홈 카드에서도 즉시 종결된다.

### 단계 6 — 운영 변경 기록 신뢰성

목표: 중요한 변경을 빠짐없이, 감시 데이터 없이 남긴다.

- 4개 locale과 데모·가이드의 사용자 용어 변경
- action별 schema allowlist
- 중요 mutation RPC 내부 기록으로 전환
- `guild_member_id`, `correlation_id`, source 채널 추가
- 원본 IP·UA를 허용한다고 오해할 수 있는 schema comment 제거
- coverage test 추가

완료 기준:

- 중요 mutation 성공 행마다 같은 correlation의 변경 기록이 정확히 하나 존재한다.
- 실패한 mutation에는 성공 기록이 없다.
- page view·IP·UA·token이 저장되지 않는다.

### 단계 7 — contract와 삭제

목표: 전환용 중복을 실제로 제거한다.

- 남은 업무 테이블의 `guild_member_id` 읽기 전환
- legacy `discord_id` write 중단
- `local:` synthetic ID 분기 제거
- 분산 기능 boolean·queue 정의·audit helper 제거
- dual-read·fallback·shadow code 제거
- 사용하지 않는 index·호환 컬럼은 별도 migration으로 마지막에 제거

완료 기준:

- 삭제 테스트에서 규칙이 호출부로 새지 않는다.
- 코드 검색으로 legacy write가 0건이다.
- 두 번 이상의 안정 배포와 production 지표 확인 뒤에만 destructive cleanup을 한다.

## 14. 검증 계획

### 단위 테스트

- 상태 머신의 허용·금지 전이
- 기능 dependency와 surface 결정
- queue 긴급도·정렬·권한 필터
- 다음 행동 홈의 역할·capability별 우선순위, 중복 제거와 빈 상태 resolver
- 회원 업무함의 행동 필요·길드 대기·이력 분류와 기한 정렬
- 길드원 내부 명부의 활성 회원 판정과 안전한 활동 프로필 DTO allowlist
- 회원 운영 명부의 게스트·탈퇴 회원·사이트 미연결 인게임 인원·신원 문제 분류
- 자동 병합 위험 판정
- 운영 변경 action별 details scrub
- 서비스 복구 명령별 입력·영향 preview·확인 문구·idempotency·기록 allowlist
- 지원용 대리 조회에서 허용되는 read와 차단되는 guild mutation 분류
- 공개 제품 문서 topic·locale catalog parity와 미완성·실험 상태 표시 resolver
- 인앱 운영 레시피의 capability·feature state별 노출과 도입 진행 체크리스트 비차단 판정
- 체험형 데모 command의 허용·금지 전이와 seed 초기화
- 폐기 대상 회원 운영 기능에 대한 신규 write 차단과 제거 후 참조 부재
- 알림 routing catalog와 원본·수신자·전달 종류별 중복 억제
- 전역 시스템 공지의 목적·심각도·만료 검증과 dismissible 판정
- 기능별 운영 안내의 길드·페이지 범위, 닫기 불가와 빈 값 비노출 판정
- 상점 재고 베이스라인의 최초 도입·복구 목적 표시와 일상 업무 surface 비노출
- 리기어 통계의 `event/free_window/auto` 출처 분류와 자유 리기어 참가 통계 제외
- 종료 이벤트 mutation 거부와 이벤트 복제 필드 allowlist
- 길드 운영 시간대의 일·주 경계와 개인 표시 시간대 fallback·DST 변환
- 회원 공개 활동 요약 DTO allowlist와 링크 활성·폐기·재발급 전이
- 활성 길드 문맥 선택과 단일·다중 길드별 전환 surface 결정
- 공개 프로필 활성 여부·길드 모집 상태·동일 Discord 서버 확인·대표권 분쟁 상태를 함께 적용하는 가입 CTA resolver
- 홈 길드 중복 연결의 분쟁 신청과 `submitted → under_review → resolved/rejected` 허용 전이
- 운영 시작 기준 resolver와 리기어 미지원·지원별 `supply` 상태 전이
- tenant 생명주기 허용 전이와 일시 정지 surface·삭제 열린 의무 blocker resolver
- 개인 UI·개인 DM·길드 공지·공개 URL·작성 원문별 locale resolver

### 통합 테스트

실 Postgres가 결정하는 항목은 반드시 통합 테스트로 검증한다.

- 두 길드가 같은 캐릭터를 동시에 활성화하려는 경쟁
- 같은 Discord 사용자의 두 길드 표시명 격리와 한쪽 설정·해제 시 다른 길드 불변
- 길드 표시명 override 해제 뒤 확인된 Albion 캐릭터명·Discord 표시명 fallback 순서
- `MEMBERS_MANAGE` 운영진의 표시명 변경 전·후 값·실행자 기록과 권한 없는 요청 차단
- 길드 표시명 command가 `albion_characters.current_name`을 수정하지 않음
- 길드 표시명 저장과 Discord 적용의 분리 및 Discord 실패 시 사이트 값 비rollback
- 같은 idempotency key의 동시 보급 명령
- 직접 출고의 부족 재고 rollback
- 상점 재고 베이스라인 적용의 이전 기준 대체·기준 시각 이후 입출고 재반영·변경 차이 기록
- 제작 박스 입고의 부분 장부 차감과 재고 외 조달 수량
- 작업 수락 시 개인 조달·길드 조달별 고정 정산액과 수수료 조합
- 박스 입고 시 건별 운영진 승인 없이 지급 예정액 생성 및 중복 ledger 방지
- 제작자별 미지급 실버 합계와 묶음 지급 완료의 원본 항목 보존
- 작업 수락 후 가격 snapshot 변경 차단
- 수령 확인 지연 전환 후 box unique 점유 유지
- 수령·미수령 회수 종료·이동 command별 박스 해제와 재고 movement
- 미수령 회수 종료 후 `returned_unclaimed`, 기존 승인·제작자 정산 불변, 후속 업무 미생성
- 수령 확인과 미수령 회수 종료 command의 경쟁 요청에서 한 전이만 성공
- fulfillment·movement·projection·운영 기록의 원자성
- 판매자 전달 완료 뒤 72시간 경계의 무응답 자동 지급과 중복 실행 방지
- 구매자 수령 확인·분쟁 제기·자동 지급의 동시 요청에서 한 종결만 성공
- 분쟁 중 scheduler 지급 차단과 운영진의 전액 지급·전액 환불
- 기존 `delivered` 주문의 전환 후 72시간 유예와 기존 `disputed` 주문 불변
- 일반 상점 주문의 재고·포인트 동시 예약과 관리자 승인 없는 자동 접수
- 상점·회원 거래·환전의 동시 요청에서 사용 가능 포인트 초과 예약 차단
- 가격 검토 주문의 신청 금액 이하 최종 가격과 인상 최종 가격 분기
- 가격 인상 수락 시 차액 포인트 부족의 무변경 실패
- 가격 인상 수락·거절·48시간 만료의 경쟁 요청에서 한 종결만 성공
- 회원이 재확인하지 않은 인상 금액의 예약·차감 차단
- 상점 전달 완료 시 point hold의 단일 구매 차감 전환
- 상점 주문 취소·거절의 재고·포인트 예약 원자 복구와 idempotency
- 기존 상점 `pending` 주문의 가격 검토 여부별 무중복 backfill
- 환전 신청과 포인트 hold의 원자성 및 상점·회원 거래와의 동시 잔액 경쟁
- 환전 금액 수정·취소의 hold 조정·해제와 idempotency
- 환전 지급 claim과 회원 취소·다른 운영진 claim의 경쟁 요청
- 환전 지급 완료와 `exchange_paid` 단일 차감의 원자성
- 환전 claim 해제 뒤 재처리 및 `paying` 상태의 자동 종결 금지
- 기존 환전 `pending`의 hold backfill과 기존 `approved`·`rejected` 불변
- 금고 실버 입금 원본의 tenant별 dedupe와 동일 원본 동시 용도 지정 경쟁
- 용도 미지정 입금의 무포인트 보장과 정상 지정의 `donation_approved` 단일 가산
- 다른 회원·다른 길드·이미 배정된 입금 원본 선택 차단
- 입금 allocation·포인트 가산·운영 변경 기록의 원자성
- 로그 누락·중복·불일치 신청의 예외 queue 분류와 스크린샷 단독 자동 적립 차단
- 기존 입금 적립 `pending`의 유일 원본 매칭과 기존 `approved`·`rejected` 불변
- 동일 포인트 양도 idempotency key의 재전송과 단일 batch·원장 쌍 보장
- 다중 수신자 양도의 전체 성공·전체 rollback
- 포인트 양도와 상점·환전·회원 거래 hold의 동시 사용 가능 잔액 경쟁
- 본인·게스트·다른 길드·비활성 회원에 대한 양도 차단
- 양도 원본 batch와 예외 관리자 정정 원장의 연결 및 원본 불변
- 동일 이벤트 특별 보상 idempotency key 재전송의 단일 grant·원장 보장
- 특별 보상 대상별 원장 가산의 전체 성공·전체 rollback
- 한 특별 보상 grant의 대상별 동일 금액 보장과 차등 금액 입력 차단
- 특별 보상 전용 capability 경계와 일반 이벤트 관리 권한의 지급 차단
- 신규 특별 보상의 무승인 queue·무 `pending` 상태 보장
- 특별 보상 원본 grant와 예외 관리자 정정 원장의 연결 및 원본 불변
- 기존 특별 보상 `pending`의 명시적 종결과 기존 `approved`·`rejected` 불변
- 같은 사이펀 원본에 대한 기록 모드·보관 장부 모드의 합계 동일성
- 사이펀 정책 전환 전후 원본 로그·합계 불변과 모드별 라벨·주의 상태 분기
- 기록 모드 음수의 무업무 보장과 보관 장부 모드 음수의 자동 제재 차단
- 다른 참가자의 대리 입고를 포함한 루팅 품목 pool 총량 매칭
- 루팅 품목 부족분의 이벤트 수준 단일 finding과 개인 자동 책임 판정 차단
- 루팅 finding 해결·오탐 종결 뒤 원본·최초 부족분 불변
- 전술 feature disabled 상태의 nav·직접 route·action·이벤트 연결 차단
- 전술 공유 링크의 만료·폐기·noindex·읽기 전용 접근
- 전술 원본 수정과 이벤트 immutable snapshot의 분리
- 승인 빌드 고정·복수·조건부 장비 조합의 서버 검증
- 템플릿 변경·삭제 뒤 기존 이벤트 빌드 확정본과 리기어 기준 불변
- 범위 밖 장비 선택 차단과 운영진 이벤트별 예외의 템플릿 비전파
- 동일 근거·정책에 대한 Menhera 운영진·회원 콘텐츠 준수 상태 일치
- Menhera 참여 미달·영상 의무 미충족의 전투 참가·리기어·포인트·권한 자동 제한 부재
- 최근 5일 유효 영상의 새 환전 신청 한정 guard, 제출 성공 즉시 해제, 경계 시각 만료와 무효화 재계산
- 기존 접수 환전이 영상 자격 만료·무효화로 소급 변경되지 않음
- Menhera 참여 수동 보정과 영상 무효화의 tenant 격리·전용 capability·변경 기록
- 비-Menhera tenant의 nav·직접 route·action·RPC·환전 guard 차단과 다른 기능 무영향
- 공개 프로필 활성화 직후 비식별 집계 공개와 인물·경제 섹션 비공개
- 공개 인물·경제 섹션별 opt-in과 OFF 직후 캐시·SEO·Discord 미리보기의 비노출
- 모든 공개 토글 조합에서 내부 원장·잔액·신청·정산·권한·운영 변경 기록 비노출
- 이벤트 시작 시 참가자·역할별 유효 리기어 정책의 단일 snapshot 생성
- 전역·역할·Discord·영상 설정 변경 뒤 시작된 이벤트 snapshot·지급액 불변
- 같은 이벤트의 수동·자동·제작 리기어와 지연 신청 간 유효 정책 일치
- 자유 리기어 창구 snapshot과 이벤트 유효 정책의 상호 비간섭
- 자유 리기어 신청·승인·지급액의 리기어 통계 포함과 참가율·참여 보상 집계 비포함
- 승인 대기 신청 중 참가예정 유지와 확정 배정 시에만 단일 종료
- 운영 기준 시작 뒤 회원 참가예정 command 차단과 시작 snapshot의 읽기 전용 보존
- 참가예정만 있는 회원의 참가율·성과·참여 보상·리기어 query 비포함
- 참가 후보 기본 선택과 불일치 예외 수정 뒤 최종 명단 snapshot
- 참가 일괄 마감의 명단·대상별 포인트 원장·변경 기록 원자성 및 idempotency
- 신규 참여 보상의 무승인 queue와 기존 `event_payout_requests` 종결 이력 보존
- 종료 이벤트의 UI 우회 편집·직접 action·RPC 수정·삭제 차단
- 참가·지급·리기어·루팅 사후 정정의 append-only 기록과 원본 확정본 불변
- 이벤트 복제에서 배정자·신청·참가·보상·리기어·제작·루팅·활동·정정 이력 제외
- 동일 길드 백업 preview/apply 검증과 다른 길드 파일의 무변경 거부
- 복구 payload의 완료 이력·일반 설정·재사용 템플릿·통계·캐시 제외
- 잔액·hold·에스크로와 재고·예약·열린 의무의 참조 무결성 및 함께 복원
- 복원 transaction 중간 실패의 전체 rollback과 서버 안전 snapshot
- 템플릿 패키지의 포인트·재고·회원·원장 필드 거부
- Discord 역할 연결과 역할 변경 후 세션 권한 재계산
- 개인 권한 예외의 사유·만료·자동 회수와 로컬 운영 capability 차단
- 길드원 성취 리더보드·운영진 운영 통계·Menhera 콘텐츠 준수의 권한과 자동화 비연결
- 슬롯 배정 무기와 관측된 실제 무기의 DTO·집계 분리
- 같은 전투의 중복 장비 사건을 회원·무기군별 한 번만 집계
- 티어·인챈트·품질·알려진 아티팩트 변형의 무기군 정규화와 원본 item type 보존
- 슬롯 배정만 있고 장비 관측이 없는 전투의 무기 사용 횟수 미생성
- 무기 사용 통계와 포인트·보상·리기어·권한·참가 자격·자동 편성의 비연결
- 성취 배지의 길드 회원 귀속·중복 획득 방지·획득 시각 보존·집계 변경 후 비회수
- 성취 배지와 포인트·리기어·권한·준수 판정의 비연결
- 같은 공식 전투의 팀 전투 위업이 확인된 참가자 전원에게 한 번씩만 부여됨
- 모호·집계 제외 전투의 위업 미생성 및 전투 판정 로직 복제 부재
- 개인 킬·생존 위업의 보조 트랙 격리와 역할 간 종합 실력 점수 부재
- Discord·웹 command parity와 확인형 빠른 실행의 idempotency
- 회원 활동 DTO와 본인·업무별 비공개 운영 DTO의 서버 경계
- 무료 베타에서 billing·entitlement 비의존과 길드별 미래 플랜 격리
- 데모 command의 운영 DB·Discord·outbox 무호출과 브라우저 세션 간 격리
- 체험·부재 테이블 제거 전 row 확인·내보내기 분기와 제거 뒤 이벤트·회원 흐름 불변
- 공지·개인 DM·운영진 즉시 알림·digest의 audience 격리와 처리 후 메시지 동기화
- 비활성 회원의 신규 command 차단, 기존 의무 종결과 동일 길드 재가입의 기록 보존
- 일반 명부·검색·Discord 회원 상세·Albion 상세 직접 URL의 동일한 tenant·membership·capability 경계
- 게스트·탈퇴 회원·사이트 미연결 인게임 인원의 일반 명부 비노출과 운영진 명부 권한별 노출
- 일반 명부와 활동 프로필 응답의 포인트·리기어·증빙·준수·운영 메모 부재
- 서로 다른 개인 시간대에서 동일 이벤트 시점·마감·통계 대상·자동화 실행 결과 일치
- 개인 시간대 변경의 DB 절대 시각·일·주 경계·업무함 대상 무영향
- 길드 시간대 변경 뒤 기존 이벤트 UTC 불변과 공용 표시·달력 경계의 새 기준 적용
- EU·NA DST 전환 구간의 이벤트 입력·개인 표시·일·주 경계 왕복 일치
- 회원 본인만의 공개 활동 링크 활성·폐기·재발급과 이전 주소 즉시 무효화
- 운영진·길드 공개 설정에 의한 회원 링크 활성화 차단
- 공개 활동 응답의 집계 allowlist와 작전 타임라인·Discord 신원·비공개 운영정보 부재
- 로컬 길드 계정의 확인된 Albion 캐릭터 기반 링크 생성과 다른 회원 링크 제어 차단
- 탈퇴·캐릭터 연결 폐기 뒤 링크 접근·캐시 무효화와 URL·token 로그 scrub
- 단일 길드 Discord 사용자의 직접 진입과 전 길드 요약 query 부재
- 같은 Discord 사용자의 두 길드 카드·역할·잔액·이벤트·업무 요약 비합산
- 일회용 handoff 재사용 차단과 전환 뒤 대상 길드 권한·기능 상태 재계산
- 다른 길드 ID를 넣은 action·deep link의 tenant 격리와 마지막 활성 길드 fallback
- 회원 업무함과 오늘의 업무함에서 같은 원본 요청의 상태·다음 주체·종결 결과 일치
- 일반 회원·운영진·겸임 사용자 홈의 이벤트·업무 우선순위와 원본 snapshot 일치
- 게스트·연합 참가자의 허용 이벤트 외 홈 정보·deep link 비노출
- 홈 action 처리 뒤 원본 Module·오늘의 업무함·회원 업무함·다른 역할 카드의 동시 종결
- `disabled` 기능의 홈 카드 부재와 `draining` 기능의 기존 미완료 행동만 노출
- 모집 마감 상태의 활성 공개 프로필 접근·검색 metadata 유지와 가입 CTA·모집 세부 정보 부재
- 공개 모집·선별 모집과 유효·빈·잘못된 Discord 초대 URL별 CTA 분기
- Discord 초대가 유효해도 대상 서버가 봇 설치 서버와 다르면 가입 CTA 비노출
- 정상 최초 홈 길드 연결의 인게임 코드·영상·서비스 운영자 승인 부재
- 동일 Albion 서버·길드의 중복 연결 경쟁에서 하나만 성공하고 실패 요청에는 분쟁 신청 경로 제공
- 익명 신고 한 건만으로 공개 프로필이 자동 중단되지 않으며 `under_review` 전환 뒤에만 프로필·CTA 중단
- 대표권 분쟁 중 내부 tenant 데이터·미완료 의무 접근 유지와 홈 길드 의존 공개·동기화 격리
- 연결 재지정 종결 뒤 이전 워크스페이스의 `setup_required` 전환과 tenant 간 데이터 이동 부재
- 공개 프로필 OFF 직후 외부 응답·sitemap·SEO·Discord 미리보기 비노출
- 공개 프로필·가입 CTA에서 앱 내 지원서·지원자 승인 업무가 생성되지 않음
- 만료 없는 전역 시스템 공지 발행 거부와 동시 발행 경쟁에서 단일 활성 공지만 성공
- `important` 공지의 공지 버전별 닫기와 `critical` 공지의 닫기 차단
- 전역 시스템 공지의 만료·조기 종료·교체 뒤 서버 응답과 cache 비노출
- 한 길드의 기능별 운영 안내 생성·교체·제거와 다른 길드·페이지 비노출
- 최초 설정 필수 역할·공지 채널·시간대·Albion 홈 길드 중 하나라도 빠진 activation 거부
- 리기어 방침 미선택과 안전 기본값 묵시적 완료 차단
- 리기어 미지원 완료의 `supply=disabled`와 지원 최소 정책 완료의 `supply=enabled`
- 선택 기능·7단계 가이드 미완료 상태의 정상 회원 접근과 첫 이벤트 생성
- 봇 제거·장기 미접속의 `suspended` 전환과 삭제 대기·`purge_at` 미생성
- 일시 정지 직후 회원 session·공개/guest/member token·신규 command·outbox·cron 차단과 운영진 복구 surface 유지
- 열린 포인트·에스크로·예약·보급 의무가 있는 삭제 요청의 무변경 거부와 blocker deep link
- 삭제 대기 전환의 요청 기록·30일 `purge_at`·session/token/cache 철회 원자성
- 삭제 철회와 purge claim의 경쟁에서 정확히 한 종결만 성공
- 30일 경계 전 purge 거부와 경계 뒤 idempotent guild-scoped purge
- 한 사용자의 길드 A 영구 삭제 뒤 길드 B 회원·잔액·이력과 전역 접근 신원 불변
- tombstone이 남은 Discord 길드 재설치의 신규 workspace 생성과 과거 데이터 비연결
- 같은 Discord 사용자의 두 길드 언어가 충돌할 때 전역 preference 미선택 backfill과 단일 재선택
- 한 길드에서 개인 표시 언어 변경 뒤 다른 길드 UI·모든 개인 DM의 동일 언어 반영
- 길드 기본 언어 변경의 공용 Discord 시스템 문구 반영과 개인 UI·DM 무영향
- guest-only 언어와 연결된 전역 사용자 언어의 비덮어쓰기
- 공개 URL locale별 시스템 UI 번역과 운영진·회원 작성 원문 byte-level 불변
- 길드 사용 언어 변경의 개인 표시 언어·길드 기본 언어·locale cookie 무영향
- 로컬→Discord 병합 후 tenant 격리
- 캐릭터 이전 후 이전 길드 이력 불변
- RLS·RPC의 `guild_id` 위조 차단
- 기능 disabled 상태의 직접 action 차단
- 서비스 운영자 외 `/super-admin` route·action 접근 차단과 client 우회 불가
- 지원용 대리 조회 cookie로 일반 길드 mutation·RPC·server action 실행 차단
- DB 서비스 복구 명령과 서비스 운영 기록의 원자성
- 외부 복구 job의 claim 실패 시 미실행, 재시도 시 단일 실행과 종결 영수증
- 복구 명령의 tenant·사용자 범위 격리와 영향 preview 이후 상태 변경 경쟁 시 재검증
- 공개 문서의 ko·ja·en·zh topic·route 동등성과 내부/외부 link 유효성
- 인앱 운영 레시피 deep link의 tenant·capability·feature state별 실제 접근 가능성
- 도입 진행 체크리스트 선택 항목 미완료 상태의 activation·회원 접근·첫 이벤트 무영향
- 미완성·실험·비활성 기능의 공개 문서·인앱 레시피 상태 일치와 홍보 CTA 부재
- 기능 draining 상태의 신규 접수 차단과 기존 업무 처리 허용
- 열린 회원 거래 에스크로가 있을 때 `member_market`·`guild_economy`의 dependency와 draining 종결

### UI 검증

- 모바일: 신청 상태, 빠른 승인, 업무함, 길드 전환, 비활성 상태와 재가입 복구, 거래 수령 확인 기한, 상점 주문 예약, 상점 최종 가격 재확인, 환전 지급 대기·취소, 미배정 입금 용도 지정, 포인트 양도 최종 확인, 모드별 사이펀 의미, 승인 빌드 선택, 이벤트 유효 리기어 정책 카드, 참가 일괄 마감 예외 수정·최종 확인, 전술 공유 읽기, Menhera의 내 콘텐츠 준수 상태·최근 영상 환전 자격·영상 제출, 공개 프로필 외부 방문
- 데스크톱: 기능 설정, 보급 상세, 리기어 정책 출처·시작 snapshot·변경 diff, 참가 후보 비교·일괄 마감, 상점 물품 준비, 환전 지급 처리, 입금 매칭 예외, 거래 분쟁, 이벤트 특별 보상 최종 확인, 사이펀 정책 전환, 승인 빌드 편집·이벤트 예외·확정본, 전술 실험 상태·공유 만료·폐기, Menhera 콘텐츠 준수 정책·근거 보정·영상 무효화, 공개 프로필 섹션별 미리보기·공개 전환, 동일 길드 복원 diff·안전 snapshot·영수증, 템플릿 패키지, 병합 충돌, 운영 변경 기록
- 직접 URL 접근과 뒤로가기
- Discord 링크에서 웹으로 이어지는 handoff
- 일반 회원·운영진·겸임 사용자·게스트·연합 참가자의 역할별 다음 행동 홈과 명확한 빈 상태
- 체험형 데모의 역할 전환, 종단 간 상태 변화, 새로고침 유지와 초기화
- 체험 멤버·부재 일정 입력·배지·이벤트 충돌 경고의 완전한 비노출
- 알림 종류별 수신 채널, 개인 DM 설정, digest 묶음과 중복 억제
- 종료 이벤트 아카이브의 읽기 전용 확정본·사후 처리·정정·안전 복제 흐름
- 운영·공개·공용 화면의 길드 시간대 표기와 개인 화면·DM의 개인 표시 시간대
- 회원 공개 활동 링크의 활성화 전 미리보기·공유·폐기·재발급과 검색 비노출 metadata
- 최초 설정의 필수 연결·명시적 리기어 방침 선택·첫 이벤트 handoff와 비차단형 7단계 checklist
- 길드 일시 정지의 원인·보존 범위·재연결·필수 백업 화면과 삭제 대기의 30일 철회·영구 삭제 확인 흐름
- 다중 길드 전환 전후 동일한 개인 언어, 길드별 공용 공지 언어와 locale별 원문 보존
- 단일 길드의 무전환 직접 진입과 다중 길드에서만 보이는 분리된 길드 카드·현재 문맥 표시
- 공개 프로필의 모집중·선별 모집·모집 마감 표시와 상태별 Discord 가입 CTA·보조 통계 계층
- 서비스 운영의 조회 전용 기본 상태, 지원용 대리 조회 배너·종료, 복구 명령 영향 미리보기·재확인
- 공개 제품 문서의 네 언어 탐색, 인앱 운영 레시피의 문맥형 deep link와 도입 진행 체크리스트의 비차단 완료 상태
- ko/ja/en/zh key·placeholder 동등성

### 운영 검증

| 지표 | go 기준 |
|---|---|
| 신규 보급 부분 완료 | 0건 |
| movement 합계와 재고 projection 불일치 | 0건 |
| 확인 기한이 지난 정상 회원 거래의 미해소 에스크로 | 0건 |
| 상점 주문의 재고 예약과 포인트 hold 불일치 | 0건 |
| 환전 `paid`와 `exchange_paid` 원장 불일치 | 0건 |
| 지급 처리 중 환전의 중복 운영진 claim | 0건 |
| 동일 금고 입금 원본의 중복 allocation·포인트 적립 | 0건 |
| 정상 매칭 입금 중 운영진 수동 심사가 필요한 비율 | 0% |
| 동일 포인트 양도 의도의 중복 batch·차감 | 0건 |
| 동일 이벤트 특별 보상 의도의 중복 grant·가산 | 0건 |
| 신규 특별 보상의 승인 대기 업무 | 0건 |
| 정상 신규 길드 중 대표권 수동 검수가 필요한 비율 | 0% |
| 대표권 분쟁 `under_review` 중 공개 프로필·가입 CTA 노출 | 0건 |
| 사이펀 정책 전환으로 변경된 원본·합계 | 0건 |
| 사이펀 기록 모드의 음수 운영 업무 | 0건 |
| 총량이 회수됐는데 남은 루팅 미회수 의심 항목 | 0건 |
| 루팅 기록만으로 자동 확정된 개인 미반납·제재 | 0건 |
| 만료·폐기 뒤 열리는 전술 공유 링크 | 0건 |
| 전술 원본 수정으로 변경된 진행·종료 이벤트 snapshot | 0건 |
| 템플릿 변경으로 바뀐 기존 이벤트 빌드 확정본·리기어 기준 | 0건 |
| 운영진 예외 없이 승인 범위 밖으로 확정된 참가자 장비 | 0건 |
| 캐릭터 다중 활성 길드 | 0건 |
| 일반 명부에 노출된 게스트·탈퇴 회원·사이트 미연결 인게임 인원·신원 문제 | 0건 |
| 회원 관리 capability 없이 접근 가능한 회원 운영 명부·관리 상세 | 0건 |
| 일반 명부·활동 프로필 응답의 회원 비공개 운영 정보 | 0건 |
| queue surface 간 count 불일치 | 0건 |
| 다음 행동 홈과 원본 이벤트·업무함의 상태·deep link 불일치 | 0건 |
| 홈에서 중복 노출된 동일 이벤트·요청 | 0건 |
| 게스트·연합 참가자 홈의 허용 이벤트 밖 회원·경제·운영 정보 | 0건 |
| `disabled` 기능이 만든 홈 카드·빈 상태 | 0건 |
| 회원 업무함에서 행동 필요·대기·이력에 중복 노출된 동일 요청 | 0건 |
| 현재 활성 길드 밖의 회원 업무 항목 | 0건 |
| enabled/draining/disabled surface 불일치 | 0건 |
| 중요 mutation의 변경 기록 누락 | 0건 |
| 지원용 대리 조회에서 성공한 길드 업무 mutation | 0건 |
| 서비스 운영 기록 없이 성공한 서비스 복구 명령·외부 job 시작 | 0건 |
| 동일 서비스 복구 의도의 중복 실행·중복 영향 | 0건 |
| 정상 길드 운영에 필요한 서비스 운영자 대행·raw SQL·env 예외 | 0건 |
| 현재 제품 동작·권한·상태와 모순되는 공개 문서·인앱 레시피 | 0건 |
| ko·ja·en·zh 중 누락되거나 의미가 다른 공개 제품 문서 topic | 0건 |
| 접근 불가능하거나 제거된 화면을 가리키는 인앱 운영 레시피 | 0건 |
| 선택형 도입 진행 체크리스트로 차단된 activation·회원 접근·첫 이벤트 | 0건 |
| outbox 영구 실패 | 업무함에 100% 노출 |
| 비승인 체험·부재 기능의 신규 저장 | 0건 |
| 같은 원본·수신자·전달 종류의 중복 알림 | 0건 |
| 동시에 활성인 전역 시스템 공지 | 최대 1건 |
| 만료·종료 뒤 계속 노출되는 전역 시스템 공지 | 0건 |
| `critical`이 아닌 닫기 불가 전역 시스템 공지 | 0건 |
| 기능별 운영 안내의 사용자 닫기·자동 만료·Discord 자동 전송 | 0건 |
| 일상 업무함·스케줄러가 생성한 상점 재고 베이스라인 작업 | 0건 |
| 자유 리기어 신청으로 증가한 이벤트 참가 인원·참여 보상 | 0건 |
| 출처가 없는 신규 리기어 통계 행 | 0건 |
| 종료 이벤트 확정본의 수정·삭제 | 0건 |
| 개인 시간대로 인해 달라진 길드 운영 시점·일·주 집계 | 0건 |
| 회원 공개 활동 응답의 비허용 상세 필드·검색 색인 | 0건 |
| 단일 길드 요청에서 실행된 불필요한 전 길드 요약 query | 0건 |
| 다중 길드 사이에 합산·혼입된 잔액·이벤트·업무·권한 | 0건 |
| 모집 마감·잘못된 초대 URL에서 노출된 가입 CTA | 0건 |
| 봇 제거·장기 미접속으로 자동 시작된 삭제 대기·purge | 0건 |
| 삭제 대기 중 열리는 회원·공개·guest·token 접근 | 0건 |
| 30일 전 purge 또는 다른 길드·전역 신원 오삭제 | 0건 |
| 길드 전환으로 바뀐 개인 UI·DM 언어 | 0건 |
| 자동 번역·locale 전환으로 변경된 운영진·회원 작성 원문 | 0건 |

## 15. 배포와 롤백

### 15.1 배포 원칙

- 모든 schema 변경은 expand → backfill → dual-write → read cutover → contract 순서로 한다.
- DB migration과 코드 push는 프로젝트 규칙대로 분리한다.
- destructive migration은 최소 두 번의 안정 배포 후 별도 실행한다.
- 각 단계는 독립적으로 배포 가능해야 한다.

### 15.2 롤백

- 단계 1~6은 additive schema를 유지해 이전 코드가 계속 읽을 수 있게 한다.
- 새 read path에 문제가 생기면 compatibility read로 되돌리되 신규 write의 idempotency·원장은 유지한다.
- 이미 기록된 movement나 회원 이력을 삭제해 롤백하지 않는다. 반대 movement·새 history row로 되돌린다.
- outbox는 재실행 가능하며 메시지 중복은 idempotency key로 차단한다.
- 기능 catalog cutover는 길드별 rollout cohort로 되돌릴 수 있다.
- contract 단계는 별도 승인과 백업 확인 없이는 진행하지 않는다.

## 16. 최종 완료 정의

다음이 모두 성립해야 “최종 단계”가 완료된 것이다.

1. 업무 데이터의 주체가 Discord ID가 아니라 길드 회원 기록이다.
2. 로컬 계정 연결과 정상 캐릭터 이전은 자동이며 예외만 운영진이 본다.
3. 보급 이행·재고·원장·중요 기록이 원자적이다.
4. 기능 상태가 nav·route·action·queue·notification·cron에 동일하게 적용된다.
5. 오늘의 업무함의 목록·count·링크가 하나의 snapshot에서 나온다.
6. 운영 변경 기록은 중요한 변경만 빠짐없이 남기고 행동 감시 데이터는 수집하지 않는다.
7. 새 길드가 SQL·env·서비스 운영자 도움 없이 같은 상태에 도달한다.
8. 전환용 legacy 분기와 fallback이 제거되어 삭제 테스트를 통과한다.
9. 정상 환전은 포인트를 먼저 보류하고 실제 실버 지급 완료와 포인트 차감이 하나의 결과로 남는다.
10. 금고 입금은 회원의 명시적 용도 지정이 있을 때만 포인트가 되며 정상 원본 매칭은 운영진 없이 완료된다.
11. 포인트 양도는 즉시 확정되는 선물·개인 정산으로만 동작하고 회원 거래의 보호 흐름을 우회하지 않는다.
12. 이벤트 특별 보상은 예외적인 경우에만 전용 권한과 한 번의 최종 확인으로 지급되고 형식적 자기 승인 업무를 만들지 않는다.
13. 사이펀은 길드가 기록 확인과 개인 보관 장부 중 목적을 선택하며 정책 전환이 원본 사실을 바꾸지 않는다.
14. 루팅 검증은 이벤트 품목 총량의 회수 여부를 판정하고 개인 기록은 자동 책임이 아닌 조사 근거로만 사용한다.
15. 전술은 정확성을 보증하지 않는 선택적 실험 기능으로 격리되고 외부 공유는 만료·폐기 가능한 읽기 링크만 사용한다.
16. 빌드 템플릿은 승인된 선택 범위이며 이벤트에서 실제 확정한 장비는 이후 템플릿 변경과 분리되어 리기어 기준으로 남는다.
17. 공개 데모는 로그인 없는 세션 안에서 대표 운영 흐름의 실제 결과까지 이어지고 운영 데이터와 방문자 사이에는 상태를 공유하지 않는다.
18. 체험 멤버·부재 일정 기능은 잔존 데이터 보호 절차를 거쳐 제거되고 어떤 운영 판정도 이에 의존하지 않는다.
19. 길드 전체·개인·운영진 알림은 수신자와 긴급도에 맞는 채널로 한 번만 전달되고 처리 결과는 기존 메시지와 동기화된다.
20. 동일 길드 재가입은 기존 회원 기록·잔액·이력·미완료 의무를 복구하고 운영 권한은 현재 Discord 역할에서 다시 계산한다.
21. 종료 이벤트는 변경 불가 확정본으로 남고, 사후 처리·정정은 연결된 추가 기록으로 보존되며 재사용은 참가 이력 없는 새 초안 복제로만 이뤄진다.
22. 길드 운영 시간대가 모든 일정·마감·자동화·달력 경계를 결정하고 개인 시간대는 개인 화면과 DM의 표시만 바꾼다.
23. 회원 공개 활동 링크는 본인이 켠 비목록 포트폴리오로 집계 성과만 보여주며 본인의 폐기·재발급과 길드 연결 폐기 즉시 이전 주소를 무효화한다.
24. 단일 길드 사용자는 바로 진입하고 다중 길드 전환은 둘 이상의 워크스페이스를 가진 사용자에게만 보조적으로 나타나며 모든 행동은 한 활성 길드 문맥에 격리된다.
25. 공개 길드 프로필은 길드 홍보·모집을 중심으로 안전한 통계를 보조 제공하고, 모집 마감이어도 페이지는 유지하되 가입 CTA만 제거하며 실제 지원은 Discord로 연결한다.
26. 새 길드는 필수 Discord·Albion·시간대 연결과 명시적인 리기어 미지원 또는 최소 지원 정책만 완료하면 회원 접근과 첫 이벤트를 시작하고, 나머지 선택 기능과 가이드는 activation을 막지 않는다.
27. 봇 제거와 장기 미사용은 데이터 보존형 일시 정지로 복구되며, 길드 영구 삭제는 열린 의무 해소·전용 권한자의 명시적 요청·30일 철회 기간·격리된 purge를 모두 거쳐 다른 길드와 전역 신원을 건드리지 않는다.
28. 개인 UI·개인 DM 언어는 사용자 전체에서 하나로 유지되고 길드 공용 문구는 길드 기본 언어를 사용하며, 공개 모집 언어와 운영진·회원 작성 원문은 각각 metadata와 불변 원문으로 분리된다.
29. 홈 길드 연결은 정상 도입에서 별도 대표권 인증을 요구하지 않으며 중복 연결이나 신빙성 있는 사칭 신고만 사후 분쟁으로 확인하고, 분쟁 중에는 공개 대표 표면만 중단한 채 tenant 데이터와 의무를 격리해 보존한다.
30. 전역 시스템 공지는 장애·점검·보안 영향에만 사용하는 만료 필수·단일 활성 서비스 안전 배너이며, 즉시 위험이 있는 긴급 공지만 사용자가 닫을 수 없다.
31. 상점 재고 베이스라인은 최초 도입·불일치 복구에만 전체 완제품 재고를 다시 확정하고, 평소 재고는 정상 입출고와 지급 사건으로 유지한다.
32. 자유 리기어는 출처가 구분된 실제 리기어 지원 통계에 포함되지만 신청자를 참가 사실로 간주하지 않아 이벤트 참가율·참여 보상·성과 통계를 바꾸지 않는다.
33. 기능별 운영 안내는 이벤트·리기어·상점의 반복 규칙을 해당 길드·페이지에서만 닫기 불가로 유지하고 일시 소식이나 외부 방송에 사용하지 않는다.
34. 회원 업무함은 현재 길드의 본인 행동 필요·길드 처리 대기·완료 이력을 분리하고 모든 처리 결과를 원본 기능과 운영진 업무함에 일관되게 반영한다.
35. 길드원 내부 명부는 현재 활성 회원의 안전한 활동 정보만 보여주고, 게스트·탈퇴 회원·사이트 미연결 인게임 인원·신원 문제와 관리 작업은 권한이 있는 운영진 명부로 분리한다.
36. 서비스 운영 도구는 조회 전용을 기본으로 하고 대리 조회에서 길드 업무를 수정하지 않으며, 예외 변경은 영향 미리보기·사유·재확인·idempotency·필수 서비스 운영 기록을 가진 목적별 복구 명령으로만 수행한다.
37. 다음 행동 홈은 활성 길드와 역할별로 임박 이벤트·행동 필요 업무·운영 차단 문제만 우선하고, 같은 원본 상태를 중복 없이 보여주며 게스트·연합 참가자를 허용 이벤트 문맥에 제한한다.
38. 공개 제품 문서는 네 언어로 현재 제품 사실을 설명하고, 인앱 운영 레시피는 현재 권한·기능 상태의 실행 도움만 제공하며, 도입 진행 체크리스트는 선택 설정의 비차단 완료 상태만 소유한다.
39. 공개 사용자는 인증 없이 공개 가치를 얻고 공유하며, 길드 운영진은 데모·문서·가격 검토 뒤 봇을 초대하고, 기존 사용자는 어느 공개 페이지에서도 도입 퍼널을 건너뛰어 자신의 길드로 바로 들어간다.
40. 안정적인 공개 표면과 동의한 길드 프로필만 검색에 노출되고 개별 결과는 색인 없이 공유되며, SEO 성과는 비식별 공개 가치 이용과 길드 도입 전환을 별도로 보여준다.
41. 미완성 서사형 랜딩은 검색·주 navigation에서 격리되고, 실제 길드 운영 루프와 제품 능력을 사실적으로 전달하는 네 언어·접근성·CTA 기준을 충족한 뒤 기존 canonical 마케팅 홈을 대체한다.
42. 상점과 리기어는 하나의 길드 시세 기준을 공유하되 모든 자동 가격에 출처·신뢰도를 표시하고, 주문·승인·제작 수락 때 고정된 업무 가격은 이후 시세·환율 변경으로 소급 계산하지 않는다.
43. 모든 발행 이벤트는 집결 시각에 관리자 조작 없이 운영 기준을 한 번만 시작하고 실제 전투 발생과 의미를 분리하며, 싸움이나 리기어가 없는 이벤트도 정상 종료한다.
44. 독립 사후 리포트와 평가형 AAR은 제거되고, 종료 이벤트 상세는 참가 대조와 남은 보상·리기어·제작·루팅 상태만 원본 기능과 같은 권한·상태로 자동 표시한다.
45. Menhera 콘텐츠 준수는 일반 고객 기능에서 격리되고, 최근 5일의 유효 영상은 Menhera의 새 포인트→실버 환전만 제한한다. 제출 성공 즉시 승인 없이 제한이 해제되며 전투 참가·리기어·포인트 적립·사용·양도·권한에는 영향을 주지 않는다.
46. 성취 배지는 객관적 길드 활동 이정표를 처음 달성할 때 해당 길드 회원 기록에 영구 귀속되고, 이후 집계 변화에도 유지되며 포인트·실버·리기어·기능 접근·권한·준수 판정에 영향을 주지 않는다.
47. 전투 성취는 공식 판정이 확인한 참가자 모두가 공유하는 팀 전투 위업을 중심으로 하고, 킬·생존처럼 직접 관측되는 개인 전투 위업은 역할 간 실력 평가가 아닌 보조 트랙으로만 제공한다.
48. 확인된 Albion 캐릭터명은 사이트의 게임 신원 기준으로 유지하되 Discord 서버 닉네임은 최초 연결·별도 길드 표시명이 없는 실제 캐릭터명 변경·운영진의 명시적 재적용 때만 best-effort로 적용하고 일반 refresh로 회원의 변경을 되돌리지 않는다.
49. 길드 표시명은 길드 회원 기록에 귀속되어 운영진이 길드별로 설정·해제할 수 있고, 확인된 Albion 캐릭터명·전역 사용자명·다른 길드 표시명과 분리되며 Discord 적용은 표시명 저장과 분리된 단건 작업으로 실행된다.
50. 무기 사용 통계는 실제 장착이 관측된 장비를 무기군·전투 단위로 집계해 개인의 자주 사용한 무기와 길드 조합 분포만 보여주며, 슬롯 배정·숙련도·실력 순위·보상·권한 판정과 분리된다.
51. 참가예정은 슬롯 확정 전 역할 가용성을 알리는 약한 신호로만 유지하고 승인 대기 중에는 보존하며 확정 배정 때 종료한다. 미배정 참가예정은 출석·노쇼·참여 보상·리기어·참가율·성과 통계의 근거가 아니다.

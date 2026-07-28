const localized = (ko, ja, zhCN, zhTW = zhCN) => ({
  ko,
  ja,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
})

const node = (name, description, descriptionLocalizations, type, options) => ({
  name,
  description,
  description_localizations: descriptionLocalizations,
  type,
  ...(options ? { options } : {}),
})

const subcommand = (name, description, descriptions, options) =>
  node(name, description, descriptions, 1, options)

const group = (name, description, descriptions, options) =>
  node(name, description, descriptions, 2, options)

const input = (name, description, descriptions, type, config = {}) => ({
  ...node(name, description, descriptions, type),
  ...config,
})

const choice = (name, names, value) => ({
  name,
  name_localizations: names,
  value,
})

const windowOption = () => input(
  'window',
  'Statistics period',
  localized('통계 기간', '集計期間', '统计周期', '統計期間'),
  3,
  {
    required: false,
    choices: [
      choice('This week', localized('이번 주', '今週', '本周', '本週'), 'week'),
      choice('Last 30 days', localized('최근 30일', '過去30日', '最近30天', '最近30天'), 'month'),
      choice('All tracked', localized('전체 추적 기간', '全追跡期間', '全部追踪期', '全部追蹤期'), 'all'),
    ],
  },
)

const autocompleteId = (name, description, descriptions) => input(
  name,
  description,
  descriptions,
  3,
  { required: true, autocomplete: true },
)

const positiveAmount = (name, description, descriptions) => input(
  name,
  description,
  descriptions,
  4,
  { required: true, min_value: 1, max_value: 2147483647 },
)

const memoOption = (required = false) => input(
  'memo',
  required ? 'Required audit memo' : 'Optional memo',
  required
    ? localized('필수 감사 메모', '必須監査メモ', '必填审计备注', '必填稽核備註')
    : localized('선택 메모', '任意メモ', '可选备注', '可選備註'),
  3,
  { required, max_length: 200 },
)

const commands = [
  subcommand(
    'setup',
    'Create or resume guild setup',
    localized('길드 설정을 만들거나 이어가기', 'ギルド設定を作成または再開', '创建或继续公会设置', '建立或繼續公會設定'),
  ),
  subcommand(
    'login',
    'Approve a browser sign-in code',
    localized('브라우저 로그인 코드 승인', 'ブラウザーログインコードを承認', '批准浏览器登录代码', '核准瀏覽器登入代碼'),
    [
      input(
        'code',
        'Code shown in the browser',
        localized('브라우저에 표시된 코드', 'ブラウザーに表示されたコード', '浏览器中显示的代码', '瀏覽器中顯示的代碼'),
        3,
        { required: true, min_length: 8, max_length: 9 },
      ),
    ],
  ),
  subcommand(
    'help',
    'Show the complete command guide',
    localized('전체 명령어 안내 보기', '全コマンドガイドを表示', '查看完整命令指南', '查看完整指令指南'),
  ),
  group(
    'me',
    'My account and verification',
    localized('내 계정과 인증', '自分のアカウントと認証', '我的账号与验证', '我的帳號與驗證'),
    [
      subcommand('summary', 'Show my guild summary', localized('내 길드 요약 보기', '自分のギルド概要を表示', '查看我的公会摘要', '查看我的公會摘要')),
      subcommand('verify', 'Refresh membership and verify Albion', localized('멤버십 갱신 및 Albion 인증', 'メンバーシップ更新と Albion 認証', '刷新成员身份并验证 Albion', '重新整理成員身分並驗證 Albion')),
    ],
  ),
  group(
    'event',
    'Event signup and status',
    localized('이벤트 신청과 상태', 'イベント申請と状態', '活动报名与状态', '活動報名與狀態'),
    [
      subcommand('next', 'Show the next event', localized('다음 이벤트 보기', '次のイベントを表示', '查看下一个活动', '查看下一個活動')),
      subcommand('browse', 'Browse open slots in the next event', localized('다음 이벤트 빈 슬롯 보기', '次のイベントの空き枠を表示', '浏览下个活动的空位', '瀏覽下個活動的空位')),
      subcommand('status', 'Show my next-event signup status', localized('다음 이벤트의 내 신청 상태', '次のイベントの自分の申請状態', '查看下个活动的报名状态', '查看下個活動的報名狀態')),
      subcommand('cancel', 'Cancel my event signup', localized('내 이벤트 신청 취소', '自分のイベント申請を取消', '取消我的活动报名', '取消我的活動報名'), [
        autocompleteId('event', 'Event to leave', localized('취소할 이벤트', '取消するイベント', '要退出的活动', '要退出的活動')),
      ]),
    ],
  ),
  group(
    'wallet',
    'Point wallet operations',
    localized('포인트 지갑 작업', 'ポイントウォレット操作', '积分钱包操作', '積分錢包操作'),
    [
      subcommand('balance', 'Show my point balance', localized('내 포인트 잔액 보기', '自分のポイント残高を表示', '查看我的积分余额', '查看我的積分餘額')),
      subcommand('send', 'Send points to a guild member', localized('길드원에게 포인트 보내기', 'メンバーにポイントを送る', '向公会成员发送积分', '向公會成員傳送積分'), [
        input('member', 'Member receiving points', localized('포인트를 받을 길드원', '受取メンバー', '接收积分的成员', '接收積分的成員'), 6, { required: true }),
        positiveAmount('amount', 'Points to send', localized('보낼 포인트', '送るポイント', '发送积分', '傳送積分')),
        memoOption(),
      ]),
      subcommand('withdraw', 'Request a point withdrawal', localized('포인트 출금 신청', 'ポイント出金を申請', '申请积分提现', '申請積分提領'), [
        positiveAmount('amount', 'Points to withdraw', localized('출금할 포인트', '出金するポイント', '要提现的积分', '要提領的積分')),
      ]),
      subcommand('history', 'Show recent point activity', localized('최근 포인트 내역 보기', '最近のポイント履歴を表示', '查看最近积分记录', '查看最近積分記錄')),
    ],
  ),
  group(
    'stats',
    'Tracked battle statistics',
    localized('추적 전투 통계', '追跡戦闘統計', '追踪战斗统计', '追蹤戰鬥統計'),
    [
      subcommand('me', 'Show my battle statistics', localized('내 전투 통계 보기', '自分の戦闘統計を表示', '查看我的战斗统计', '查看我的戰鬥統計'), [windowOption()]),
      subcommand('member', 'Show a member battle summary', localized('길드원 전투 요약 보기', 'メンバー戦闘概要を表示', '查看成员战斗摘要', '查看成員戰鬥摘要'), [
        input('member', 'Guild member', localized('길드원', 'ギルドメンバー', '公会成员', '公會成員'), 6, { required: true }),
        windowOption(),
      ]),
      subcommand('leaderboard', 'Show a guild leaderboard', localized('길드 리더보드 보기', 'ギルドランキングを表示', '查看公会排行榜', '查看公會排行榜'), [
        input('metric', 'Ranking metric', localized('순위 지표', 'ランキング指標', '排行指标', '排行指標'), 3, {
          required: true,
          choices: [
            choice('Kills', localized('킬', 'キル', '击杀', '擊殺'), 'kills'),
            choice('Participation', localized('참여', '参加', '参战', '參戰'), 'participation'),
            choice('Survival', localized('생존률', '生存率', '生存率', '生存率'), 'survival'),
            choice('K/D', localized('K/D', 'K/D', 'K/D', 'K/D'), 'kd'),
            choice('Win rate', localized('승률', '勝率', '胜率', '勝率'), 'winrate'),
          ],
        }),
        windowOption(),
      ]),
      subcommand('battle', 'Show a tracked battle summary', localized('추적 전투 요약 보기', '追跡戦闘概要を表示', '查看追踪战斗摘要', '查看追蹤戰鬥摘要'), [
        autocompleteId('battle', 'Tracked battle', localized('추적 전투', '追跡戦闘', '追踪战斗', '追蹤戰鬥')),
      ]),
    ],
  ),
  group(
    'regear',
    'Regear eligibility and requests',
    localized('리기어 자격과 신청', 'リギア資格と申請', '补装资格与申请', '補裝資格與申請'),
    [
      subcommand('eligible', 'Open exact regear eligibility', localized('정확한 리기어 신청 가능 목록 열기', '正確なリギア対象一覧を開く', '打开准确补装资格列表', '開啟準確補裝資格清單')),
      subcommand('status', 'Show my recent regear requests', localized('최근 리기어 신청 상태', '最近のリギア申請状態', '查看最近补装申请状态', '查看最近補裝申請狀態')),
    ],
  ),
  group(
    'craft',
    'Craft queue operations',
    localized('제작 큐 작업', 'クラフトキュー操作', '制作队列操作', '製作佇列操作'),
    [
      subcommand('queue', 'Show available craft tasks', localized('신규 제작 작업 보기', '利用可能なクラフト作業を表示', '查看可领取制作任务', '查看可領取製作任務')),
      subcommand('mine', 'Show my craft tasks', localized('내 제작 작업 보기', '自分のクラフト作業を表示', '查看我的制作任务', '查看我的製作任務')),
      subcommand('claim', 'Claim a craft task', localized('제작 작업 수주', 'クラフト作業を受注', '领取制作任务', '領取製作任務'), [autocompleteId('task', 'Queued craft task', localized('대기 중 제작 작업', '待機中クラフト作業', '待领取制作任务', '待領取製作任務'))]),
      subcommand('release', 'Release my craft task', localized('내 제작 작업 반납', '自分のクラフト作業を返却', '释放我的制作任务', '釋放我的製作任務'), [autocompleteId('task', 'Claimed craft task', localized('수주한 제작 작업', '受注済みクラフト作業', '已领取制作任务', '已領取製作任務'))]),
      subcommand('deliver', 'Deliver a completed craft task', localized('완료한 제작 작업 납품', '完成したクラフト作業を納品', '交付已完成制作任务', '交付已完成製作任務'), [
        autocompleteId('task', 'Claimed craft task', localized('수주한 제작 작업', '受注済みクラフト作業', '已领取制作任务', '已領取製作任務')),
        input('box', 'Guild chest box number', localized('길드 상자 번호', 'ギルドチェスト番号', '公会箱号', '公會箱號'), 4, { required: true, min_value: 1, max_value: 999 }),
        input('material-cost', 'Material silver cost', localized('재료 실버 비용', '材料シルバー費用', '材料银币成本', '材料銀幣成本'), 4, { required: true, min_value: 0, max_value: 2147483647 }),
      ]),
      subcommand('pickup', 'Confirm my crafted regear pickup', localized('제작 리기어 수령 확인', '製作リギアの受取確認', '确认领取制作补装', '確認領取製作補裝'), [autocompleteId('task', 'Delivered craft task', localized('납품된 제작 작업', '納品済みクラフト作業', '已交付制作任务', '已交付製作任務'))]),
    ],
  ),
  group(
    'siphon',
    'Siphoned energy account',
    localized('사이폰 에너지 계정', '吸収エネルギー口座', '虹吸能量账户', '虹吸能量帳戶'),
    [
      subcommand('balance', 'Show my siphon balance', localized('내 사이폰 잔액 보기', '自分の吸収残高を表示', '查看我的虹吸余额', '查看我的虹吸餘額')),
      subcommand('history', 'Show recent siphon activity', localized('최근 사이폰 내역 보기', '最近の吸収履歴を表示', '查看最近虹吸记录', '查看最近虹吸記錄')),
    ],
  ),
  group(
    'shop',
    'Guild shop orders',
    localized('길드 상점 주문', 'ギルドショップ注文', '公会商店订单', '公會商店訂單'),
    [
      subcommand('status', 'Show my recent shop orders', localized('최근 상점 주문 상태', '最近のショップ注文状態', '查看最近商店订单状态', '查看最近商店訂單狀態')),
      subcommand('order', 'Order one exact catalog item', localized('정확한 상점 아이템 하나 주문', '指定カタログ商品を注文', '订购一个指定商品', '訂購一個指定商品'), [
        autocompleteId('item', 'Shop catalog item', localized('상점 카탈로그 아이템', 'ショップ商品', '商店商品', '商店商品')),
        positiveAmount('quantity', 'Quantity', localized('수량', '数量', '数量', '數量')),
        memoOption(),
      ]),
      subcommand('reorder', 'Repeat a recent order at current price', localized('최근 주문을 현재 가격으로 재주문', '最近の注文を現行価格で再注文', '按当前价格再次下单', '按目前價格再次下單'), [
        autocompleteId('order', 'Previous shop order', localized('이전 상점 주문', '以前のショップ注文', '历史商店订单', '歷史商店訂單')),
        memoOption(),
      ]),
    ],
  ),
  group(
    'admin',
    'Guild administration',
    localized('길드 관리', 'ギルド管理', '公会管理', '公會管理'),
    [
      subcommand('approvals', 'Show pending approval actions', localized('처리 대기 승인 보기', '承認待ちを表示', '查看待审批事项', '查看待審批事項'), [
        input('kind', 'Approval category', localized('승인 종류', '承認種類', '审批类型', '審批類型'), 3, {
          required: false,
          choices: [
            choice('All', localized('전체', 'すべて', '全部', '全部'), 'all'),
            choice('Regear', localized('리기어', 'リギア', '补装', '補裝'), 'regear'),
            choice('Withdrawal', localized('출금', '出金', '提现', '提領'), 'exchange'),
            choice('Donation', localized('기부', '寄付', '捐赠', '捐贈'), 'donation'),
            choice('Shop', localized('상점', 'ショップ', '商店', '商店'), 'shop'),
            choice('Event payout', localized('이벤트 지급', 'イベント支給', '活动发放', '活動發放'), 'event_payout'),
            choice('Craft', localized('제작', 'クラフト', '制作', '製作'), 'craft'),
          ],
        }),
      ]),
      subcommand('event-create', 'Create a draft event', localized('초안 이벤트 생성', '下書きイベントを作成', '创建活动草稿', '建立活動草稿'), [
        input('title', 'Event title', localized('이벤트 제목', 'イベント名', '活动标题', '活動標題'), 3, { required: true, max_length: 100 }),
        input('category', 'Event category', localized('이벤트 종류', 'イベント種類', '活动类型', '活動類型'), 3, {
          required: false,
          choices: [
            choice('Combat', localized('전투', '戦闘', '战斗', '戰鬥'), '전투'),
            choice('Faction Fight', localized('FF', 'FF', '阵营战', '陣營戰'), 'FF'),
            choice('Ganking', localized('갱킹', 'ギャンク', '抓人', '抓人'), '갱킹'),
          ],
        }),
      ]),
      subcommand('event-start', 'Mark an event battle as started', localized('이벤트 전투 시작 처리', 'イベント戦闘を開始済みにする', '标记活动战斗开始', '標記活動戰鬥開始'), [autocompleteId('event', 'Published event', localized('발행된 이벤트', '公開済みイベント', '已发布活动', '已發布活動'))]),
      subcommand('points', 'Grant or deduct member points', localized('길드원 포인트 지급 또는 차감', 'メンバーポイントを付与または差し引き', '发放或扣除成员积分', '發放或扣除成員積分'), [
        input('member', 'Member to adjust', localized('조정할 길드원', '調整するメンバー', '要调整的成员', '要調整的成員'), 6, { required: true }),
        input('delta', 'Positive grants, negative deducts', localized('양수 지급, 음수 차감', '正数付与、負数差引', '正数发放，负数扣除', '正數發放，負數扣除'), 4, { required: true, min_value: -2147483647, max_value: 2147483647 }),
        memoOption(true),
      ]),
      subcommand('quick-publish', 'Publish or update the member panel here', localized('이 채널의 길드원 패널 게시/갱신', 'このチャンネルのメンバーパネルを投稿/更新', '在此频道发布或更新成员面板', '在此頻道發布或更新成員面板'), [
        input('message', 'Optional panel text; {name} is the guild', localized('선택 패널 문구; {name}=길드명', '任意パネル文; {name}=ギルド名', '可选面板文本；{name}=公会名', '可選面板文字；{name}=公會名'), 3, { required: false, max_length: 1500 }),
      ]),
      subcommand('dashboard', 'Open the admin dashboard', localized('관리자 대시보드 열기', '管理者ダッシュボードを開く', '打开管理员面板', '開啟管理員面板')),
    ],
  ),
]

const discordCommandCatalog = [
  {
    name: 'agm',
    description: 'Albion Guild Manager commands',
    description_localizations: localized(
      'Albion Guild Manager 명령어',
      'Albion Guild Manager コマンド',
      'Albion Guild Manager 命令',
      'Albion Guild Manager 指令',
    ),
    type: 1,
    options: commands,
  },
]

export default discordCommandCatalog

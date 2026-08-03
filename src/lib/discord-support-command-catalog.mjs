const localized = (ko, ja, zhCN, zhTW = zhCN) => ({
  ko,
  ja,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
})

const input = (name, description, descriptions, type, config = {}) => ({
  name,
  description,
  description_localizations: descriptions,
  type,
  ...config,
})

const subcommand = (name, description, descriptions, options = []) => ({
  name,
  description,
  description_localizations: descriptions,
  type: 1,
  ...(options.length > 0 ? { options } : {}),
})

const discordSupportCommandCatalog = [
  {
    name: 'support',
    description: 'Official support ticket operations',
    description_localizations: localized(
      '공식 지원 티켓 운영',
      '公式サポートチケット管理',
      '官方支持工单管理',
      '官方支援工單管理',
    ),
    type: 1,
    options: [
      subcommand(
        'setup',
        'Configure the support ticket hub',
        localized('지원 티켓 허브 설정', 'サポートハブを設定', '配置支持工单中心', '設定支援工單中心'),
        [
          input('parent', 'Ticket hub text channel', localized('티켓 허브 텍스트 채널', 'チケットハブのテキストチャンネル', '工单中心文字频道', '工單中心文字頻道'), 7, { required: true }),
          input('log', 'Private staff log channel', localized('운영진 로그 채널', 'スタッフログチャンネル', '工作人员日志频道', '工作人員日誌頻道'), 7, { required: true }),
          input('staff-role', 'Support staff role', localized('지원팀 역할', 'サポート担当ロール', '支持人员身份组', '支援人員身分組'), 8, { required: true }),
        ],
      ),
      subcommand(
        'panel',
        'Publish or repair the ticket panel',
        localized('티켓 패널 게시 또는 복구', 'チケットパネルを投稿または修復', '发布或修复工单面板', '發布或修復工單面板'),
      ),
      subcommand(
        'reopen',
        'Reopen a closed ticket',
        localized('종료된 티켓 재개', '終了したチケットを再開', '重新打开已关闭工单', '重新開啟已關閉工單'),
        [
          input('ticket', 'Ticket number, for example T-000123', localized('티켓 번호 (예: T-000123)', 'チケット番号（例: T-000123）', '工单编号（例如 T-000123）', '工單編號（例如 T-000123）'), 3, { required: true, min_length: 1, max_length: 20 }),
        ],
      ),
    ],
  },
]

export default discordSupportCommandCatalog

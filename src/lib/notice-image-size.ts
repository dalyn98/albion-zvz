export const NOTICE_IMAGE_SIZE_VALUES = ['full', 'large', 'medium', 'small'] as const

export type NoticeImageSize = (typeof NOTICE_IMAGE_SIZE_VALUES)[number]

export function normalizeNoticeImageSize(value: string | null | undefined): NoticeImageSize {
  return NOTICE_IMAGE_SIZE_VALUES.includes(value as NoticeImageSize)
    ? (value as NoticeImageSize)
    : 'full'
}

export const EVENT_PARTICIPATION_AUTO_CLOSEOUT_DEFAULT_HOURS = 6
export const EVENT_PARTICIPATION_AUTO_CLOSEOUT_MIN_HOURS = 1
export const EVENT_PARTICIPATION_AUTO_CLOSEOUT_MAX_HOURS = 72

export function normalizeEventParticipationAutoCloseoutHours(
  value: unknown,
): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) &&
    parsed >= EVENT_PARTICIPATION_AUTO_CLOSEOUT_MIN_HOURS &&
    parsed <= EVENT_PARTICIPATION_AUTO_CLOSEOUT_MAX_HOURS
    ? parsed
    : EVENT_PARTICIPATION_AUTO_CLOSEOUT_DEFAULT_HOURS
}

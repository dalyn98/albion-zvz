import type { RegearType } from '@/types'

export function shouldShowKillboardUnverified(input: {
  requestType: RegearType
  killboardVerified: boolean
  status: 'pending' | 'approved' | 'rejected'
}): boolean {
  return input.requestType !== 'overcharge' && !input.killboardVerified && input.status === 'pending'
}

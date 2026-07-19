export type OffhandCdrType = 'TORCH' | 'HORN_KEEPER' | 'JESTERCANE_HELL' | 'TOME_CRYSTAL'

export interface CooldownSource {
  key: 'head' | 'armor' | 'shoes' | 'food' | 'offhand'
  itemId: string
  spell: string
  cdr: number
  offhandType?: OffhandCdrType
}

export interface EffectiveCooldown {
  baseCd: number
  sources: CooldownSource[]
  totalRaw: number
  effectiveCd: number
}

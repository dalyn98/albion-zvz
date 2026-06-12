const PARTY_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export interface EventSlotCodeParts {
  partyNumber: number
  slotNumber: number
}

export function eventSlotCode(parts: EventSlotCodeParts): string {
  const { partyNumber, slotNumber } = parts
  const slot = String(slotNumber).padStart(2, '0')
  if (partyNumber >= 1 && partyNumber <= PARTY_LETTERS.length) {
    return `${PARTY_LETTERS[partyNumber - 1]}${slot}`
  }
  return `P${partyNumber}-${slot}`
}

export function parseEventSlotCode(raw: string): EventSlotCodeParts | null {
  const normalized = raw.trim().toUpperCase().replace(/\s+/g, '')
  if (!normalized) return null

  const letterMatch = normalized.match(/^([A-Z])[-_]?(\d{1,2})$/)
  if (letterMatch) {
    return normalizeParts({
      partyNumber: PARTY_LETTERS.indexOf(letterMatch[1]) + 1,
      slotNumber: Number(letterMatch[2]),
    })
  }

  const partyMatch = normalized.match(/^P?(\d{1,2})[-_](\d{1,2})$/)
  if (partyMatch) {
    return normalizeParts({
      partyNumber: Number(partyMatch[1]),
      slotNumber: Number(partyMatch[2]),
    })
  }

  return null
}

function normalizeParts(parts: EventSlotCodeParts): EventSlotCodeParts | null {
  if (!Number.isInteger(parts.partyNumber) || parts.partyNumber < 1 || parts.partyNumber > 99) {
    return null
  }
  if (!Number.isInteger(parts.slotNumber) || parts.slotNumber < 1 || parts.slotNumber > 99) {
    return null
  }
  return parts
}

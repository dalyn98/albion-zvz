import { timingSafeEqual } from 'node:crypto'
import { EVENT_CATEGORIES, type EventCategory } from '@/types'
import {
  ALL_CAPABILITIES,
  CAP,
  CAPABILITY_PRESETS,
  type CapabilityPresetKey,
  getCapabilityPresetBits,
  serializeCapabilities,
} from '@/lib/permissions'
import { sanitizeInternalReturnTo } from '@/lib/safe-return-to'
import type { SessionPayload } from '@/lib/session'

export const TEST_AUTH_SECRET_HEADER = 'x-test-auth-secret'

const TEST_AUTH_BASE_ROLES = [
  'admin',
  'member',
  'eventCreator',
  'bombSquadCaller',
  'localGuildAccount',
  'guest',
] as const

export const TEST_AUTH_PRESET_ROLES = [
  'regearOfficer',
  'shopQuartermaster',
  'logOfficer',
  'craftLead',
  'analyst',
  'guildSettings',
] as const satisfies readonly CapabilityPresetKey[]

export const TEST_AUTH_ROLES = [
  ...TEST_AUTH_BASE_ROLES,
  ...TEST_AUTH_PRESET_ROLES,
] as const

export type TestAuthRole = (typeof TEST_AUTH_ROLES)[number]

interface TestAuthEnv extends Record<string, string | undefined> {
  ENABLE_TEST_AUTH?: string
  NODE_ENV?: string
  TEST_AUTH_SECRET?: string
  VERCEL_ENV?: string
}

export interface BuildTestSessionInput {
  role: TestAuthRole
  guildId: string
  discordId?: string
  username?: string
  avatar?: string | null
  eventScope?: string | null
}

export function isTestAuthRouteEnabled(env: TestAuthEnv = process.env): boolean {
  if (env.VERCEL_ENV) {
    if (env.VERCEL_ENV === 'production') return false
  } else if (env.NODE_ENV === 'production') {
    return false
  }
  return (
    env.ENABLE_TEST_AUTH === 'true' &&
    typeof env.TEST_AUTH_SECRET === 'string' &&
    env.TEST_AUTH_SECRET.length >= 16
  )
}

export function isValidTestAuthSecret(candidate: string | null, env: TestAuthEnv = process.env): boolean {
  const expected = env.TEST_AUTH_SECRET
  if (!expected || expected.length < 16 || !candidate) return false
  const expectedBytes = Buffer.from(expected)
  const candidateBytes = Buffer.from(candidate)
  if (expectedBytes.length !== candidateBytes.length) return false
  return timingSafeEqual(expectedBytes, candidateBytes)
}

export function parseTestAuthRole(value: unknown): TestAuthRole | null {
  return typeof value === 'string' && (TEST_AUTH_ROLES as readonly string[]).includes(value)
    ? (value as TestAuthRole)
    : null
}

export function sanitizeTestAuthReturnTo(value: unknown): string {
  return sanitizeInternalReturnTo(value)
}

function roleCapabilities(role: TestAuthRole): string {
  if (role === 'admin') return serializeCapabilities(ALL_CAPABILITIES)
  if (role === 'eventCreator') {
    return serializeCapabilities(
      CAP.EVENT_CREATE_COMBAT |
        CAP.EVENT_CREATE_FF |
        CAP.EVENT_CREATE_GANKING |
        CAP.EVENT_MANAGE,
    )
  }
  const preset = CAPABILITY_PRESETS.find((candidate) => candidate.key === role)
  if (preset) {
    return serializeCapabilities(getCapabilityPresetBits(preset.capabilities))
  }
  return '0'
}

function eventCreatorCategories(role: TestAuthRole): EventCategory[] {
  return role === 'admin' || role === 'eventCreator'
    ? ([...EVENT_CATEGORIES] as EventCategory[])
    : []
}

export function buildTestSession(input: BuildTestSessionInput): SessionPayload {
  const isAdmin = input.role === 'admin'
  const isGuest = input.role === 'guest'
  const isBombSquadCaller = input.role === 'bombSquadCaller'
  const isLocalGuildAccount = input.role === 'localGuildAccount'
  const categories = eventCreatorCategories(input.role)
  const discordId = input.discordId?.trim() || `test-auth:${input.role}`
  const username = input.username?.trim() || `Test ${input.role}`

  return {
    discordId,
    username,
    avatar: input.avatar ?? null,
    isMember: !isGuest && !isBombSquadCaller,
    isAdmin,
    isGuest,
    isBombSquadCaller,
    isLocalGuildAccount,
    isAllianceCandidate: false,
    canCreateEvents: categories.length > 0,
    eventCreatorCategories: categories,
    eventScope: isGuest ? input.eventScope ?? null : null,
    guildId: input.guildId,
    capabilities: roleCapabilities(input.role),
    issuedAt: Date.now(),
  }
}

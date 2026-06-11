import { getAdminClient } from '@/lib/supabase-admin'
import {
  cleanTacticCallout,
  cleanTacticRoleCallouts,
  createDefaultTacticBoardState,
  validateTacticBoardState,
  type TacticBoardState,
  type TacticBoardStatus,
  type TacticTerrain,
  type TacticVisibility,
  type TacticRoleFocus,
} from './schema'
import { hashTacticShareToken, isValidTacticShareToken } from './share-token'

const BOARD_COLUMNS =
  'id, guild_id, title, summary, terrain_type, status, visibility, tags, created_by, updated_by, created_at, updated_at'

const STEP_COLUMNS =
  'id, guild_id, board_id, step_order, title, callout, role_callouts, board_state, duration_seconds, created_at, updated_at'

interface TacticBoardRow {
  id: string
  guild_id: string
  title: string
  summary: string | null
  terrain_type: string
  status: string
  visibility: string
  tags: string[] | null
  created_by: string | null
  updated_by: string | null
  created_at: string
  updated_at: string
}

interface TacticStepRow {
  id: string
  guild_id: string
  board_id: string
  step_order: number
  title: string
  callout: string | null
  role_callouts: unknown
  board_state: unknown
  duration_seconds: number
  created_at: string
  updated_at: string
}

interface TacticShareLinkRow {
  id: string
  guild_id: string
  board_id: string
  expires_at: string | null
  revoked_at: string | null
}

export interface TacticBoardSummary {
  id: string
  title: string
  summary: string
  terrainType: TacticTerrain
  status: TacticBoardStatus
  visibility: TacticVisibility
  tags: string[]
  createdBy: string | null
  updatedBy: string | null
  createdAt: string
  updatedAt: string
  stepCount: number
}

export interface TacticStepRecord {
  id: string
  stepOrder: number
  title: string
  callout: string
  roleCallouts: Partial<Record<TacticRoleFocus, string>>
  boardState: TacticBoardState
  durationSeconds: number
  createdAt: string
  updatedAt: string
}

export interface TacticBoardDocument {
  board: TacticBoardSummary
  steps: TacticStepRecord[]
}

function asTerrain(value: string): TacticTerrain {
  if (
    value === 'open-field' ||
    value === 'choke' ||
    value === 'bridge' ||
    value === 'gate' ||
    value === 'castle' ||
    value === 'territory'
  ) {
    return value
  }
  return 'open-field'
}

function asStatus(value: string): TacticBoardStatus {
  if (value === 'published' || value === 'archived') return value
  return 'draft'
}

function asVisibility(value: string): TacticVisibility {
  if (value === 'guild' || value === 'share') return value
  return 'private'
}

function mapBoard(row: TacticBoardRow, stepCount: number): TacticBoardSummary {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary ?? '',
    terrainType: asTerrain(row.terrain_type),
    status: asStatus(row.status),
    visibility: asVisibility(row.visibility),
    tags: row.tags ?? [],
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    stepCount,
  }
}

function mapStep(row: TacticStepRow, terrain: TacticTerrain): TacticStepRecord {
  const result = validateTacticBoardState(row.board_state)
  return {
    id: row.id,
    stepOrder: row.step_order,
    title: row.title,
    callout: cleanTacticCallout(row.callout),
    roleCallouts: cleanTacticRoleCallouts(row.role_callouts),
    boardState: result.ok ? result.state : createDefaultTacticBoardState(terrain),
    durationSeconds: row.duration_seconds,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function countStepsByBoardId(
  guildId: string,
  boardIds: readonly string[],
): Promise<Map<string, number>> {
  if (boardIds.length === 0) return new Map()
  const db = getAdminClient()
  const { data } = await db
    .from('tactic_steps')
    .select('board_id')
    .eq('guild_id', guildId)
    .in('board_id', [...boardIds])
  const counts = new Map<string, number>()
  for (const row of (data ?? []) as Array<{ board_id: string }>) {
    counts.set(row.board_id, (counts.get(row.board_id) ?? 0) + 1)
  }
  return counts
}

export async function listTacticBoards(guildId: string): Promise<TacticBoardSummary[]> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('tactic_boards')
    .select(BOARD_COLUMNS)
    .eq('guild_id', guildId)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as TacticBoardRow[]
  const counts = await countStepsByBoardId(guildId, rows.map((row) => row.id))
  return rows.map((row) => mapBoard(row, counts.get(row.id) ?? 0))
}

export async function listPublishedTacticBoards(guildId: string): Promise<TacticBoardSummary[]> {
  const db = getAdminClient()
  const { data, error } = await db
    .from('tactic_boards')
    .select(BOARD_COLUMNS)
    .eq('guild_id', guildId)
    .eq('status', 'published')
    .in('visibility', ['guild', 'share'])
    .order('updated_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as TacticBoardRow[]
  const counts = await countStepsByBoardId(guildId, rows.map((row) => row.id))
  return rows.map((row) => mapBoard(row, counts.get(row.id) ?? 0))
}

export async function loadTacticBoardDocument(
  guildId: string,
  boardId: string,
): Promise<TacticBoardDocument | null> {
  const db = getAdminClient()
  const { data: boardData, error: boardError } = await db
    .from('tactic_boards')
    .select(BOARD_COLUMNS)
    .eq('guild_id', guildId)
    .eq('id', boardId)
    .maybeSingle()
  if (boardError) throw new Error(boardError.message)
  if (!boardData) return null

  const boardRow = boardData as TacticBoardRow
  const { data: stepData, error: stepError } = await db
    .from('tactic_steps')
    .select(STEP_COLUMNS)
    .eq('guild_id', guildId)
    .eq('board_id', boardId)
    .order('step_order', { ascending: true })
  if (stepError) throw new Error(stepError.message)

  const terrain = asTerrain(boardRow.terrain_type)
  const steps = ((stepData ?? []) as TacticStepRow[]).map((row) => mapStep(row, terrain))
  return {
    board: mapBoard(boardRow, steps.length),
    steps,
  }
}

export async function loadPublishedTacticBoardDocument(
  guildId: string,
  boardId: string,
): Promise<TacticBoardDocument | null> {
  const document = await loadTacticBoardDocument(guildId, boardId)
  if (!document || document.board.status !== 'published') return null
  return document
}

export async function loadTacticBoardDocumentByShareToken(
  token: string,
): Promise<TacticBoardDocument | null> {
  if (!isValidTacticShareToken(token)) return null
  const db = getAdminClient()
  const { data: linkData, error: linkError } = await db
    .from('tactic_share_links')
    .select('id, guild_id, board_id, expires_at, revoked_at')
    .eq('token_hash', hashTacticShareToken(token))
    .maybeSingle()
  if (linkError) throw new Error(linkError.message)
  const link = linkData as TacticShareLinkRow | null
  if (!link || link.revoked_at) return null
  if (link.expires_at && new Date(link.expires_at).getTime() <= Date.now()) return null

  const document = await loadTacticBoardDocument(link.guild_id, link.board_id)
  if (!document || document.board.status !== 'published') return null
  if (document.board.visibility !== 'share') return null
  return document
}

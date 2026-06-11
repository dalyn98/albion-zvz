'use server'

import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { getSession, sessionHasAny, type SessionPayload } from '@/lib/session'
import { getSessionGuildId } from '@/lib/tenant'
import { TACTIC_MANAGE_CAPS, TACTIC_PUBLISH_CAPS } from '@/lib/tactics/access'
import {
  MAX_TACTIC_STEPS,
  cleanTacticCallout,
  cleanTacticDuration,
  cleanTacticRoleCallouts,
  cleanTacticSummary,
  cleanTacticTitle,
  createDefaultTacticBoardState,
  validateTacticBoardState,
  type TacticTerrain,
} from '@/lib/tactics/schema'
import { createTacticShareToken, hashTacticShareToken } from '@/lib/tactics/share-token'

type AdminDb = ReturnType<typeof getAdminClient>

interface ActionContext {
  db: AdminDb
  session: SessionPayload
  guildId: string
}

interface ActionResult {
  error?: string
}

interface CreateTacticBoardInput {
  title: string
  summary?: string
  terrainType?: TacticTerrain
}

interface UpdateTacticBoardInput {
  boardId: string
  title: string
  summary: string
}

interface SaveTacticStepInput {
  boardId: string
  stepId: string
  title: string
  callout: string
  roleCallouts?: unknown
  boardState: unknown
  durationSeconds: number
}

async function getActionContext(capabilities: readonly bigint[]): Promise<ActionContext> {
  const session = await getSession()
  if (!session || !sessionHasAny(session, capabilities)) throw new Error('Unauthorized')
  return {
    db: getAdminClient(),
    session,
    guildId: await getSessionGuildId(session),
  }
}

function actor(session: SessionPayload): string {
  return session.discordId
}

async function ensureBoard(
  db: AdminDb,
  guildId: string,
  boardId: string,
): Promise<{ id: string; terrain_type: TacticTerrain } | null> {
  const { data, error } = await db
    .from('tactic_boards')
    .select('id, terrain_type')
    .eq('guild_id', guildId)
    .eq('id', boardId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const terrain = data.terrain_type as TacticTerrain
  return { id: data.id as string, terrain_type: terrain }
}

async function countSteps(db: AdminDb, guildId: string, boardId: string): Promise<number> {
  const { count, error } = await db
    .from('tactic_steps')
    .select('id', { count: 'exact', head: true })
    .eq('guild_id', guildId)
    .eq('board_id', boardId)
  if (error) throw new Error(error.message)
  return count ?? 0
}

async function nextStepOrder(db: AdminDb, guildId: string, boardId: string): Promise<number> {
  const { data, error } = await db
    .from('tactic_steps')
    .select('step_order')
    .eq('guild_id', guildId)
    .eq('board_id', boardId)
    .order('step_order', { ascending: false })
    .limit(1)
  if (error) throw new Error(error.message)
  const last = (data?.[0]?.step_order as number | undefined) ?? -1
  return last + 1
}

function revalidateTacticPaths(boardId: string): void {
  revalidatePath('/admin/dashboard/tactics')
  revalidatePath(`/admin/dashboard/tactics/${boardId}`)
  revalidatePath(`/tactics/${boardId}`)
}

async function requestOrigin(): Promise<string> {
  const headerStore = await headers()
  const host = headerStore.get('x-forwarded-host') ?? headerStore.get('host') ?? ''
  const proto = headerStore.get('x-forwarded-proto') ?? 'https'
  return host ? `${proto}://${host}` : ''
}

export async function createTacticBoard(
  input: CreateTacticBoardInput,
): Promise<ActionResult & { id?: string }> {
  const tErr = await getTranslations('adminActionError')
  const t = await getTranslations('tactics')
  try {
    const title = cleanTacticTitle(input.title)
    if (!title) return { error: tErr('tacticTitleRequired') }
    const terrainType = input.terrainType ?? 'open-field'
    const { db, session, guildId } = await getActionContext(TACTIC_MANAGE_CAPS)
    const nowActor = actor(session)

    const { data: board, error: boardError } = await db
      .from('tactic_boards')
      .insert({
        guild_id: guildId,
        title,
        summary: cleanTacticSummary(input.summary),
        terrain_type: terrainType,
        status: 'draft',
        visibility: 'private',
        created_by: nowActor,
        updated_by: nowActor,
      })
      .select('id')
      .single()
    if (boardError) return { error: boardError.message }

    const boardId = board.id as string
    const { error: stepError } = await db.from('tactic_steps').insert({
      guild_id: guildId,
      board_id: boardId,
      step_order: 0,
      title: t('defaultStepTitle'),
      callout: t('defaultStepCallout'),
      role_callouts: {},
      board_state: createDefaultTacticBoardState(terrainType),
      duration_seconds: 6,
    })
    if (stepError) {
      await db.from('tactic_boards').delete().eq('guild_id', guildId).eq('id', boardId)
      return { error: stepError.message }
    }

    revalidatePath('/admin/dashboard/tactics')
    return { id: boardId }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function updateTacticBoard(
  input: UpdateTacticBoardInput,
): Promise<ActionResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const title = cleanTacticTitle(input.title)
    if (!title) return { error: tErr('tacticTitleRequired') }
    const { db, session, guildId } = await getActionContext(TACTIC_MANAGE_CAPS)
    const board = await ensureBoard(db, guildId, input.boardId)
    if (!board) return { error: tErr('tacticNotFound') }
    const { error } = await db
      .from('tactic_boards')
      .update({
        title,
        summary: cleanTacticSummary(input.summary),
        updated_by: actor(session),
        updated_at: new Date().toISOString(),
      })
      .eq('guild_id', guildId)
      .eq('id', input.boardId)
    if (error) return { error: error.message }
    revalidateTacticPaths(input.boardId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function saveTacticStep(input: SaveTacticStepInput): Promise<ActionResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const title = cleanTacticTitle(input.title)
    if (!title) return { error: tErr('tacticStepTitleRequired') }
    const stateResult = validateTacticBoardState(input.boardState)
    if (!stateResult.ok) return { error: tErr(`tacticState_${stateResult.code}`) }
    const { db, session, guildId } = await getActionContext(TACTIC_MANAGE_CAPS)
    const board = await ensureBoard(db, guildId, input.boardId)
    if (!board) return { error: tErr('tacticNotFound') }

    const { error } = await db
      .from('tactic_steps')
      .update({
        title,
        callout: cleanTacticCallout(input.callout),
        role_callouts: cleanTacticRoleCallouts(input.roleCallouts),
        board_state: stateResult.state,
        duration_seconds: cleanTacticDuration(input.durationSeconds),
        updated_at: new Date().toISOString(),
      })
      .eq('guild_id', guildId)
      .eq('board_id', input.boardId)
      .eq('id', input.stepId)
    if (error) return { error: error.message }

    await db
      .from('tactic_boards')
      .update({ updated_by: actor(session), updated_at: new Date().toISOString() })
      .eq('guild_id', guildId)
      .eq('id', input.boardId)
    revalidateTacticPaths(input.boardId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function createTacticStep(
  boardId: string,
  sourceStepId?: string,
): Promise<ActionResult & { id?: string }> {
  const tErr = await getTranslations('adminActionError')
  const t = await getTranslations('tactics')
  try {
    const { db, guildId } = await getActionContext(TACTIC_MANAGE_CAPS)
    const board = await ensureBoard(db, guildId, boardId)
    if (!board) return { error: tErr('tacticNotFound') }
    const currentCount = await countSteps(db, guildId, boardId)
    if (currentCount >= MAX_TACTIC_STEPS) return { error: tErr('tacticTooManySteps') }

    let boardState = createDefaultTacticBoardState(board.terrain_type)
    let callout = ''
    if (sourceStepId) {
      const { data: source, error: sourceError } = await db
        .from('tactic_steps')
        .select('board_state, callout')
        .eq('guild_id', guildId)
        .eq('board_id', boardId)
        .eq('id', sourceStepId)
        .maybeSingle()
      if (sourceError) return { error: sourceError.message }
      const result = validateTacticBoardState(source?.board_state)
      if (result.ok) boardState = result.state
      callout = cleanTacticCallout(source?.callout)
    }

    const order = await nextStepOrder(db, guildId, boardId)
    const { data, error } = await db
      .from('tactic_steps')
      .insert({
        guild_id: guildId,
        board_id: boardId,
        step_order: order,
        title: t('newStepTitle', { number: order + 1 }),
        callout,
        role_callouts: {},
        board_state: boardState,
        duration_seconds: 6,
      })
      .select('id')
      .single()
    if (error) return { error: error.message }
    revalidateTacticPaths(boardId)
    return { id: data.id as string }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function deleteTacticStep(boardId: string, stepId: string): Promise<ActionResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const { db, guildId } = await getActionContext(TACTIC_MANAGE_CAPS)
    const board = await ensureBoard(db, guildId, boardId)
    if (!board) return { error: tErr('tacticNotFound') }
    const currentCount = await countSteps(db, guildId, boardId)
    if (currentCount <= 1) return { error: tErr('tacticLastStep') }
    const { error } = await db
      .from('tactic_steps')
      .delete()
      .eq('guild_id', guildId)
      .eq('board_id', boardId)
      .eq('id', stepId)
    if (error) return { error: error.message }
    revalidateTacticPaths(boardId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function publishTacticBoard(boardId: string): Promise<ActionResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const { db, session, guildId } = await getActionContext(TACTIC_PUBLISH_CAPS)
    const board = await ensureBoard(db, guildId, boardId)
    if (!board) return { error: tErr('tacticNotFound') }
    const currentCount = await countSteps(db, guildId, boardId)
    if (currentCount < 1) return { error: tErr('tacticNeedsStep') }
    const { error } = await db
      .from('tactic_boards')
      .update({
        status: 'published',
        visibility: 'guild',
        updated_by: actor(session),
        updated_at: new Date().toISOString(),
      })
      .eq('guild_id', guildId)
      .eq('id', boardId)
    if (error) return { error: error.message }
    revalidateTacticPaths(boardId)
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function archiveTacticBoard(boardId: string): Promise<ActionResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const { db, session, guildId } = await getActionContext(TACTIC_MANAGE_CAPS)
    const board = await ensureBoard(db, guildId, boardId)
    if (!board) return { error: tErr('tacticNotFound') }
    const { error } = await db
      .from('tactic_boards')
      .update({
        status: 'archived',
        updated_by: actor(session),
        updated_at: new Date().toISOString(),
      })
      .eq('guild_id', guildId)
      .eq('id', boardId)
    if (error) return { error: error.message }
    revalidatePath('/admin/dashboard/tactics')
    return {}
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

export async function createTacticShareLink(
  boardId: string,
): Promise<ActionResult & { url?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const { db, session, guildId } = await getActionContext(TACTIC_PUBLISH_CAPS)
    const board = await ensureBoard(db, guildId, boardId)
    if (!board) return { error: tErr('tacticNotFound') }
    const token = createTacticShareToken()
    const { error: insertError } = await db.from('tactic_share_links').insert({
      guild_id: guildId,
      board_id: boardId,
      token_hash: hashTacticShareToken(token),
      created_by: actor(session),
    })
    if (insertError) return { error: insertError.message }

    const { error: updateError } = await db
      .from('tactic_boards')
      .update({
        status: 'published',
        visibility: 'share',
        updated_by: actor(session),
        updated_at: new Date().toISOString(),
      })
      .eq('guild_id', guildId)
      .eq('id', boardId)
    if (updateError) return { error: updateError.message }

    revalidateTacticPaths(boardId)
    const origin = await requestOrigin()
    return { url: `${origin}/tactics/share/${token}` }
  } catch (e) {
    return { error: e instanceof Error ? e.message : tErr('serverError') }
  }
}

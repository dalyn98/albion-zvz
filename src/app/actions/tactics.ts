'use server'


import { publicActionError } from '@/lib/public-action-error'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { getAdminClient } from '@/lib/supabase-admin'
import { sessionHasAny, type SessionPayload } from '@/lib/session'
import { requireLiveSession } from '@/lib/auth'
import { getSessionGuildId } from '@/lib/tenant'
import { TACTIC_MANAGE_CAPS, TACTIC_PUBLISH_CAPS } from '@/lib/tactics/access'
import {
  prepareTacticDocumentSave,
  type TacticDocumentStepSaveInput,
} from '@/lib/tactics/document-save'
import {
  MAX_TACTIC_STEPS,
  cleanTacticCallout,
  cleanTacticDuration,
  cleanTacticGuidance,
  cleanTacticNextStepLinks,
  cleanTacticRoleCallouts,
  cleanTacticSummary,
  cleanTacticTitle,
  createDefaultTacticBoardState,
  createDefaultTacticGuidance,
  validateTacticBoardState,
  type TacticGuidance,
  type TacticNextStepLink,
  type TacticTerrain,
} from '@/lib/tactics/schema'
import {
  createTacticShareToken,
  defaultTacticShareExpiresAt,
  hashTacticShareToken,
} from '@/lib/tactics/share-token'
import {
  isTacticsExperimentalDisabledError,
  requireTacticsExperimentalEnabled,
} from '@/lib/tactics/feature-server'

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
  guidance?: unknown
  nextStepLinks?: unknown
  boardState: unknown
  durationSeconds: number
}

interface SaveTacticDocumentInput {
  boardId: string
  expectedUpdatedAt: string
  title: string
  summary: string
  steps: readonly TacticDocumentStepSaveInput[]
}

async function getActionContext(capabilities: readonly bigint[]): Promise<ActionContext> {
  const session = await requireLiveSession()
  if (!sessionHasAny(session, capabilities)) throw new Error('Unauthorized')
  const guildId = await getSessionGuildId(session)
  await requireTacticsExperimentalEnabled(guildId)
  return {
    db: getAdminClient(),
    session,
    guildId,
  }
}

async function tacticActionError(error: unknown): Promise<string> {
  if (isTacticsExperimentalDisabledError(error)) {
    const tErr = await getTranslations('adminActionError')
    return tErr('tacticsDisabled')
  }
  return publicActionError(error, 'actions/tactics')
}

function actor(session: SessionPayload): string {
  return session.discordId
}

function guidanceColumns(guidance: TacticGuidance) {
  return {
    phase: 'setup',
    intent: guidance.intent,
    trigger: '',
    caller_signal: '',
    danger_signs: [],
    common_mistakes: [],
    decision_branches: [],
  }
}

async function cleanBoardNextStepLinks(
  db: AdminDb,
  guildId: string,
  boardId: string,
  value: unknown,
): Promise<TacticNextStepLink[]> {
  const links = cleanTacticNextStepLinks(value)
  if (links.length === 0) return []
  const { data, error } = await db
    .from('tactic_steps')
    .select('id')
    .eq('guild_id', guildId)
    .eq('board_id', boardId)
  if (error) throw new Error(error.message)
  const stepIds = new Set((data ?? []).map((row) => row.id as string))
  return links.filter((link) => stepIds.has(link.targetStepId))
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
    if (boardError) return { error: await publicActionError(boardError, 'actions/tactics') }

    const boardId = board.id as string
    const defaultGuidance = {
      ...createDefaultTacticGuidance(),
      intent: t('defaultGuidanceIntent'),
    }
    const { error: stepError } = await db.from('tactic_steps').insert({
      guild_id: guildId,
      board_id: boardId,
      step_order: 0,
      title: t('defaultStepTitle'),
      callout: t('defaultStepCallout'),
      role_callouts: {},
      ...guidanceColumns(defaultGuidance),
      next_step_links: [],
      board_state: createDefaultTacticBoardState(terrainType),
      duration_seconds: 6,
    })
    if (stepError) {
      await db.from('tactic_boards').delete().eq('guild_id', guildId).eq('id', boardId)
      return { error: await publicActionError(stepError, 'actions/tactics') }
    }

    revalidatePath('/admin/dashboard/tactics')
    return { id: boardId }
  } catch (e) {
    return { error: await tacticActionError(e) }
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
    if (error) return { error: await publicActionError(error, 'actions/tactics') }
    revalidateTacticPaths(input.boardId)
    return {}
  } catch (e) {
    return { error: await tacticActionError(e) }
  }
}

export async function saveTacticStep(input: SaveTacticStepInput): Promise<ActionResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const title = cleanTacticTitle(input.title)
    if (!title) return { error: tErr('tacticStepTitleRequired') }
    const stateResult = validateTacticBoardState(input.boardState)
    if (!stateResult.ok) return { error: tErr(`tacticState_${stateResult.code}`) }
    const guidance = cleanTacticGuidance(input.guidance)
    const { db, session, guildId } = await getActionContext(TACTIC_MANAGE_CAPS)
    const board = await ensureBoard(db, guildId, input.boardId)
    if (!board) return { error: tErr('tacticNotFound') }
    const nextStepLinks = await cleanBoardNextStepLinks(
      db,
      guildId,
      input.boardId,
      input.nextStepLinks,
    )

    const { error } = await db
      .from('tactic_steps')
      .update({
        title,
        callout: cleanTacticCallout(input.callout),
        role_callouts: cleanTacticRoleCallouts(input.roleCallouts),
        ...guidanceColumns(guidance),
        next_step_links: nextStepLinks,
        board_state: stateResult.state,
        duration_seconds: cleanTacticDuration(input.durationSeconds),
        updated_at: new Date().toISOString(),
      })
      .eq('guild_id', guildId)
      .eq('board_id', input.boardId)
      .eq('id', input.stepId)
    if (error) return { error: await publicActionError(error, 'actions/tactics') }

    await db
      .from('tactic_boards')
      .update({ updated_by: actor(session), updated_at: new Date().toISOString() })
      .eq('guild_id', guildId)
      .eq('id', input.boardId)
    revalidateTacticPaths(input.boardId)
    return {}
  } catch (e) {
    return { error: await tacticActionError(e) }
  }
}

export async function saveTacticDocument(
  input: SaveTacticDocumentInput,
): Promise<ActionResult & { updatedAt?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const prepared = prepareTacticDocumentSave(input)
    if (!prepared.ok) {
      if (prepared.code === 'titleRequired') return { error: tErr('tacticTitleRequired') }
      if (prepared.code === 'stepTitleRequired') return { error: tErr('tacticStepTitleRequired') }
      if (prepared.code === 'needsStep') return { error: tErr('tacticNeedsStep') }
      if (prepared.code === 'tooManySteps') return { error: tErr('tacticTooManySteps') }
      if (prepared.code === 'duplicateStepId') return { error: tErr('tacticDocumentMismatch') }
      return { error: tErr(`tacticState_${prepared.code}`) }
    }
    if (!Number.isFinite(Date.parse(input.expectedUpdatedAt))) {
      return { error: tErr('tacticDocumentMismatch') }
    }

    const { db, session, guildId } = await getActionContext(TACTIC_MANAGE_CAPS)
    const { data, error } = await db.rpc('save_tactic_document_atomic', {
      p_guild_id: guildId,
      p_board_id: input.boardId,
      p_expected_updated_at: input.expectedUpdatedAt,
      p_title: prepared.document.title,
      p_summary: prepared.document.summary,
      p_updated_by: actor(session),
      p_steps: prepared.document.steps.map((step) => ({
        id: step.id,
        title: step.title,
        callout: step.callout,
        role_callouts: step.roleCallouts,
        guidance: step.guidance,
        next_step_links: step.nextStepLinks,
        board_state: step.boardState,
        duration_seconds: step.durationSeconds,
      })),
    })
    if (error) {
      if (error.message.includes('tactic_version_conflict')) {
        return { error: tErr('tacticVersionConflict') }
      }
      if (error.message.includes('tactic_document_mismatch')) {
        return { error: tErr('tacticDocumentMismatch') }
      }
      if (error.message.includes('tactic_not_found')) {
        return { error: tErr('tacticNotFound') }
      }
      return { error: await publicActionError(error, 'actions/tactics') }
    }
    if (typeof data !== 'string') return { error: tErr('serverError') }

    revalidateTacticPaths(input.boardId)
    return { updatedAt: data }
  } catch (e) {
    return { error: await tacticActionError(e) }
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
    let guidance = createDefaultTacticGuidance()
    if (sourceStepId) {
      const { data: source, error: sourceError } = await db
        .from('tactic_steps')
        .select('board_state, callout, intent')
        .eq('guild_id', guildId)
        .eq('board_id', boardId)
        .eq('id', sourceStepId)
        .maybeSingle()
      if (sourceError) return { error: await publicActionError(sourceError, 'actions/tactics') }
      const result = validateTacticBoardState(source?.board_state)
      if (result.ok) boardState = result.state
      callout = cleanTacticCallout(source?.callout)
      guidance = cleanTacticGuidance({
        intent: source?.intent,
      })
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
        ...guidanceColumns(guidance),
        next_step_links: [],
        board_state: boardState,
        duration_seconds: 6,
      })
      .select('id')
      .single()
    if (error) return { error: await publicActionError(error, 'actions/tactics') }
    revalidateTacticPaths(boardId)
    return { id: data.id as string }
  } catch (e) {
    return { error: await tacticActionError(e) }
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
    if (error) return { error: await publicActionError(error, 'actions/tactics') }
    revalidateTacticPaths(boardId)
    return {}
  } catch (e) {
    return { error: await tacticActionError(e) }
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
    if (error) return { error: await publicActionError(error, 'actions/tactics') }
    revalidateTacticPaths(boardId)
    return {}
  } catch (e) {
    return { error: await tacticActionError(e) }
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
    if (error) return { error: await publicActionError(error, 'actions/tactics') }
    revalidatePath('/admin/dashboard/tactics')
    return {}
  } catch (e) {
    return { error: await tacticActionError(e) }
  }
}

export async function createTacticShareLink(
  boardId: string,
): Promise<ActionResult & { url?: string; linkId?: string; expiresAt?: string }> {
  const tErr = await getTranslations('adminActionError')
  try {
    const { db, session, guildId } = await getActionContext(TACTIC_PUBLISH_CAPS)
    const board = await ensureBoard(db, guildId, boardId)
    if (!board) return { error: tErr('tacticNotFound') }
    const token = createTacticShareToken()
    const expiresAt = defaultTacticShareExpiresAt().toISOString()
    const { data: linkId, error } = await db.rpc('issue_tactic_share_link', {
      p_guild_id: guildId,
      p_board_id: boardId,
      p_token_hash: hashTacticShareToken(token),
      p_created_by: actor(session),
      p_expires_at: expiresAt,
    })
    if (error || typeof linkId !== 'string') {
      return { error: await publicActionError(error, 'actions/tactics') }
    }

    revalidateTacticPaths(boardId)
    const origin = await requestOrigin()
    return {
      url: `${origin}/tactics/share/${token}`,
      linkId,
      expiresAt,
    }
  } catch (e) {
    return { error: await tacticActionError(e) }
  }
}

export async function revokeTacticShareLink(
  boardId: string,
  linkId: string,
): Promise<ActionResult> {
  const tErr = await getTranslations('adminActionError')
  try {
    const { db, guildId } = await getActionContext(TACTIC_PUBLISH_CAPS)
    const board = await ensureBoard(db, guildId, boardId)
    if (!board) return { error: tErr('tacticNotFound') }
    const { data: revoked, error } = await db.rpc('revoke_tactic_share_link', {
      p_guild_id: guildId,
      p_board_id: boardId,
      p_link_id: linkId,
    })
    if (error) return { error: await publicActionError(error, 'actions/tactics') }
    if (revoked !== true) return { error: tErr('tacticShareNotFound') }
    revalidateTacticPaths(boardId)
    return {}
  } catch (e) {
    return { error: await tacticActionError(e) }
  }
}

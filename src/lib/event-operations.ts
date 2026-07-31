import type { TacticBoardDocument } from '@/lib/tactics/queries'
import {
  cleanTacticCallout,
  cleanTacticGuidance,
  cleanTacticNextStepLinks,
  cleanTacticRoleCallouts,
  createDefaultTacticBoardState,
  validateTacticBoardState,
  type TacticTerrain,
  type TacticVisibility,
} from '@/lib/tactics/schema'

export interface EventTacticSnapshotRow {
  id: string
  title: string
  summary: string | null
  terrain_type: string
  visibility: string
  tags: string[] | null
  captured_by: string
  captured_at: string
  source_board_updated_at: string
}

export interface EventTacticSnapshotStepRow {
  source_step_id: string
  step_order: number
  title: string
  callout: string | null
  role_callouts: unknown
  intent: string | null
  next_step_links: unknown
  board_state: unknown
  duration_seconds: number
  captured_at: string
}

function asTacticTerrain(value: string): TacticTerrain {
  if (
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

function asTacticVisibility(value: string): TacticVisibility {
  if (value === 'guild' || value === 'share') return value
  return 'private'
}

export function mapEventTacticSnapshot(
  snapshot: EventTacticSnapshotRow,
  stepRows: readonly EventTacticSnapshotStepRow[],
): TacticBoardDocument {
  const terrain = asTacticTerrain(snapshot.terrain_type)
  const steps = stepRows.map((row) => {
    const state = validateTacticBoardState(row.board_state)
    return {
      id: row.source_step_id,
      stepOrder: row.step_order,
      title: row.title,
      callout: cleanTacticCallout(row.callout),
      roleCallouts: cleanTacticRoleCallouts(row.role_callouts),
      guidance: cleanTacticGuidance({ intent: row.intent }),
      nextStepLinks: cleanTacticNextStepLinks(row.next_step_links),
      boardState: state.ok ? state.state : createDefaultTacticBoardState(terrain),
      durationSeconds: row.duration_seconds,
      createdAt: row.captured_at,
      updatedAt: row.captured_at,
    }
  })

  return {
    board: {
      id: snapshot.id,
      title: snapshot.title,
      summary: snapshot.summary ?? '',
      terrainType: terrain,
      status: 'published',
      visibility: asTacticVisibility(snapshot.visibility),
      tags: snapshot.tags ?? [],
      createdBy: snapshot.captured_by,
      updatedBy: snapshot.captured_by,
      createdAt: snapshot.captured_at,
      updatedAt: snapshot.source_board_updated_at,
      stepCount: steps.length,
    },
    steps,
  }
}

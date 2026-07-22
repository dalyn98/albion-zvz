import {
  MAX_TACTIC_STEPS,
  cleanTacticCallout,
  cleanTacticDuration,
  cleanTacticGuidance,
  cleanTacticNextStepLinks,
  cleanTacticRoleCallouts,
  cleanTacticSummary,
  cleanTacticTitle,
  validateTacticBoardState,
  type TacticBoardState,
  type TacticGuidance,
  type TacticNextStepLink,
  type TacticRoleFocus,
  type TacticValidationCode,
} from './schema'

export interface TacticDocumentStepSaveInput {
  id: string
  title: string
  callout: string
  roleCallouts?: unknown
  guidance?: unknown
  nextStepLinks?: unknown
  boardState: unknown
  durationSeconds: number
}

export interface PreparedTacticDocumentStep {
  id: string
  title: string
  callout: string
  roleCallouts: Partial<Record<TacticRoleFocus, string>>
  guidance: TacticGuidance
  nextStepLinks: TacticNextStepLink[]
  boardState: TacticBoardState
  durationSeconds: number
}

export interface PreparedTacticDocument {
  title: string
  summary: string
  steps: PreparedTacticDocumentStep[]
}

export type TacticDocumentSaveCode =
  | 'titleRequired'
  | 'stepTitleRequired'
  | 'needsStep'
  | 'tooManySteps'
  | 'duplicateStepId'
  | TacticValidationCode

export type PrepareTacticDocumentSaveResult =
  | { ok: true; document: PreparedTacticDocument }
  | { ok: false; code: TacticDocumentSaveCode }

export function prepareTacticDocumentSave(input: {
  title: string
  summary: string
  steps: readonly TacticDocumentStepSaveInput[]
}): PrepareTacticDocumentSaveResult {
  const title = cleanTacticTitle(input.title)
  if (!title) return { ok: false, code: 'titleRequired' }
  if (input.steps.length === 0) return { ok: false, code: 'needsStep' }
  if (input.steps.length > MAX_TACTIC_STEPS) return { ok: false, code: 'tooManySteps' }

  const stepIds = new Set(input.steps.map((step) => step.id))
  if (stepIds.size !== input.steps.length) return { ok: false, code: 'duplicateStepId' }

  const steps: PreparedTacticDocumentStep[] = []
  for (const step of input.steps) {
    const stepTitle = cleanTacticTitle(step.title)
    if (!stepTitle) return { ok: false, code: 'stepTitleRequired' }
    const stateResult = validateTacticBoardState(step.boardState)
    if (!stateResult.ok) return stateResult

    steps.push({
      id: step.id,
      title: stepTitle,
      callout: cleanTacticCallout(step.callout),
      roleCallouts: cleanTacticRoleCallouts(step.roleCallouts),
      guidance: cleanTacticGuidance(step.guidance),
      nextStepLinks: cleanTacticNextStepLinks(step.nextStepLinks).filter((link) =>
        stepIds.has(link.targetStepId),
      ),
      boardState: stateResult.state,
      durationSeconds: cleanTacticDuration(step.durationSeconds),
    })
  }

  return {
    ok: true,
    document: {
      title,
      summary: cleanTacticSummary(input.summary),
      steps,
    },
  }
}

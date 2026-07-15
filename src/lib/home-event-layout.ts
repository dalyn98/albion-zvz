export type HomeEventLayout = 'list' | 'grid'

export function resolveHomeEventLayout(visibleEventCount: number): HomeEventLayout {
  return visibleEventCount >= 3 ? 'grid' : 'list'
}

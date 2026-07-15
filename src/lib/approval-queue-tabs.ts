export interface ApprovalQueueTabInput<Key extends string = string> {
  key: Key
  badge: number
  enabled: boolean
}

export interface OrganizedApprovalQueueTabs<Key extends string> {
  primary: Key[]
  secondary: Key[]
}

export function organizeApprovalQueueTabs<Key extends string>(
  tabs: readonly ApprovalQueueTabInput<Key>[],
  activeKey: Key,
): OrganizedApprovalQueueTabs<Key> {
  const available = tabs.filter(
    (tab) => tab.enabled || tab.badge > 0 || tab.key === activeKey,
  )
  const indexed = available.map((tab, index) => ({ ...tab, index }))
  const primaryRows = indexed
    .filter((tab) => tab.badge > 0 || tab.key === activeKey)
    .sort((left, right) => {
      if (left.badge !== right.badge) return right.badge - left.badge
      return left.index - right.index
    })

  if (primaryRows.length === 0 && indexed.length > 0) {
    primaryRows.push(indexed[0])
  }

  const primarySet = new Set(primaryRows.map((tab) => tab.key))
  return {
    primary: primaryRows.map((tab) => tab.key),
    secondary: indexed
      .filter((tab) => !primarySet.has(tab.key))
      .map((tab) => tab.key),
  }
}

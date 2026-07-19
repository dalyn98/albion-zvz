import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CLIENT_COMPONENTS = [
  'src/components/AdminCraftOrdersPanel.tsx',
  'src/components/AdminInventoryGearPanel.tsx',
  'src/components/BuildPreview.tsx',
  'src/components/CraftOrderReviewList.tsx',
  'src/components/CraftOrdersMemberClient.tsx',
  'src/components/CraftQueueAggregationCard.tsx',
  'src/components/CraftTaskDetail.tsx',
  'src/components/GuildMemberList.tsx',
  'src/components/ItemImage.tsx',
  'src/components/ItemPicker.tsx',
  'src/components/MemberTradeDisputeReviewList.tsx',
  'src/components/MyRegearBreakdownEditor.tsx',
  'src/components/MyRegearBuildSnapshotEditor.tsx',
  'src/components/RecentBuildsDropdown.tsx',
  'src/components/RegearBreakdownPreview.tsx',
  'src/components/RegearBuildSnapshotPicker.tsx',
  'src/components/ShopBaselineForm.tsx',
  'src/components/ShopImportForm.tsx',
  'src/components/ShopInventoryEditor.tsx',
  'src/components/ShopOrderReviewList.tsx',
  'src/components/SlotCard.tsx',
  'src/components/SlotCardPickerModals.tsx',
  'src/components/SlotEditor/ConditionalOptionsSection.tsx',
  'src/components/SlotEditor/GearSection.tsx',
  'src/components/TemplatePartyListSidebar.tsx',
] as const

describe('client item-name bundle boundary', () => {
  it('keeps the full Albion item dictionary out of client component imports', () => {
    for (const file of CLIENT_COMPONENTS) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      expect(source, file).not.toContain("from '@/lib/item-names'")
      expect(source, file).toContain("from '@/lib/item-names-client'")
    }
  })

  it('loads localized client names through the bounded API instead of JSON imports', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/lib/item-names-client.ts'),
      'utf8',
    )

    expect(source).toContain('/api/items/names')
    expect(source).not.toContain('albion-items.json')
  })

  it('keeps cooldown dictionaries behind a server API boundary', () => {
    const source = readFileSync(
      join(process.cwd(), 'src/components/SlotSpellPanel.tsx'),
      'utf8',
    )

    expect(source).not.toContain("from '@/lib/cooldown'")
    expect(source).toContain("from '@/lib/cooldown-client'")
  })
})

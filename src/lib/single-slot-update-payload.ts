import type { SlotPayload } from '@/app/actions/admin-slot-sanitizers'
import type { SlotInput } from '@/components/SlotEditor/slot-input'

export function buildSingleSlotUpdatePayload(
  input: SlotInput,
): Omit<SlotPayload, 'id' | 'slot_number'> {
  return {
    is_hidden: input.is_hidden,
    role_name: input.role_name,
    notes: input.notes,
    items: input.items,
    options: input.options,
    spells: input.spells,
    specs: input.specs,
    auto_regear_excluded: input.auto_regear_excluded,
    manual_regear_excluded: input.manual_regear_excluded,
    is_solo_bomb: input.is_solo_bomb,
    conditional_options: input.conditional_options,
  }
}

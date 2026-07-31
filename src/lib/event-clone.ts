export function buildClonedSlotRow(
  source: Record<string, unknown>,
  target: { guildId: string; partyId: string },
): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (key === 'id' || key === 'party_id' || key === 'guild_id') continue
    if (key.startsWith('assigned_') || key.startsWith('requested_')) continue
    row[key] = value
  }
  row.party_id = target.partyId
  row.guild_id = target.guildId
  return row
}

export const EVENT_ROW_SELECT =
  'id, title, gather_time, gather_at, gather_location, special_notes, is_active, battle_started_at, notify_role_id, notify_channel_id, notify_everyone, created_by, status, category, recruitment_mode, exclude_from_participation_stats, regear_policy, regear_silver_cap, regear_max_deaths_per_member, regear_video_policy, regear_video_payout_rate_percent, regear_video_claim_ceiling_bonus_silver, regear_video_rate_applies_without_proof, regear_auto_policy, created_at' as const

export const PARTY_ROW_SELECT =
  'id, event_id, party_number, slots_version, name, is_bomb_squad, bomb_squad_kind, caller_discord_id' as const

export const SLOT_ROW_SELECT =
  'id, party_id, slot_number, is_hidden, role_name, notes, weapon_name, weapon_id, head_name, head_id, armor_name, armor_id, shoes_name, shoes_id, offhand_name, offhand_id, potion_name, potion_id, food_name, food_id, cape_name, cape_id, mount_name, mount_id, weapon_options, head_options, armor_options, shoes_options, offhand_options, potion_options, food_options, cape_options, mount_options, spells, gear_specs, auto_regear_excluded, manual_regear_excluded, assigned_discord_id, assigned_username, assigned_weapon_name, assigned_weapon_id, assigned_head_name, assigned_head_id, assigned_armor_name, assigned_armor_id, assigned_shoes_name, assigned_shoes_id, assigned_offhand_name, assigned_offhand_id, assigned_potion_name, assigned_potion_id, assigned_food_name, assigned_food_id, assigned_cape_name, assigned_cape_id, assigned_mount_name, assigned_mount_id, requested_discord_id, requested_username, requested_picks, requested_at, is_solo_bomb, conditional_options' as const

export const PARTY_WITH_SLOTS_SELECT =
  `${PARTY_ROW_SELECT}, slots(${SLOT_ROW_SELECT})` as const

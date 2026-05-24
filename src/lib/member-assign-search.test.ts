import { describe, expect, it } from 'vitest'
import { filterAssignableMembers, type AssignableMember } from './member-assign-search'

const members: AssignableMember[] = [
  { discordId: '100', username: 'Zulu Healer', avatar: null, alreadyInEvent: false },
  { discordId: '200', username: 'Alpha Tank', avatar: null, alreadyInEvent: true },
  { discordId: '300', username: 'alpha Caller', avatar: null, alreadyInEvent: false },
  { discordId: '400', username: 'Shotcaller Prime', avatar: null, alreadyInEvent: false },
]

describe('filterAssignableMembers', () => {
  it('puts assignable exact/prefix matches before members already in the event', () => {
    expect(filterAssignableMembers(members, 'alpha', 'all').map((m) => m.discordId)).toEqual([
      '300',
      '200',
    ])
  })

  it('matches by discord id as well as username', () => {
    expect(filterAssignableMembers(members, '400', 'all').map((m) => m.username)).toEqual([
      'Shotcaller Prime',
    ])
  })

  it('supports available and assigned filters without changing search semantics', () => {
    expect(filterAssignableMembers(members, 'alpha', 'available').map((m) => m.discordId)).toEqual([
      '300',
    ])
    expect(filterAssignableMembers(members, 'alpha', 'assigned').map((m) => m.discordId)).toEqual([
      '200',
    ])
  })
})

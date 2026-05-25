import { describe, expect, it } from 'vitest'
import { filterAssignableMembers, type AssignableMember } from './member-assign-search'

const members: AssignableMember[] = [
  {
    discordId: '100',
    username: 'Zulu Healer',
    albionNickname: null,
    avatar: null,
    alreadyInEvent: false,
  },
  {
    discordId: '200',
    username: 'Alpha Tank',
    albionNickname: 'Stone Guard',
    avatar: null,
    alreadyInEvent: true,
  },
  {
    discordId: '300',
    username: 'alpha Caller',
    albionNickname: 'Main Caller',
    avatar: null,
    alreadyInEvent: false,
  },
  {
    discordId: '400',
    username: 'Shotcaller Prime',
    albionNickname: 'MonKKu',
    avatar: null,
    alreadyInEvent: false,
  },
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

  it('matches and ranks albion nicknames with the same priority as discord names', () => {
    expect(filterAssignableMembers(members, 'mon', 'all').map((m) => m.discordId)).toEqual([
      '400',
    ])
    expect(filterAssignableMembers(members, 'main', 'all').map((m) => m.discordId)).toEqual([
      '300',
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

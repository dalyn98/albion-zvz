import { describe, expect, it } from 'vitest'
import { parseSiphonAccountingMode, siphonActivityTotal } from './accounting-mode'

describe('siphon accounting mode', () => {
  it('keeps existing guilds on personal custody unless record mode is explicit', () => {
    expect(parseSiphonAccountingMode(undefined)).toBe('personal_custody')
    expect(parseSiphonAccountingMode('unexpected')).toBe('personal_custody')
    expect(parseSiphonAccountingMode('record')).toBe('record')
  })

  it('summarizes record mode without treating withdrawals as debt', () => {
    expect(siphonActivityTotal({ deposited: 10, withdrawn: 40 })).toBe(50)
  })
})

// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'
import {
  EMPTY_FILTER,
  getActiveChips,
  isFilterActive,
  removeChip,
} from './useFilterSort'

describe('isFilterActive', () => {
  it('returns false for empty filter', () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false)
  })

  it('returns true when statuses set', () => {
    expect(isFilterActive({ ...EMPTY_FILTER, statuses: ['running'] })).toBe(true)
  })

  it('returns true when ageDays differs from default', () => {
    expect(isFilterActive({ ...EMPTY_FILTER, ageDays: 1 })).toBe(true)
  })

  it('returns true when yolo set', () => {
    expect(isFilterActive({ ...EMPTY_FILTER, yolo: true })).toBe(true)
  })
})

describe('getActiveChips', () => {
  it('returns empty for empty filter', () => {
    expect(getActiveChips(EMPTY_FILTER)).toEqual([])
  })

  it('returns chips for each active filter', () => {
    const chips = getActiveChips({
      statuses: ['running', 'idle'],
      providers: ['claude'],
      yolo: true,
      manager: null,
      ageDays: 1,
    })
    expect(chips).toHaveLength(5)
    expect(chips.map((c) => c.key)).toEqual([
      'status:running',
      'status:idle',
      'provider:claude',
      'flag:yolo',
      'age',
    ])
  })
})

describe('removeChip', () => {
  it('removes a status chip', () => {
    const f = { ...EMPTY_FILTER, statuses: ['running' as const, 'idle' as const] }
    const result = removeChip(f, 'status:running')
    expect(result.statuses).toEqual(['idle'])
  })

  it('removes age chip resets to default', () => {
    const f = { ...EMPTY_FILTER, ageDays: 1 }
    const result = removeChip(f, 'age')
    expect(result.ageDays).toBe(EMPTY_FILTER.ageDays)
  })

  it('removes yolo flag', () => {
    const f = { ...EMPTY_FILTER, yolo: true }
    const result = removeChip(f, 'flag:yolo')
    expect(result.yolo).toBeNull()
  })

  it('removes provider chip', () => {
    const f = { ...EMPTY_FILTER, providers: ['claude' as const, 'codex' as const] }
    const result = removeChip(f, 'provider:claude')
    expect(result.providers).toEqual(['codex'])
  })
})

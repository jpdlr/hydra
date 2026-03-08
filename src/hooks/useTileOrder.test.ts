// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useTileOrder } from './useTileOrder'
import type { AgentState } from '@shared/types'

function makeAgent(id: string): AgentState {
  return {
    id,
    name: `Agent ${id}`,
    projectDir: '/tmp/project',
    provider: 'claude',
    model: 'sonnet',
    yolo: false,
    isManager: false,
    sessionId: null,
    initialPrompt: '',
    createdAt: '2026-01-01T00:00:00Z',
    status: 'idle',
    pid: null,
    restartCount: 0,
    startedAt: null,
    lastActivityAt: '2026-01-01T00:00:00Z'
  }
}

const STORAGE_KEY = 'hydra:tile-order:v1'

describe('useTileOrder', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns agent IDs in their natural order when no stored order exists', () => {
    const agents = [makeAgent('a'), makeAgent('b'), makeAgent('c')]
    const { result } = renderHook(() =>
      useTileOrder('/tmp/project', agents, false)
    )
    expect(result.current.orderedIds).toEqual(['a', 'b', 'c'])
    expect(result.current.hasCustomOrder).toBe(false)
  })

  it('reorders agents on handleReorder and persists to localStorage', () => {
    const agents = [makeAgent('a'), makeAgent('b'), makeAgent('c')]
    const { result } = renderHook(() =>
      useTileOrder('/tmp/project', agents, false)
    )

    act(() => {
      result.current.handleReorder('c', 'a')
    })

    expect(result.current.orderedIds).toEqual(['c', 'a', 'b'])
    expect(result.current.hasCustomOrder).toBe(true)

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored['/tmp/project']).toEqual(['c', 'a', 'b'])
  })

  it('appends new agents at the end of stored order', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      '/tmp/project': ['b', 'a']
    }))

    const agents = [makeAgent('a'), makeAgent('b'), makeAgent('c')]
    const { result } = renderHook(() =>
      useTileOrder('/tmp/project', agents, false)
    )

    expect(result.current.orderedIds).toEqual(['b', 'a', 'c'])
  })

  it('freezes the initial grid order across activity-driven rerenders', () => {
    const initialAgents = [makeAgent('a'), makeAgent('b'), makeAgent('c')]
    const { result, rerender } = renderHook(
      ({ agents }) => useTileOrder('/tmp/project', agents, false),
      { initialProps: { agents: initialAgents } }
    )

    expect(result.current.orderedIds).toEqual(['a', 'b', 'c'])

    rerender({ agents: [makeAgent('c'), makeAgent('a'), makeAgent('b')] })

    expect(result.current.orderedIds).toEqual(['a', 'b', 'c'])
  })

  it('appends newly appearing agents while keeping the frozen grid order stable', () => {
    const { result, rerender } = renderHook(
      ({ agents }) => useTileOrder('/tmp/project', agents, false),
      { initialProps: { agents: [makeAgent('a'), makeAgent('b')] } }
    )

    expect(result.current.orderedIds).toEqual(['a', 'b'])

    rerender({ agents: [makeAgent('b'), makeAgent('c'), makeAgent('a')] })

    expect(result.current.orderedIds).toEqual(['a', 'b', 'c'])
  })

  it('removes stale agent IDs from stored order', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      '/tmp/project': ['a', 'b', 'c']
    }))

    const agents = [makeAgent('a'), makeAgent('c')]
    const { result } = renderHook(() =>
      useTileOrder('/tmp/project', agents, false)
    )

    expect(result.current.orderedIds).toEqual(['a', 'c'])
  })

  it('returns agents unmodified and ignores reorder for Running tab', () => {
    const agents = [makeAgent('a'), makeAgent('b')]
    const { result } = renderHook(() =>
      useTileOrder('__running__', agents, true)
    )

    expect(result.current.orderedIds).toEqual(['a', 'b'])
    expect(result.current.hasCustomOrder).toBe(false)

    act(() => {
      result.current.handleReorder('b', 'a')
    })

    expect(result.current.orderedIds).toEqual(['a', 'b'])
  })

  it('resetOrder clears stored order for the project only', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      '/tmp/project': ['b', 'a'],
      '/tmp/other': ['x', 'y']
    }))

    const agents = [makeAgent('a'), makeAgent('b')]
    const { result } = renderHook(() =>
      useTileOrder('/tmp/project', agents, false)
    )

    expect(result.current.hasCustomOrder).toBe(true)

    act(() => {
      result.current.resetOrder()
    })

    expect(result.current.hasCustomOrder).toBe(false)
    expect(result.current.orderedIds).toEqual(['a', 'b'])

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!)
    expect(stored['/tmp/other']).toEqual(['x', 'y'])
    expect(stored['/tmp/project']).toBeUndefined()
  })

  it('handles null project gracefully', () => {
    const agents = [makeAgent('a')]
    const { result } = renderHook(() =>
      useTileOrder(null, agents, false)
    )
    expect(result.current.orderedIds).toEqual(['a'])
    expect(result.current.hasCustomOrder).toBe(false)
  })
})

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type {
  AgentState,
  CreateAgentPayload,
  AgentOutputPayload,
  AgentStatusPayload,
  ProjectGroup
} from '@shared/types'
import { detectLatestModelFromTerminalOutput } from '@shared/terminalModelDetection'
import { basename } from '@/lib/pathUtils'
import { createTraceId, logEvent } from '@/lib/observability'

/** Maximum raw output size per agent (2 MB). Older output is trimmed. */
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024

function bufferToText(chunks: string[]): string {
  return chunks.length > 0 ? chunks.join('') : ''
}

function trimOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_BYTES) return output
  // Keep the most recent portion
  return output.slice(output.length - MAX_OUTPUT_BYTES)
}

export function useAgents(initialSelectedAgentId: string | null = null) {
  // Agent metadata (status, model, yolo, etc.) — changes infrequently
  const [agents, setAgents] = useState<Map<string, AgentState>>(new Map())
  // Terminal output — changes frequently, separated to avoid re-rendering the whole tree
  const [rawOutputs, setRawOutputs] = useState<Map<string, string>>(new Map())
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(initialSelectedAgentId)
  const selectedAgentIdRef = useRef<string | null>(initialSelectedAgentId)

  useEffect(() => {
    selectedAgentIdRef.current = selectedAgentId
  }, [selectedAgentId])

  const readAgentBufferText = useCallback(async (agentId: string): Promise<string> => {
    try {
      const lines = await window.hydra.getAgentBuffer(agentId)
      return bufferToText(lines)
    } catch {
      return ''
    }
  }, [])

  // ── RAF-batched output handling ──────────────────────────────────────────
  // Accumulate output chunks in a ref, flush to React state once per frame.
  const pendingChunksRef = useRef<Map<string, string>>(new Map())
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const unsub = window.hydra.onAgentOutput((payload: AgentOutputPayload) => {
      const pending = pendingChunksRef.current
      pending.set(payload.agentId, (pending.get(payload.agentId) ?? '') + payload.data)

      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = 0
          const batch = pendingChunksRef.current
          pendingChunksRef.current = new Map()

          // Flush accumulated output to React state (single update per frame)
          setRawOutputs((prev) => {
            const next = new Map(prev)
            for (const [id, chunk] of batch) {
              const combined = (prev.get(id) ?? '') + chunk
              next.set(id, trimOutput(combined))
            }
            return next
          })

          // Check for model changes — only update agents state if model actually changed
          setAgents((prev) => {
            let changed = false
            const next = new Map(prev)
            for (const [id] of batch) {
              const state = next.get(id)
              if (!state) continue
              // We need current output for detection — read from pending + prev
              // For efficiency, detect on the chunk only (last portion is sufficient)
              const detectedModel = detectLatestModelFromTerminalOutput(state.provider, batch.get(id) ?? '')
              if (detectedModel && detectedModel !== state.model) {
                changed = true
                next.set(id, { ...state, model: detectedModel })
              }

              // Only update lastActivityAt if >1 minute stale
              const now = Date.now()
              const prevActivity = Date.parse(state.lastActivityAt)
              if (now - prevActivity > 60_000) {
                changed = true
                const existing = next.get(id)!
                next.set(id, { ...existing, lastActivityAt: new Date(now).toISOString() })
              }
            }
            return changed ? next : prev
          })
        })
      }
    })

    return () => {
      unsub()
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = 0
      }
    }
  }, [])

  // Listen for agent status changes
  useEffect(() => {
    const unsub = window.hydra.onAgentStatus((payload: AgentStatusPayload) => {
      setAgents((prev) => {
        const state = prev.get(payload.agentId)
        if (!state) return prev
        const next = new Map(prev)
        next.set(payload.agentId, {
          ...state,
          status: payload.status,
          sessionId: payload.sessionId ?? state.sessionId,
          model: payload.model ?? state.model
        })
        return next
      })
    })
    return unsub
  }, [])

  // Load existing agents on mount + fetch output buffers for reconnection
  useEffect(() => {
    window.hydra.listAgents().then(async (agentList) => {
      const stateMap = new Map<string, AgentState>()
      const outputMap = new Map<string, string>()

      const bufferPromises = agentList.map(async (state) => {
        const rawOutput = await readAgentBufferText(state.id)
        return { state, rawOutput }
      })

      const results = await Promise.all(bufferPromises)
      for (const { state, rawOutput } of results) {
        const detectedModel = detectLatestModelFromTerminalOutput(state.provider, rawOutput)
        stateMap.set(state.id, detectedModel ? { ...state, model: detectedModel } : state)
        outputMap.set(state.id, trimOutput(rawOutput))
      }

      setAgents(stateMap)
      setRawOutputs(outputMap)
      const preferredId = selectedAgentIdRef.current
      if (preferredId && stateMap.has(preferredId)) {
        setSelectedAgentId(preferredId)
      } else if (agentList.length > 0 && !selectedAgentIdRef.current) {
        setSelectedAgentId(agentList[0].id)
      }
    }).catch((error) => {
      logEvent({
        level: 'error',
        event: 'renderer.agents.load-failed',
        traceId: createTraceId('agents-load'),
        message: error instanceof Error ? error.message : String(error)
      })
    })
  }, [initialSelectedAgentId, readAgentBufferText])

  const createAgent = useCallback(async (payload: CreateAgentPayload) => {
    const traceId = createTraceId('agent-create')
    logEvent({
      level: 'info',
      event: 'renderer.agent.create',
      traceId,
      projectId: payload.projectDir,
      meta: { model: payload.model, yolo: payload.yolo }
    })
    const state = await window.hydra.createAgent(payload)
    const rawOutput = await readAgentBufferText(state.id)
    setAgents((prev) => {
      const next = new Map(prev)
      next.set(state.id, state)
      return next
    })
    setRawOutputs((prev) => {
      const next = new Map(prev)
      next.set(state.id, rawOutput)
      return next
    })
    setSelectedAgentId(state.id)
    return state
  }, [readAgentBufferText])

  const killAgent = useCallback(async (agentId: string) => {
    logEvent({
      level: 'info',
      event: 'renderer.agent.kill',
      traceId: createTraceId('agent-kill'),
      agentId
    })
    await window.hydra.killAgent(agentId)
  }, [])

  const removeAgent = useCallback(
    async (agentId: string) => {
      await window.hydra.removeAgent(agentId)
      setAgents((prev) => {
        const next = new Map(prev)
        next.delete(agentId)
        return next
      })
      setRawOutputs((prev) => {
        const next = new Map(prev)
        next.delete(agentId)
        return next
      })
      if (selectedAgentId === agentId) {
        setSelectedAgentId((prevSelected) => (prevSelected === agentId ? null : prevSelected))
      }
    },
    [selectedAgentId]
  )

  const restartAgent = useCallback(async (agentId: string) => {
    logEvent({
      level: 'info',
      event: 'renderer.agent.restart',
      traceId: createTraceId('agent-restart'),
      agentId
    })

    // Clear terminal before restarting
    setAgents((prev) => {
      const state = prev.get(agentId)
      if (!state) return prev
      const next = new Map(prev)
      next.set(agentId, { ...state, status: 'starting' })
      return next
    })
    setRawOutputs((prev) => {
      const next = new Map(prev)
      next.set(agentId, '')
      return next
    })

    const updated = await window.hydra.restartAgent(agentId)
    if (updated) {
      setAgents((prev) => {
        const next = new Map(prev)
        next.set(agentId, updated)
        return next
      })

      // Backfill any startup output that may have arrived before restart resolved.
      const bufferSnapshot = await readAgentBufferText(agentId)
      if (bufferSnapshot) {
        setRawOutputs((prev) => {
          const current = prev.get(agentId) ?? ''
          if (current.length >= bufferSnapshot.length) return prev
          const next = new Map(prev)
          next.set(agentId, bufferSnapshot)
          return next
        })
      }
    }
  }, [readAgentBufferText])

  const toggleYolo = useCallback(async (agentId: string, yolo: boolean) => {
    const updated = await window.hydra.toggleYolo(agentId, yolo)
    if (updated) {
      setAgents((prev) => {
        const next = new Map(prev)
        next.set(agentId, updated)
        return next
      })
    }
  }, [])

  const renameAgent = useCallback(async (agentId: string, name: string) => {
    const updated = await window.hydra.renameAgent(agentId, name)
    if (updated) {
      setAgents((prev) => {
        const next = new Map(prev)
        next.set(agentId, updated)
        return next
      })
    }
  }, [])

  const setAgentModel = useCallback(async (agentId: string, model: string) => {
    try {
      const updated = await window.hydra.setAgentModel(agentId, model)
      if (updated) {
        setAgents((prev) => {
          const next = new Map(prev)
          next.set(agentId, updated)
          return next
        })
      }
    } catch {
      // Keep the optimistic model locally; the terminal command has already been sent.
    }
  }, [])

  const sendInput = useCallback((agentId: string, input: string) => {
    logEvent({
      level: 'debug',
      event: 'renderer.agent.send-input',
      traceId: createTraceId('agent-send'),
      agentId,
      meta: { inputLength: input.length }
    })
    window.hydra.sendInput(agentId, input)
  }, [])

  const sendTerminalInput = useCallback((agentId: string, data: string) => {
    window.hydra.sendRawInput(agentId, data)
  }, [])

  const resizeTerminal = useCallback((agentId: string, cols: number, rows: number) => {
    window.hydra.resizeAgent(agentId, cols, rows)
  }, [])

  const broadcastInput = useCallback(async (projectDir: string, input: string) => {
    logEvent({
      level: 'info',
      event: 'renderer.agent.broadcast',
      traceId: createTraceId('broadcast'),
      projectId: projectDir,
      meta: { inputLength: input.length }
    })
    return await window.hydra.broadcast(projectDir, input)
  }, [])

  // Derived data — memoized
  const agentList = useMemo(
    () => Array.from(agents.values()),
    [agents]
  )

  const projectGroups: ProjectGroup[] = useMemo(() => {
    const grouped = new Map<string, AgentState[]>()
    for (const state of agents.values()) {
      const dir = state.projectDir
      if (!grouped.has(dir)) grouped.set(dir, [])
      grouped.get(dir)!.push(state)
    }
    // Quantize to 1-minute buckets to prevent flickering when multiple
    // agents/projects produce output at the same time.
    const SORT_BUCKET_MS = 60_000
    const bucketize = (ts: string) => Math.floor(Date.parse(ts) / SORT_BUCKET_MS)
    const groups = Array.from(grouped.entries()).map(([dir, agts]) => {
      agts.sort((a, b) => bucketize(b.lastActivityAt) - bucketize(a.lastActivityAt))
      return { projectDir: dir, projectName: basename(dir), agents: agts }
    })
    groups.sort((a, b) => {
      const aIsManager = a.agents.some((ag) => ag.isManager)
      const bIsManager = b.agents.some((ag) => ag.isManager)
      if (aIsManager !== bIsManager) return aIsManager ? -1 : 1
      const aTime = bucketize(a.agents[0].lastActivityAt)
      const bTime = bucketize(b.agents[0].lastActivityAt)
      return bTime - aTime
    })
    return groups
  }, [agents])

  const selectedAgent = selectedAgentId ? agents.get(selectedAgentId) || null : null

  return {
    agents,
    agentList,
    projectGroups,
    rawOutputs,
    selectedAgentId,
    selectedAgent,
    setSelectedAgentId,
    createAgent,
    killAgent,
    removeAgent,
    restartAgent,
    toggleYolo,
    renameAgent,
    setAgentModel,
    sendInput,
    sendTerminalInput,
    resizeTerminal,
    broadcastInput
  }
}

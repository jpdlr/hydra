import { useState, useEffect, useCallback, useRef } from 'react'
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

interface AgentData {
  state: AgentState
  rawOutput: string
}

function bufferToText(chunks: string[]): string {
  return chunks.length > 0 ? chunks.join('') : ''
}

export function useAgents(initialSelectedAgentId: string | null = null) {
  const [agents, setAgents] = useState<Map<string, AgentData>>(new Map())
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
      // Buffer fetch failed — start with empty output
      return ''
    }
  }, [])

  // Listen for agent output
  useEffect(() => {
    const unsub = window.hydra.onAgentOutput((payload: AgentOutputPayload) => {
      setAgents((prev) => {
        const next = new Map(prev)
        const data = next.get(payload.agentId)
        if (!data) return prev
        const nextOutput = data.rawOutput + payload.data
        const detectedModel = detectLatestModelFromTerminalOutput(data.state.provider, nextOutput)

        // Only update lastActivityAt if >1 minute stale to avoid constant
        // sidebar re-renders when multiple agents produce output.
        const now = Date.now()
        const prevActivity = Date.parse(data.state.lastActivityAt)
        const stale = now - prevActivity > 60_000
        next.set(payload.agentId, {
          ...data,
          state: stale
            ? {
                ...data.state,
                lastActivityAt: new Date(now).toISOString(),
                model: detectedModel ?? data.state.model
              }
            : {
                ...data.state,
                model: detectedModel ?? data.state.model
              },
          rawOutput: nextOutput
        })
        return next
      })
    })

    return () => {
      unsub()
    }
  }, [])

  // Listen for agent status changes
  useEffect(() => {
    const unsub = window.hydra.onAgentStatus((payload: AgentStatusPayload) => {
      setAgents((prev) => {
        const next = new Map(prev)
        const data = next.get(payload.agentId)
        if (!data) return prev

        const updatedState = {
          ...data.state,
          status: payload.status,
          sessionId: payload.sessionId ?? data.state.sessionId,
          model: payload.model ?? data.state.model
        }
        next.set(payload.agentId, { ...data, state: updatedState })
        return next
      })
    })
    return unsub
  }, [])

  // Load existing agents on mount + fetch output buffers for reconnection
  useEffect(() => {
    window.hydra.listAgents().then(async (agentList) => {
      const map = new Map<string, AgentData>()

      // Fetch output buffers in parallel for all agents (reconnection support)
      const bufferPromises = agentList.map(async (state) => {
        const rawOutput = await readAgentBufferText(state.id)
        return { state, rawOutput }
      })

      const results = await Promise.all(bufferPromises)
      for (const { state, rawOutput } of results) {
        const detectedModel = detectLatestModelFromTerminalOutput(state.provider, rawOutput)
        map.set(state.id, {
          state: detectedModel ? { ...state, model: detectedModel } : state,
          rawOutput
        })
      }

      setAgents(map)
      const preferredId = selectedAgentIdRef.current
      if (preferredId && map.has(preferredId)) {
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
    const data: AgentData = {
      state,
      rawOutput
    }
    setAgents((prev) => {
      const next = new Map(prev)
      next.set(state.id, data)
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

    // Clear terminal before restarting to avoid carrying stale output into the new session.
    setAgents((prev) => {
      const next = new Map(prev)
      const data = next.get(agentId)
      if (!data) return prev
      next.set(agentId, {
        ...data,
        state: { ...data.state, status: 'starting' },
        rawOutput: ''
      })
      return next
    })

    const updated = await window.hydra.restartAgent(agentId)
    if (updated) {
      setAgents((prev) => {
        const next = new Map(prev)
        const data = next.get(agentId)
        if (data) {
          next.set(agentId, {
            ...data,
            state: updated
          })
        }
        return next
      })

      // Backfill any startup output that may have arrived before restart resolved.
      const bufferSnapshot = await readAgentBufferText(agentId)
      if (bufferSnapshot) {
        setAgents((prev) => {
          const next = new Map(prev)
          const data = next.get(agentId)
          if (!data) return prev
          if (data.rawOutput.length >= bufferSnapshot.length) return prev
          next.set(agentId, { ...data, rawOutput: bufferSnapshot })
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
        const data = next.get(agentId)
        if (data) {
          next.set(agentId, { ...data, state: updated })
        }
        return next
      })
    }
  }, [])

  const renameAgent = useCallback(async (agentId: string, name: string) => {
    const updated = await window.hydra.renameAgent(agentId, name)
    if (updated) {
      setAgents((prev) => {
        const next = new Map(prev)
        const data = next.get(agentId)
        if (data) {
          next.set(agentId, { ...data, state: updated })
        }
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
          const data = next.get(agentId)
          if (data) {
            next.set(agentId, { ...data, state: updated })
          }
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

  // Derived data
  const agentList = Array.from(agents.values()).map((d) => d.state)

  const projectGroups: ProjectGroup[] = (() => {
    const grouped = new Map<string, AgentState[]>()
    for (const data of agents.values()) {
      const dir = data.state.projectDir
      if (!grouped.has(dir)) grouped.set(dir, [])
      grouped.get(dir)!.push(data.state)
    }
    // Quantize to 1-minute buckets to prevent flickering when multiple
    // agents/projects produce output at the same time.
    const SORT_BUCKET_MS = 60_000
    const bucketize = (ts: string) => Math.floor(Date.parse(ts) / SORT_BUCKET_MS)
    const groups = Array.from(grouped.entries()).map(([dir, agts]) => {
      // Most recently active agent first within each project
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
  })()

  const selectedAgent = selectedAgentId ? agents.get(selectedAgentId) || null : null

  return {
    agents,
    agentList,
    projectGroups,
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

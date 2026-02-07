import { useState, useEffect, useCallback, useRef } from 'react'
import type {
  AgentState,
  CreateAgentPayload,
  AgentOutputPayload,
  AgentStatusPayload,
  ChatMessage,
  ProjectGroup
} from '@shared/types'
import { createPtyParser } from '@/lib/ptyParser'
import { basename } from '@/lib/pathUtils'
import { createTraceId, logEvent } from '@/lib/observability'

interface AgentData {
  state: AgentState
  parser: ReturnType<typeof createPtyParser>
  messages: ChatMessage[]
  rawOutput: string
}

export function useAgents(initialSelectedAgentId: string | null = null) {
  const [agents, setAgents] = useState<Map<string, AgentData>>(new Map())
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(initialSelectedAgentId)
  const selectedAgentIdRef = useRef<string | null>(initialSelectedAgentId)

  useEffect(() => {
    selectedAgentIdRef.current = selectedAgentId
  }, [selectedAgentId])

  // Listen for agent output
  useEffect(() => {
    const unsub = window.hydra.onAgentOutput((payload: AgentOutputPayload) => {
      setAgents((prev) => {
        const next = new Map(prev)
        const data = next.get(payload.agentId)
        if (!data) return prev

        const newMessages = data.parser.parseChunk(payload.data)
        next.set(payload.agentId, {
          ...data,
          messages: [...data.messages, ...newMessages],
          rawOutput: data.rawOutput + payload.data
        })
        return next
      })
    })
    return unsub
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
          sessionId: payload.sessionId ?? data.state.sessionId
        }
        next.set(payload.agentId, { ...data, state: updatedState })
        return next
      })
    })
    return unsub
  }, [])

  // Load existing agents on mount
  useEffect(() => {
    window.hydra.listAgents().then((agentList) => {
      const map = new Map<string, AgentData>()
      for (const state of agentList) {
        map.set(state.id, {
          state,
          parser: createPtyParser(),
          messages: [],
          rawOutput: ''
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
  }, [initialSelectedAgentId])

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
    const data: AgentData = {
      state,
      parser: createPtyParser(),
      messages: [],
      rawOutput: ''
    }
    setAgents((prev) => {
      const next = new Map(prev)
      next.set(state.id, data)
      return next
    })
    setSelectedAgentId(state.id)
    return state
  }, [])

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
    const updated = await window.hydra.restartAgent(agentId)
    if (updated) {
      setAgents((prev) => {
        const next = new Map(prev)
        const data = next.get(agentId)
        if (data) {
          next.set(agentId, {
            ...data,
            state: updated,
            messages: [],
            rawOutput: '',
            parser: createPtyParser()
          })
        }
        return next
      })
    }
  }, [])

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

  const sendInput = useCallback((agentId: string, input: string) => {
    logEvent({
      level: 'debug',
      event: 'renderer.agent.send-input',
      traceId: createTraceId('agent-send'),
      agentId,
      meta: { inputLength: input.length }
    })
    window.hydra.sendInput(agentId, input)

    // Add user message to chat
    setAgents((prev) => {
      const next = new Map(prev)
      const data = next.get(agentId)
      if (data) {
        const userMsg = data.parser.addUserMessage(input)
        next.set(agentId, {
          ...data,
          messages: [...data.messages, userMsg]
        })
      }
      return next
    })
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
    const sentTo = await window.hydra.broadcast(projectDir, input)

    // Add user message to all affected agents
    setAgents((prev) => {
      const next = new Map(prev)
      for (const agentId of sentTo) {
        const data = next.get(agentId)
        if (data) {
          const userMsg = data.parser.addUserMessage(input)
          next.set(agentId, {
            ...data,
            messages: [...data.messages, userMsg]
          })
        }
      }
      return next
    })

    return sentTo
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
    return Array.from(grouped.entries()).map(([dir, agts]) => ({
      projectDir: dir,
      projectName: basename(dir),
      agents: agts
    }))
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
    sendInput,
    sendTerminalInput,
    resizeTerminal,
    broadcastInput
  }
}

import { useMemo, useEffect, useCallback, useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  useSortable
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TerminalTile } from './TerminalTile'
import { BroadcastBar } from './BroadcastBar'
import { RUNNING_PROJECT_ID } from '@shared/types'
import type { ProjectGroup } from '@shared/types'
import { basename } from '@/lib/pathUtils'
import { useTileOrder } from '@/hooks/useTileOrder'
import styles from './GridView.module.css'

interface GridViewProps {
  projectGroups: ProjectGroup[]
  selectedProject: string | null
  onSelectProject: (projectDir: string) => void
  onTerminalData: (agentId: string, data: string) => void
  onTerminalResize: (agentId: string, cols: number, rows: number) => void
  onStartAgent: (agentId: string) => void
  onRemoveAgent: (agentId: string) => void
  onBroadcast: (input: string) => void
  onNewAgent: () => void
  rawOutputs: Map<string, string>
  expandedTileId: string | null
  onExpandedTileChange: (agentId: string | null) => void
}

const ACTIVE_STATUSES = ['running', 'starting']

function SortableTileWrapper({
  id,
  disabled,
  children
}: {
  id: string
  disabled: boolean
  children: (dragListeners: Record<string, unknown> | undefined) => React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id, disabled })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      {children(disabled ? undefined : listeners)}
    </div>
  )
}

export function GridView({
  projectGroups,
  selectedProject,
  onSelectProject,
  onTerminalData,
  onTerminalResize,
  onStartAgent,
  onRemoveAgent,
  onBroadcast,
  onNewAgent,
  rawOutputs,
  expandedTileId,
  onExpandedTileChange
}: GridViewProps) {
  const isRunning = selectedProject === RUNNING_PROJECT_ID

  const agents = useMemo(() => {
    if (isRunning) {
      const all = projectGroups.flatMap((g) => g.agents)
      return all
        .filter((a) => ACTIVE_STATUSES.includes(a.status))
        .sort((a, b) => {
          const aTime = Date.parse(a.startedAt || a.createdAt)
          const bTime = Date.parse(b.startedAt || b.createdAt)
          return bTime - aTime
        })
    }
    const currentGroup = projectGroups.find((g) => g.projectDir === selectedProject)
    return currentGroup?.agents || []
  }, [projectGroups, selectedProject, isRunning])

  const { orderedIds, handleReorder } = useTileOrder(selectedProject, agents, isRunning)

  const sortedAgents = useMemo(() => {
    const idIndex = new Map(orderedIds.map((id, i) => [id, i]))
    return [...agents].sort((a, b) => {
      const ai = idIndex.get(a.id) ?? Infinity
      const bi = idIndex.get(b.id) ?? Infinity
      return ai - bi
    })
  }, [agents, orderedIds])

  const isDragDisabled = !!expandedTileId || isRunning

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }
    })
  )

  const [, setActiveDragId] = useState<string | null>(null)

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id))
  }, [])

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null)
      const { active, over } = event
      if (!over || active.id === over.id) return
      handleReorder(String(active.id), String(over.id))
    },
    [handleReorder]
  )

  const handleDragCancel = useCallback(() => {
    setActiveDragId(null)
  }, [])

  const runningCount = useMemo(
    () => projectGroups
      .flatMap((g) => g.agents)
      .filter((a) => ACTIVE_STATUSES.includes(a.status)).length,
    [projectGroups]
  )

  // Auto-select first project if none selected
  useEffect(() => {
    if (!selectedProject && projectGroups.length > 0) {
      onSelectProject(projectGroups[0].projectDir)
    }
  }, [selectedProject, projectGroups, onSelectProject])

  useEffect(() => {
    if (expandedTileId && !agents.some((agent) => agent.id === expandedTileId)) {
      onExpandedTileChange(null)
    }
  }, [expandedTileId, agents, onExpandedTileChange])

  if (projectGroups.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No agents running.</p>
        <button className={styles.createBtn} onClick={onNewAgent}>
          + Create Agent
        </button>
      </div>
    )
  }

  const gridClass = expandedTileId ? styles.gridExpanded : styles.grid

  return (
    <div className={styles.container}>
      {/* Project selector */}
      <div className={styles.projectSelector}>
        <button
          className={`${styles.projectTab} ${isRunning ? styles.activeTab : ''}`}
          onClick={() => onSelectProject(RUNNING_PROJECT_ID)}
        >
          Running
          <span className={styles.tabCount}>{runningCount}</span>
        </button>
        {projectGroups.map((g) => (
          <button
            key={g.projectDir}
            className={`${styles.projectTab} ${g.projectDir === selectedProject ? styles.activeTab : ''}`}
            onClick={() => onSelectProject(g.projectDir)}
          >
            {g.projectName}
            <span className={styles.tabCount}>{g.agents.length}</span>
          </button>
        ))}
      </div>

      {/* Grid */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <SortableContext
          items={sortedAgents.map((a) => a.id)}
          strategy={rectSortingStrategy}
          disabled={isDragDisabled}
        >
          <div className={gridClass}>
            {sortedAgents.map((agent) => (
              <SortableTileWrapper
                key={agent.id}
                id={agent.id}
                disabled={isDragDisabled}
              >
                {(dragListeners) => (
                  <TerminalTile
                    agent={agent}
                    projectName={isRunning ? basename(agent.projectDir) : undefined}
                    rawOutput={rawOutputs.get(agent.id) || ''}
                    isExpanded={expandedTileId === agent.id}
                    onToggleExpand={() =>
                      onExpandedTileChange(expandedTileId === agent.id ? null : agent.id)
                    }
                    onTerminalData={(data) => onTerminalData(agent.id, data)}
                    onTerminalResize={(cols, rows) => onTerminalResize(agent.id, cols, rows)}
                    onStartOrRestart={() => onStartAgent(agent.id)}
                    onRemove={() => onRemoveAgent(agent.id)}
                    hidden={expandedTileId !== null && expandedTileId !== agent.id}
                    dragListeners={dragListeners}
                  />
                )}
              </SortableTileWrapper>
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Broadcast bar */}
      <BroadcastBar
        onBroadcast={onBroadcast}
        onNewAgent={onNewAgent}
        agentCount={agents.length}
      />
    </div>
  )
}

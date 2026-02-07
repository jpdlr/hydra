import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { ModelId } from '@shared/types'

export interface PersistedWorkspaceAgent {
  id: string
  name: string
  projectDir: string
  model: ModelId
  yolo: boolean
  isManager?: boolean
  sessionId: string | null
  createdAt: string
}

interface WorkspaceData {
  schemaVersion: number
  agents: PersistedWorkspaceAgent[]
}

const DEFAULT_WORKSPACE: WorkspaceData = {
  schemaVersion: 1,
  agents: []
}

export class WorkspaceStore {
  private readonly workspacePath: string
  private cache: WorkspaceData

  constructor() {
    const userDataPath = app.getPath('userData')
    mkdirSync(userDataPath, { recursive: true })
    this.workspacePath = join(userDataPath, 'workspace.json')
    this.cache = this.load()
  }

  getAgents(): PersistedWorkspaceAgent[] {
    return this.cache.agents.map((agent) => ({ ...agent }))
  }

  setAgents(agents: PersistedWorkspaceAgent[]): PersistedWorkspaceAgent[] {
    this.cache = {
      ...this.cache,
      agents: agents.map((agent) => ({ ...agent }))
    }
    this.save()
    return this.getAgents()
  }

  private load(): WorkspaceData {
    try {
      if (!existsSync(this.workspacePath)) {
        this.saveData(DEFAULT_WORKSPACE)
        return { ...DEFAULT_WORKSPACE, agents: [] }
      }

      const raw = readFileSync(this.workspacePath, 'utf-8')
      const parsed = JSON.parse(raw) as Partial<WorkspaceData>

      const agents = Array.isArray(parsed.agents)
        ? parsed.agents.filter((agent): agent is PersistedWorkspaceAgent => this.isAgent(agent))
        : []

      return {
        schemaVersion: 1,
        agents
      }
    } catch {
      this.saveData(DEFAULT_WORKSPACE)
      return { ...DEFAULT_WORKSPACE, agents: [] }
    }
  }

  private isAgent(value: unknown): value is PersistedWorkspaceAgent {
    if (!value || typeof value !== 'object') return false
    const obj = value as Record<string, unknown>
    return (
      typeof obj.id === 'string' &&
      typeof obj.name === 'string' &&
      typeof obj.projectDir === 'string' &&
      (obj.model === 'opus' || obj.model === 'sonnet' || obj.model === 'haiku') &&
      typeof obj.yolo === 'boolean' &&
      (typeof obj.sessionId === 'string' || obj.sessionId === null) &&
      typeof obj.createdAt === 'string'
    )
  }

  private save(): void {
    this.saveData(this.cache)
  }

  private saveData(data: WorkspaceData): void {
    try {
      writeFileSync(this.workspacePath, JSON.stringify(data, null, 2), 'utf-8')
    } catch (error) {
      console.error('Failed to persist workspace state:', error)
    }
  }
}

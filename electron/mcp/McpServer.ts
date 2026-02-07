import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http'
import { randomUUID } from 'crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import type { AgentManager } from '../agents/AgentManager'
import type { McpServerStatus } from '@shared/types'
import { setupManagerWorkspace } from './manager-workspace'

interface SessionEntry {
  server: McpServer
  transport: StreamableHTTPServerTransport
}

export class HydraMcpServer {
  private httpServer: Server | null = null
  private port: number | null = null
  private managerWorkspace: string | null = null
  private sessions = new Map<string, SessionEntry>()
  private error: string | null = null

  constructor(
    private readonly agentManager: AgentManager,
    private readonly userDataPath: string
  ) {}

  async start(): Promise<void> {
    const server = createServer((req, res) => {
      this.handleHttp(req, res).catch((err) => {
        console.error('[MCP] Request handler error:', err)
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Internal server error' }))
        }
      })
    })

    this.port = await new Promise<number>((resolve, reject) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address()
        if (addr && typeof addr === 'object') {
          resolve(addr.port)
        } else {
          reject(new Error('Failed to get server address'))
        }
      })
      server.on('error', reject)
    })

    this.httpServer = server
    this.managerWorkspace = setupManagerWorkspace(this.userDataPath, this.port)
    this.error = null
  }

  stop(): void {
    for (const [, entry] of this.sessions) {
      entry.transport.close().catch(() => {})
    }
    this.sessions.clear()

    if (this.httpServer) {
      this.httpServer.close()
      this.httpServer = null
    }
  }

  getStatus(): McpServerStatus {
    return {
      running: this.httpServer !== null,
      port: this.port,
      error: this.error,
      managerWorkspace: this.managerWorkspace
    }
  }

  private async handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${this.port}`)

    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
      return
    }

    // Handle DELETE for session cleanup
    if (req.method === 'DELETE') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      if (sessionId && this.sessions.has(sessionId)) {
        const entry = this.sessions.get(sessionId)!
        await entry.transport.handleRequest(req, res)
        this.sessions.delete(sessionId)
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Session not found' }))
      }
      return
    }

    // Handle GET for SSE stream (if client wants one)
    if (req.method === 'GET') {
      const sessionId = req.headers['mcp-session-id'] as string | undefined
      if (sessionId && this.sessions.has(sessionId)) {
        const entry = this.sessions.get(sessionId)!
        await entry.transport.handleRequest(req, res)
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Session ID required' }))
      }
      return
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Method not allowed' }))
      return
    }

    // Parse JSON body
    const body = await this.readBody(req)

    const sessionId = req.headers['mcp-session-id'] as string | undefined

    if (sessionId && this.sessions.has(sessionId)) {
      // Existing session
      const entry = this.sessions.get(sessionId)!
      await entry.transport.handleRequest(req, res, body)
    } else {
      // New session
      const entry = await this.createSession()
      await entry.transport.handleRequest(req, res, body)
    }
  }

  private async createSession(): Promise<SessionEntry> {
    const server = new McpServer(
      { name: 'hydra', version: '0.1.0' },
      { capabilities: { logging: {} } }
    )

    this.registerTools(server)

    const entry: SessionEntry = { server, transport: null as unknown as StreamableHTTPServerTransport }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      enableJsonResponse: true,
      onsessioninitialized: (sid: string) => {
        this.sessions.set(sid, entry)
      }
    })

    transport.onclose = () => {
      if (transport.sessionId) {
        this.sessions.delete(transport.sessionId)
      }
    }

    entry.transport = transport
    await server.connect(transport)

    return entry
  }

  private registerTools(server: McpServer): void {
    server.tool(
      'hydra_list_agents',
      'List all Hydra agents with their current status, model, project directory, and session info',
      {},
      async () => {
        const agents = this.agentManager.list()
        const summary = agents.map((a) => ({
          id: a.id,
          name: a.name,
          status: a.status,
          model: a.model,
          projectDir: a.projectDir,
          isManager: a.isManager,
          yolo: a.yolo,
          sessionId: a.sessionId
        }))
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }]
        }
      }
    )

    server.tool(
      'hydra_create_agent',
      'Create a new Hydra agent in a project directory. The agent will start a Claude CLI session.',
      {
        name: z.string().min(1).max(120).describe('Agent name'),
        projectDir: z.string().min(1).max(4096).describe('Absolute path to the project directory'),
        model: z.enum(['opus', 'sonnet', 'haiku']).describe('Claude model to use'),
        initialPrompt: z.string().max(20000).default('').describe('Initial prompt to send after startup'),
        yolo: z.boolean().default(false).describe('Skip all permission prompts')
      },
      async ({ name, projectDir, model, initialPrompt, yolo }) => {
        try {
          const state = this.agentManager.create({
            name,
            projectDir,
            model,
            yolo,
            initialPrompt,
            isManager: false // Prevent recursive managers
          })
          return {
            content: [
              {
                type: 'text' as const,
                text: `Agent created successfully:\n${JSON.stringify(
                  { id: state.id, name: state.name, status: state.status, projectDir: state.projectDir },
                  null,
                  2
                )}`
              }
            ]
          }
        } catch (err) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Failed to create agent: ${err instanceof Error ? err.message : String(err)}`
              }
            ],
            isError: true
          }
        }
      }
    )

    server.tool(
      'hydra_send_prompt',
      'Send a prompt/message to a specific agent. The agent must be running.',
      {
        agentId: z.string().min(1).max(128).describe('Agent ID'),
        prompt: z.string().min(1).max(20000).describe('Prompt text to send')
      },
      async ({ agentId, prompt }) => {
        const success = this.agentManager.sendInput(agentId, prompt)
        if (success) {
          return {
            content: [{ type: 'text' as const, text: `Prompt sent to agent ${agentId}` }]
          }
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: `Failed to send prompt to agent ${agentId}. Agent may not exist or not be running.`
            }
          ],
          isError: true
        }
      }
    )

    server.tool(
      'hydra_get_output',
      'Get recent terminal output from an agent. Returns the last N lines of the output buffer.',
      {
        agentId: z.string().min(1).max(128).describe('Agent ID'),
        lines: z.number().int().min(1).max(5000).default(100).describe('Number of lines to retrieve')
      },
      async ({ agentId, lines }) => {
        const buffer = this.agentManager.getBuffer(agentId)
        if (buffer.length === 0) {
          const agent = this.agentManager.get(agentId)
          if (!agent) {
            return {
              content: [{ type: 'text' as const, text: `Agent ${agentId} not found` }],
              isError: true
            }
          }
          return {
            content: [
              {
                type: 'text' as const,
                text: `Agent ${agentId} (${agent.name}) has no output yet. Status: ${agent.status}`
              }
            ]
          }
        }

        const tail = buffer.slice(-lines)
        return {
          content: [
            {
              type: 'text' as const,
              text: `Output from agent ${agentId} (last ${tail.length} of ${buffer.length} lines):\n\n${tail.join('\n')}`
            }
          ]
        }
      }
    )

    server.tool(
      'hydra_broadcast',
      'Send the same prompt to all agents working in a specific project directory',
      {
        projectDir: z.string().min(1).max(4096).describe('Project directory path'),
        prompt: z.string().min(1).max(20000).describe('Prompt to broadcast')
      },
      async ({ projectDir, prompt }) => {
        const sentTo = this.agentManager.broadcast(projectDir, prompt)
        if (sentTo.length === 0) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `No agents found for project directory: ${projectDir}`
              }
            ],
            isError: true
          }
        }
        return {
          content: [
            {
              type: 'text' as const,
              text: `Broadcast sent to ${sentTo.length} agent(s): ${sentTo.join(', ')}`
            }
          ]
        }
      }
    )

    server.tool(
      'hydra_kill_agent',
      'Kill a running agent. Sends SIGTERM followed by SIGKILL after timeout.',
      {
        agentId: z.string().min(1).max(128).describe('Agent ID to kill')
      },
      async ({ agentId }) => {
        const killed = this.agentManager.kill(agentId)
        if (killed) {
          return {
            content: [{ type: 'text' as const, text: `Kill signal sent to agent ${agentId}` }]
          }
        }
        return {
          content: [{ type: 'text' as const, text: `Agent ${agentId} not found` }],
          isError: true
        }
      }
    )

    server.tool(
      'hydra_restart_agent',
      'Restart an agent. Kills the current process and spawns a new one, preserving the session.',
      {
        agentId: z.string().min(1).max(128).describe('Agent ID to restart')
      },
      async ({ agentId }) => {
        const state = this.agentManager.restart(agentId)
        if (state) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Agent ${agentId} restarted. Status: ${state.status}, Restart count: ${state.restartCount}`
              }
            ]
          }
        }
        return {
          content: [{ type: 'text' as const, text: `Agent ${agentId} not found` }],
          isError: true
        }
      }
    )
  }

  private readBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      req.on('data', (chunk: Buffer) => chunks.push(chunk))
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf-8')
          resolve(raw ? JSON.parse(raw) : undefined)
        } catch (err) {
          reject(err)
        }
      })
      req.on('error', reject)
    })
  }
}

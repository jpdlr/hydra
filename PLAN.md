# Hydra

**A desktop app for orchestrating multiple Claude CLI agents in parallel.**

Each head thinks independently. You control them all.

---

## Concept

Hydra is a native macOS app that lets you spin up, monitor, and manage multiple Claude CLI instances from one window. Two switchable views — a **multi-terminal grid** for watching all agents at once and a **Codex/agent chat view** for focused conversation — let you work the way you want. A global settings panel lets you flip every instance into YOLO mode with one toggle.

**Launch it however you want:**
- `Hydra.app` from Applications / Spotlight / Dock
- `hydra` from any terminal

---

## Tech Stack

**Electron + React + electron-vite + TypeScript**

```
Electron Main Process (Node.js)
├── Agent Manager — spawns Claude CLI via node-pty
├── IPC handlers — bridge between processes
└── Config persistence — app.getPath("userData")

Electron Renderer Process (React)
├── Sidebar — project tree + session list
├── Main pane — dual view modes (terminal grid / chat)
├── Input bar — send prompts to agents
└── Settings — model, YOLO, theme, view mode
```

**Why this stack:**
- **Electron** — single `.app` bundle, Node.js main process for spawning CLI processes, built-in IPC
- **node-pty** — spawn Claude CLI with full PTY support (preserves colors, spinners, interactive prompts)
- **xterm.js** — render terminal output in the browser with full ANSI support
- **React + electron-vite** — fast dev, HMR for main/preload/renderer, familiar stack
- **electron-builder** — package as `Hydra.app` for macOS

**Security defaults (must-have):**
- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true` (where supported)
- Strict preload-only API surface
- IPC payload validation in main process

---

## Design & Theming

### Claude-Inspired Palette

Hydra's visual identity draws from Claude's warm, refined aesthetic — terracotta accents, warm neutrals, and soft elevation.

**Token reference:**

| Token | Light | Dark |
|-------|-------|------|
| `--color-bg` | `#FAF6F1` (warm cream) | `#1A1714` (deep brown-black) |
| `--color-surface` | `#FFFFFF` | `#2D2825` (warm charcoal) |
| `--color-surface-raised` | `#FFFFFF` | `#3D3632` (lighter brown) |
| `--color-sidebar` | `#F0EBE4` (warm stone) | `#231F1C` (dark brown) |
| `--color-accent` | `#D97757` (terracotta) | `#E08B6D` (lighter terracotta) |
| `--color-accent-hover` | `#C4623F` | `#D97757` |
| `--color-text-primary` | `#2D2420` (deep brown) | `#E8E0D8` (warm off-white) |
| `--color-text-secondary` | `#7A6F66` | `#A89E95` |
| `--color-text-muted` | `#B0A79E` | `#6B6058` |
| `--color-border` | `#E5DFD8` | `#3D3632` |
| `--color-status-running` | `#4CAF50` | `#66BB6A` |
| `--color-status-idle` | `#9E9E9E` | `#757575` |
| `--color-status-error` | `#E53935` | `#EF5350` |
| `--color-yolo` | `#E53935` | `#FF5252` |
| `--color-terminal-bg` | `#1E1B18` | `#141210` |
| `--color-terminal-text` | `#E8E0D8` | `#E8E0D8` |

### Typography

- **UI font**: System font stack (`-apple-system, BlinkMacSystemFont, ...`) — native macOS feel
- **Terminal font**: `"SF Mono", "Menlo", "Monaco", monospace`
- **Headings**: Semi-bold, letter-spacing `-0.01em`
- **Body**: Regular weight, line-height `1.5`

### Elevation & Radius

- Cards and surfaces use subtle `box-shadow` with warm-tinted shadows (not pure black)
- Border radius: `8px` for cards/panels, `6px` for buttons/inputs, `4px` for small elements
- Active agent in sidebar: left accent border (`3px solid var(--color-accent)`)

### Theme switching

- `[data-theme="light"]` and `[data-theme="dark"]` on `<html>`
- All colors via CSS variables — runtime switchable
- Terminal pane always uses dark palette regardless of app theme

---

## View Modes

Hydra has two switchable layouts. Toggle with `Cmd+\` or the view switcher in the header.

### 1. Multi-Terminal View (Grid)

Select a **project** and see all its agents as a grid of live terminal panes. Each pane is an xterm.js instance streaming real-time output. Best for monitoring multiple agents working on the same codebase.

```
┌──────────────────────────────────────────────────────────────────────┐
│  HYDRA          my-app ▾      [Grid ◉ | Chat ○]   [YOLO: OFF]  [⚙] │
├──────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────┐ ┌──────────────────────────────────┐ │
│ │ ● Auth Module          opus │ │ ● API Routes            sonnet  │ │
│ │─────────────────────────────│ │──────────────────────────────────│ │
│ │ > Reading src/auth/login.ts │ │ > Adding GET /users endpoint    │ │
│ │ > Adding input validation   │ │ > Writing route handler...      │ │
│ │ > Running tests...          │ │ > ✓ 8 tests passing             │ │
│ │ > ✓ All 12 tests passing    │ │                                 │ │
│ │                             │ │                                 │ │
│ ├─────────────────────────────┤ ├──────────────────────────────────┤ │
│ │ > ...                   [↵] │ │ > ...                       [↵] │ │
│ └─────────────────────────────┘ └──────────────────────────────────┘ │
│ ┌─────────────────────────────┐                                     │
│ │ ○ Tests              sonnet │                                     │
│ │─────────────────────────────│                                     │
│ │ (idle)                      │                                     │
│ │                             │                                     │
│ ├─────────────────────────────┤                                     │
│ │ > ...                   [↵] │                                     │
│ └─────────────────────────────┘                                     │
├──────────────────────────────────────────────────────────────────────┤
│ [+ Agent]                              Broadcast: > ...         [↵] │
└──────────────────────────────────────────────────────────────────────┘
```

- Each tile shows agent name, model, status badge
- Each tile has its own mini input bar
- Bottom broadcast bar sends to all agents in the project
- Grid auto-arranges: 1 agent = full width, 2 = side-by-side, 3-4 = 2x2, etc.
- Click a tile to expand it full-width (click again to return to grid)
- Red border glow on tiles with YOLO active

### 2. Codex / Agent Chat View

Sidebar lists **all projects** and their **sessions/agents**. The main pane shows a **chat-style interface** for the selected agent — styled like a conversational AI interface with message bubbles, not raw terminal output.

```
┌──────────────────────────────────────────────────────────────────────┐
│  HYDRA                        [Grid ○ | Chat ◉]   [YOLO: OFF]  [⚙] │
├───────────────┬──────────────────────────────────────────────────────┤
│  ⌕ Search     │                                                      │
│               │  Auth Module                                         │
│ PROJECTS      │  my-app · opus · ● Running                           │
│               │ ──────────────────────────────────────────────────── │
│ ▼ my-app      │                                                      │
│   ● Auth Mo…  │  ┌──────────────────────────────────────────────┐    │
│   ● API Rou…  │  │ Work on the authentication module and add    │    │
│   ○ Tests     │  │ input validation to the login handler.       │    │
│               │  └──────────────────────────────────────────────┘    │
│ ▼ dashboard   │                                                      │
│   ● Styling   │  ┌─ Claude ──────────────────────────────────────┐   │
│               │  │ I'll start by reading the login handler to    │   │
│ ▼ ml-pipeline │  │ understand the current implementation...      │   │
│   ● Data pr…  │  │                                               │   │
│               │  │ ```ts                                         │   │
│               │  │ // src/auth/login.ts                          │   │
│               │  │ export async function handleLogin(…) {        │   │
│               │  │ ```                                           │   │
│ ───────────── │  │                                               │   │
│ + New Agent   │  │ I found the issue — there's no input          │   │
│               │  │ sanitization. Let me add validation...        │   │
│ JP            │  └───────────────────────────────────────────────┘   │
│               │                                                      │
│               │  ● Thinking...                                       │
│               │                                                      │
│───────────────│──────────────────────────────────────────────────────│
│               │ > Send a message...                model: opus   [↵] │
└───────────────┴──────────────────────────────────────────────────────┘
```

- Sidebar: projects as collapsible groups, agents/sessions listed below each
- Search bar at top to filter across all projects and sessions
- Main pane: chat bubbles with user prompts (right-aligned) and Claude responses (left-aligned)
- Code blocks rendered with syntax highlighting
- Agent header: name, project, model, status, YOLO badge
- Tool calls and file edits shown as collapsible cards within the chat flow
- Active "thinking" indicator when agent is working
- User profile / settings access at bottom of sidebar
- Option to toggle raw terminal output within the chat view (for debugging)

### View mode behavior

- **Grid view** is project-scoped: select a project, see all its agents
- **Chat view** is agent-scoped: select any agent from any project, see its conversation
- Agent state is shared — switching views doesn't restart or duplicate processes
- xterm.js instances run in both modes; chat view parses PTY output into structured messages
- `Cmd+\` toggles between views; remembered per session

**Status indicators (both views):**
- `●` Green = running
- `○` Gray = idle / stopped
- `✖` Red = errored
- Red glow / border = YOLO mode active on that agent

---

## Core Features

### 1. Agent Management
- **Add agents instantly** — pick a project directory, give it a name, launch a Claude CLI process
- **Per-project grouping** — agents organized under project folders in the sidebar
- **Kill / restart / pause** — full lifecycle control per agent
- **Session resumption** — agents track their Claude `sessionId`; restarts resume the conversation via `--resume`
- **Agent templates** — save common configs (model, prompt prefix, allowed tools) for quick re-launch

### 2. YOLO Mode (Global + Per-Agent)
- **Global toggle** — flips all agents to `--dangerously-skip-permissions`
- **Per-agent override** — individual agents can opt in/out
- **Context-preserving toggle** — YOLO restart uses `--resume <sessionId>` to maintain conversation
- Visual indicator (red border / badge) when running dangerous
- Confirmation dialog before enabling global YOLO

### 3. Input & Interaction
- **Send prompts** to any agent from the input bar (chat view) or per-tile input (grid view)
- **Broadcast mode** — send the same instruction to all agents in a project
- **Quick-switch** — `Cmd+1..9` to jump between agents

### 4. Settings
- Model selection (opus, sonnet, haiku) — per agent or global default
- YOLO mode toggle
- Max concurrent agents limit
- Default project directory
- Theme (light / dark)
- Default view mode (grid / chat)
- Persisted to `<userData>/config.json`

---

## Process Architecture

```
Hydra.app
├── Main Process (Node.js)
│   ├── AgentManager
│   │   ├── node-pty → claude --project-dir /path/to/project-a
│   │   ├── node-pty → claude --dangerously-skip-permissions --project-dir /path/to/project-b
│   │   └── node-pty → claude --model opus --resume <sessionId> --project-dir /path/to/project-c
│   ├── IPC Channel: "agent:create" / "agent:kill" / "agent:input" / "agent:output"
│   └── ConfigStore → <userData>/config.json
│
└── Renderer Process (React)
    ├── Sidebar (project tree + session list)
    ├── Grid View (xterm.js tiles per project)
    ├── Chat View (parsed message bubbles)
    ├── Input Bar (sends input via IPC)
    └── Settings Panel
```

**Data flow:**
1. User clicks "+ Agent" → renderer sends `agent:create` via IPC
2. Main process spawns `claude` via `node-pty` with the right flags
3. PTY output streams back to renderer via `agent:output` IPC channel
4. Renderer pipes output into xterm.js (grid view) and/or parses into chat messages (chat view)
5. User types in input bar → `agent:input` IPC → main process writes to PTY stdin

### Startup Preflight
1. Check `claude` exists on `PATH`
2. Check `claude --version` runs successfully
3. Show remediation steps if preflight fails
4. Block new agent creation until preflight passes

### Claude CLI Flags

```bash
# Standard interactive agent
claude --project-dir /path/to/project

# YOLO mode
claude --dangerously-skip-permissions --project-dir /path/to/project

# With initial prompt (write to stdin after spawn, NOT -p which is non-interactive)
# Spawn: claude --project-dir /path/to/project
# Then write to stdin: "Build the auth module\n"

# Model selection
claude --model opus --project-dir /path/to/project

# Resume a previous session (preserves conversation context)
claude --resume <sessionId> --project-dir /path/to/project

# YOLO toggle restart (resume + new flag)
claude --dangerously-skip-permissions --resume <sessionId> --project-dir /path/to/project
```

---

## Data Model

```
<userData>/                 # Electron app.getPath("userData")
├── config.json             # Global settings
├── projects/
│   ├── project-a.json      # Agent configs for project A
│   └── project-b.json      # Agent configs for project B
└── logs/
    └── <agent-id>.log      # Output logs per session
```

Example macOS path:
`~/Library/Application Support/Hydra`

**config.json:**
```json
{
  "schemaVersion": 1,
  "defaultModel": "sonnet",
  "globalYolo": false,
  "maxAgents": 8,
  "theme": "dark",
  "defaultViewMode": "chat",
  "defaultProjectDir": "/Users/jp/Documents/Personal/GitHub Projects"
}
```

**Agent config:**
```json
{
  "id": "abc123",
  "name": "Auth Module",
  "projectDir": "/Users/jp/projects/my-app",
  "model": "opus",
  "yolo": false,
  "sessionId": null,
  "initialPrompt": "Work on the authentication module",
  "createdAt": "2026-02-06T10:00:00Z"
}
```

`sessionId` is populated after the first Claude CLI response and persisted. Used for `--resume` on restart, YOLO toggle, and app relaunch.

---

## Security Model

- Renderer has no direct Node.js, filesystem, or child-process access.
- Privileged actions are only available through preload-exposed APIs.
- All IPC payloads are validated before execution in main process.
- Agent commands are built from typed options, never shell string concatenation.
- Renderer only receives output events for known agent IDs.
- YOLO toggles are audited (timestamp, scope, agent IDs).

---

## Reliability and Resource Management

### Process Lifecycle
- Track PID, start time, status, sessionId, and restart count per agent.
- Stop flow: graceful terminate first, then force kill after timeout.
- On app quit: stop all agents, then force-kill remaining children.
- Verify teardown to prevent zombie/orphan processes.

### Restart and Failure Policy
- Manual restart is immediate stop + clean respawn with `--resume`.
- Crash restart uses bounded exponential backoff with `--resume`.
- Mark agent `errored` after repeated failures in a rolling window.

### Output and Memory Policy
- Bounded in-memory scrollback per agent (configurable line cap).
- Full output streamed to rotating log files on disk.
- Batch/rate-limit IPC output events to avoid renderer overload.

### Same-Workspace Guardrails
- Detect when multiple agents target the same project/worktree.
- Warn before broadcast to overlapping worktrees.
- Optional single-writer mode: one edit-enabled agent, others advisory-only.

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Cmd+N` | New agent |
| `Cmd+W` | Close selected agent |
| `Cmd+R` | Restart selected agent |
| `Cmd+\` | Toggle view mode (grid / chat) |
| `Cmd+Y` | Toggle YOLO for selected agent |
| `Cmd+Shift+Y` | Toggle global YOLO |
| `Cmd+,` | Settings |
| `Tab` | Switch focus (sidebar <-> main pane) |
| `Up/Down` | Navigate sidebar |
| `Enter` | Select agent / send message |
| `Cmd+1..9` | Quick-switch to agent by index |
| `Cmd+Shift+B` | Broadcast mode |
| `Cmd+Q` | Quit (confirms if agents running) |

---

## Project Structure

```
hydra/
├── electron/
│   ├── main.ts              # Electron main process entry
│   ├── preload.ts           # Context bridge (exposes IPC to renderer)
│   ├── agents/
│   │   └── AgentManager.ts  # Spawn, kill, restart, resume Claude CLI processes
│   ├── config/
│   │   └── ConfigStore.ts   # Read/write <userData>/config.json
│   └── ipc/
│       └── handlers.ts      # IPC handler registration
├── shared/
│   └── types.ts             # Agent, Config, IPC interfaces (shared by main + renderer)
├── src/                      # React renderer
│   ├── App.tsx
│   ├── components/
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── ProjectTree.tsx
│   │   │   ├── AgentItem.tsx
│   │   │   └── SearchBar.tsx
│   │   ├── GridView/
│   │   │   ├── GridView.tsx        # Auto-arranging terminal grid
│   │   │   ├── TerminalTile.tsx    # xterm.js tile with header + mini input
│   │   │   └── BroadcastBar.tsx    # Send to all agents in project
│   │   ├── ChatView/
│   │   │   ├── ChatView.tsx        # Conversational message view
│   │   │   ├── MessageBubble.tsx   # User / Claude message rendering
│   │   │   ├── CodeBlock.tsx       # Syntax-highlighted code in messages
│   │   │   ├── ToolCallCard.tsx    # Collapsible tool-use / file-edit card
│   │   │   └── ThinkingIndicator.tsx
│   │   ├── Terminal/
│   │   │   └── TerminalPane.tsx    # xterm.js wrapper (used by both views)
│   │   ├── Settings/
│   │   │   └── SettingsPanel.tsx
│   │   ├── Header/
│   │   │   ├── Header.tsx
│   │   │   └── ViewSwitcher.tsx    # Grid / Chat toggle
│   │   └── NewAgent/
│   │       └── NewAgentDialog.tsx  # Directory picker + name + model + YOLO
│   ├── hooks/
│   │   ├── useAgents.ts
│   │   ├── useConfig.ts
│   │   └── useViewMode.ts
│   ├── lib/
│   │   └── ptyParser.ts           # Parse PTY output into structured chat messages
│   ├── styles/
│   │   ├── tokens.css             # CSS variables — all theme tokens
│   │   └── global.css
│   └── main.tsx
├── electron.vite.config.ts   # electron-vite config (main + preload + renderer)
├── electron-builder.yml      # macOS .app packaging config
├── tsconfig.json
├── tsconfig.node.json        # For electron + shared
├── package.json
└── README.md
```

---

## Distribution

### macOS App Bundle
- **electron-builder** packages into `Hydra.app`
- DMG installer for drag-to-Applications install
- Code signing (optional, for Gatekeeper)

### CLI Launcher
Add a shell script to PATH so `hydra` opens the app from anywhere:

```bash
#!/bin/bash
# ~/.local/bin/hydra (or /usr/local/bin/hydra)
open -a Hydra
```

Or register a CLI entry via Electron:
```json
// package.json
{
  "bin": {
    "hydra": "./cli.js"
  }
}
```

Where `cli.js` opens the Electron app or connects to a running instance.

### Launch Methods
| Method | How |
|--------|-----|
| Spotlight | `Cmd+Space` -> "Hydra" -> `Enter` |
| Dock | Pin to Dock, click |
| Terminal | `hydra` from anywhere |
| Finder | Double-click `Hydra.app` in Applications |

---

## Implementation Phases

### Phase 0 — Technical Risk Spike
- [ ] Validate `node-pty` in Electron dev mode and packaged app
- [ ] Validate Claude preflight (`PATH` and `claude --version`)
- [ ] Validate PTY lifecycle (spawn, graceful stop, force kill)
- [ ] Validate xterm.js throughput under sustained output
- [ ] Validate `--resume` flag for session continuity
- [ ] Document native module rebuild strategy for packaging/CI

**Exit criteria:**
- A spike build can run and stop Claude cleanly in dev and packaged app
- Session resume works after process restart
- Rebuild steps for native modules are reproducible in CI
- No orphan processes remain after app quit in smoke tests

### Phase 1 — Scaffold + Single Agent (Chat View)
- [ ] electron-vite + React project scaffold
- [ ] Claude-inspired theme tokens (`tokens.css`) with light + dark
- [ ] Basic layout: sidebar + chat view + input bar
- [ ] Spawn one Claude CLI process via node-pty in main process
- [ ] Stream PTY output to renderer via IPC
- [ ] PTY output parser: convert terminal output into structured chat messages
- [ ] Render chat messages with styled bubbles (user / Claude)
- [ ] Send input from input bar to PTY stdin
- [ ] Track and persist `sessionId` from Claude CLI
- [ ] Enable Electron security defaults
- [ ] Enforce IPC schema validation

**Exit criteria:**
- Single-agent chat flow works end-to-end (spawn, parsed output, input, stop)
- Chat view renders code blocks and tool calls as cards
- Security defaults are active and covered by tests
- Renderer crash does not break main process lifecycle controls

### Phase 2 — Multi-Agent + Grid View
- [ ] AgentManager: create, list, kill, restart (with `--resume`) agents
- [ ] Sidebar: project tree with agent/session list
- [ ] Switch between agents in chat view
- [ ] Grid view: auto-arranging terminal tiles per project
- [ ] Per-tile xterm.js instances with mini input bars
- [ ] View switcher (grid / chat) with `Cmd+\`
- [ ] Per-project grouping and collapsible sections
- [ ] Same-workspace collision warning
- [ ] Process cleanup guarantees on delete/quit

**Exit criteria:**
- 8 concurrent agents run without UI lockups on target hardware
- Both views render correctly and share agent state
- Grid auto-layout handles 1-8 agents gracefully
- Restart/delete leaves no orphan processes; sessions resume correctly
- Same-workspace warning is reliable

### Phase 3 — YOLO & Settings
- [ ] Per-agent YOLO toggle (restart with `--dangerously-skip-permissions --resume`)
- [ ] Global YOLO toggle with confirmation dialog
- [ ] Settings panel (model, theme, max agents, default dir, default view)
- [ ] ConfigStore: persist to `<userData>/config.json`
- [ ] Theme switching (light / dark) via CSS variables
- [ ] Persist YOLO audit events

**Exit criteria:**
- YOLO toggles preserve conversation context via `--resume`
- YOLO toggles are explicit, confirmed, and visually obvious
- Settings survive restart with config schema versioning
- Audit entries include timestamp, scope, and target agent IDs

### Phase 4 — Polish
- [ ] Agent templates / presets
- [ ] Broadcast mode (input to all agents in a project)
- [ ] Session logging to `<userData>/logs/`
- [ ] New Agent dialog (directory picker + name + model + YOLO)
- [ ] Search bar in sidebar (filter projects and sessions)
- [ ] Raw terminal toggle within chat view
- [ ] Keyboard shortcuts
- [ ] Click-to-expand tile in grid view

**Exit criteria:**
- Log rotation prevents unbounded disk growth
- Broadcast handles partial failures without blocking other agents
- Keyboard shortcuts are conflict-checked on macOS

### Phase 5 — Package & Ship
- [ ] electron-builder config for macOS .app + DMG
- [ ] CLI launcher script
- [ ] App icon (Hydra heads in terracotta/Claude palette)
- [ ] README + demo GIF
- [ ] GitHub repo: `jpdlr/hydra`
- [ ] First release

**Exit criteria:**
- Packaging commands are documented and repeatable
- Fresh-machine smoke test passes (launch, create agent, send prompt, quit cleanly)
- Release checklist and rollback plan are documented

---

## Testing and CI

### Test Layers
- Unit tests: reducer/state logic, config parsing/migrations, IPC schemas, PTY output parser
- Component tests: sidebar, chat view, grid view, settings, YOLO confirmation, view switcher
- Integration tests (main process): AgentManager lifecycle with fake PTY process, session resume
- End-to-end smoke tests: launch app, create agent, stream output, send input, switch views, shutdown cleanup

### CI Gates
- Lint + typecheck + tests required on every pull request
- macOS packaged-app smoke test job required before release
- Native dependency rebuild verification for `node-pty`

---

## Non-Goals (MVP)

- No remote/distributed orchestration in initial release
- No plugin marketplace or public extension API in initial release
- No cloud sync for configs/logs in initial release
- No non-macOS support in initial release

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `electron` | Desktop app shell |
| `electron-builder` | Package as .app / DMG |
| `electron-vite` | Build main + preload + renderer with HMR |
| `@electron/rebuild` | Rebuild native modules (`node-pty`) for Electron's Node headers |
| `node-pty` | Spawn Claude CLI with full PTY |
| `xterm` + `@xterm/addon-fit` | Render terminal output in browser |
| `react` + `react-dom` | UI framework |
| `typescript` | Type safety |
| `zod` (or equivalent) | IPC payload validation |
| `vitest` + `@testing-library/react` | Unit/component tests |
| `playwright` (Electron mode) | End-to-end smoke tests |

---

## Why This Works

- Claude CLI handles all the hard parts (API, tool use, file editing, auth)
- Hydra is purely orchestration — spawn processes, route I/O, manage lifecycle
- `node-pty` gives full interactive terminal experience (colors, spinners, prompts)
- `xterm.js` renders it pixel-perfect in the grid view
- Chat view parses PTY output into a polished conversational UI
- `--resume` preserves context across restarts and YOLO toggles
- `--dangerously-skip-permissions` already exists for YOLO mode
- Electron gives native app experience + terminal command access
- Single `.app` bundle, no runtime dependencies for the end user

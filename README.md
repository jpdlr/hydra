<div align="center">

# Hydra

**Orchestrate Claude Code and OpenAI Codex agents in parallel from a single desktop app.**

Hydra is a cross-platform desktop application (macOS + Windows) that lets you run, monitor, and coordinate multiple Claude Code and OpenAI Codex CLI sessions side by side — with live terminals, session resume, headless runs, and a built-in MCP orchestration layer.

[Getting Started](#getting-started) | [Features](#features) | [Documentation](#documentation) | [Contributing](#contributing)

</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
  - [Multi-Agent Workspace](#multi-agent-workspace)
  - [Chat and Grid Views](#chat-and-grid-views)
  - [Session Management](#session-management)
  - [MCP Manager Agent](#mcp-manager-agent)
  - [Headless Orchestration](#headless-orchestration)
  - [Usage Dashboard and Budgets](#usage-dashboard-and-budgets)
  - [Remote Control and Hydra Remote PWA](#remote-control-and-hydra-remote-pwa)
  - [Observability](#observability)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Building from Source](#building-from-source)
- [Documentation](#documentation)
  - [Configuration](#configuration)
  - [Scripts](#scripts)
  - [CI/CD](#cicd)
  - [Release](#release)
- [Tech Stack](#tech-stack)
- [Contributing](#contributing)
- [License](#license)

## Overview

Working on a complex project often means juggling multiple coding tasks at once — a backend API, frontend components, tests, migrations. Hydra gives you a single window to spin up independent AI coding agents, each with its own terminal, project context, and session history. Switch between a focused chat view and a tiled grid overview, resume sessions across restarts, and let a manager agent coordinate the whole fleet.

### Why Hydra?

- **Parallel workflows** — Run agents across different projects or branches simultaneously
- **Multi-provider support** — Use Claude Code or OpenAI Codex agents in the same workspace
- **Session continuity** — Import and resume existing Claude sessions; workspace state persists across relaunches
- **Orchestration built in** — The MCP manager agent can spawn, message, and coordinate other agents autonomously
- **Headless runs** — Queue background tasks that run without a terminal, with full log history
- **Usage visibility** — Track token/cost-style usage signals per day, project, and agent
- **Windows in-app updates** — Detect, download, and install new releases from GitHub Releases
- **Native performance** — Electron app with real PTY terminals via `node-pty` and `xterm.js`

## Features

### Multi-Agent Workspace

Run up to 10 concurrent agents (hard limit), each in its own PTY session. Agents are grouped by project directory in the sidebar, with per-agent and global YOLO mode toggles for skipping permission prompts.

- Per-agent controls: start, restart, kill, remove
- Global and per-agent YOLO mode
- Workspace persistence — your agent set is restored on next launch
- Resizable sidebar with project groups sorted by recency

### Chat and Grid Views

Two ways to interact with your agents:

- **Chat view** — Focused single-agent interface with a terminal pane and input bar. Supports terminal and bubble render modes.
- **Grid view** — Tiled overview of all agents in a project. Expandable tiles, broadcast input to all agents at once, and per-tile actions.

Toggle between views with `Cmd+\` on macOS or `Ctrl+\` on Windows/Linux.

### Session Management

Hydra imports session history from your Claude sessions directory (typically `~/.claude/projects`) on startup and lets you resume any previous Claude session from the New Agent dialog.

- Filter sessions by age (default: last 7 days), project prefix, or search query
- Hidden session management
- Automatic `sessionId` discovery for reliable resume
- Configurable import limits

### MCP Manager Agent

A special agent type that orchestrates other agents via the [Model Context Protocol](https://modelcontextprotocol.io). The manager runs its own HTTP/SSE MCP server and exposes tools for:

| Tool | Description |
|------|-------------|
| `hydra_list_agents` | List all agents with status, model, and project info |
| `hydra_create_agent` | Spawn new agents in any project directory |
| `hydra_send_prompt` | Send a message to a specific agent |
| `hydra_get_output` | Retrieve recent output from an agent |
| `hydra_broadcast` | Send the same prompt to all agents in a project |
| `hydra_kill_agent` | Gracefully stop an agent |
| `hydra_restart_agent` | Restart an agent while preserving session state |

The manager workspace is always pinned to the top of the sidebar for quick access.

### Headless Orchestration

Queue non-interactive background runs that execute without a visible terminal. Useful for batch tasks, CI-style prompts, or long-running operations.

- In-app panel with search, filtering, and detailed log viewer
- Structured JSONL logs per run
- Session resume support
- Run lifecycle management (start, monitor, cancel)

### Usage Dashboard and Budgets

Hydra aggregates usage signals parsed from CLI output into a dashboard grouped by day, project, and agent.

- Daily rollups for tokens and cost-like values
- Per-project and per-agent breakdown tables
- Soft daily budget limits (tokens and USD)
- Warning notifications when usage reaches threshold or exceeds budget

### Remote Control and Hydra Remote PWA

Hydra can expose a temporary remote-control session that your phone joins by scanning a desktop QR code.

- Desktop session flow: `Disconnected` -> `Creating session` -> `Waiting for mobile` -> `Mobile connected`
- Mobile connection now performs an explicit handshake so desktop status flips to connected as soon as phone auth succeeds
- Mobile web UI supports:
  - Project-folder grouping
  - Collapsible project sections
  - Project-level search (`Search projects...`)
- PWA install support on iOS/Android (Add to Home Screen / Install)
- PWA update behavior is auto-refresh oriented: checks for updates on open/focus/visibility and activates new service worker immediately when available

### Observability

Built-in structured logging and diagnostics for debugging and monitoring.

- Structured JSONL logs with rotation (`<userData>/logs/hydra.log.jsonl`)
- Renderer and main process error capture
- Diagnostics export bundle from Settings (logs + runtime snapshot)
- Optional remote error reporting endpoint (opt-in)

## Getting Started

### Prerequisites

- **macOS** (x86_64 or Apple Silicon) or **Windows** (x64)
- **Node.js 20+**
- **Claude Code CLI** available on PATH as `claude`
- **OpenAI Codex CLI** (optional) available on PATH as `codex` for Codex provider support

### Installation

Download the latest release from [GitHub Releases](https://github.com/jpdlr/hydra/releases), or build from source.

### Building from Source

```bash
git clone git@github.com:jpdlr/hydra.git
cd hydra
npm install
npm run build
npm run dist:mac    # Package macOS build
npm run dist:win    # Package Windows installer (.exe)
```

For development with hot reload:

```bash
npm run dev
```

## Documentation

### Configuration

App configuration is stored in `<userData>/config.json`:

| Setting | Description | Default |
|---------|-------------|---------|
| `defaultProvider` | Default AI provider (`claude` or `codex`) | `claude` |
| `defaultModel` | Default model for new agents | `sonnet` |
| `maxAgents` | Maximum concurrent agents | `8` |
| `theme` | UI theme (`light`, `dark` = Terracotta, or `midnight`) | `dark` |
| `defaultViewMode` | Startup view (`chat` or `grid`) | `chat` |
| `sessionMaxAgeDays` | Max session age to display (0 = no limit) | `7` |
| `sessionImportLimit` | Max sessions to import (0 = unlimited) | `500` |
| `globalYolo` | Skip all permission prompts globally | `false` |
| `usageDailyTokenBudget` | Soft token budget per day (0 = disabled) | `0` |
| `usageDailyCostBudgetUsd` | Soft USD budget per day (0 = disabled) | `0` |
| `usageBudgetWarningThresholdPct` | Warning threshold percentage for budgets | `80` |
| `remoteControlEnabled` | Auto-enable remote control on app startup | `false` |
| `remoteSessionTimeoutMinutes` | Remote session expiration window (clamped 30-1440) | `480` |

Additional state files:

- **Workspace state** (`<userData>/workspace.json`) — Persisted agents restored on launch
- **UI state** (localStorage) — Selected project, agent, view mode, sidebar width, expanded tiles
- **Logs** (`<userData>/logs/hydra.log.jsonl`) — Structured observability logs with rotation

Remote Control Firebase settings are environment-based:

- **Desktop app (`electron/remote`)** reads `HYDRA_FIREBASE_*` from the project root `.env` (see `.env.example`)
- **Mobile web app (`hydra-remote`)** reads `VITE_FIREBASE_*` from `hydra-remote/.env` (see `hydra-remote/.env.example`)
- **GitHub release builds** read `MAIN_VITE_HYDRA_FIREBASE_*` from repository Variables/Secrets populated from `HYDRA_FIREBASE_*` values.

For release workflows, configure these repository-level variables or secrets:

- `HYDRA_FIREBASE_API_KEY`
- `HYDRA_FIREBASE_AUTH_DOMAIN`
- `HYDRA_FIREBASE_PROJECT_ID`
- `HYDRA_FIREBASE_STORAGE_BUCKET`
- `HYDRA_FIREBASE_MESSAGING_SENDER_ID`
- `HYDRA_FIREBASE_APP_ID`
- `HYDRA_FIREBASE_MEASUREMENT_ID` (optional)

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Run in development mode with hot reload |
| `npm run build` | Build main, preload, and renderer bundles |
| `npm run typecheck` | TypeScript checks (node + web) |
| `npm run lint` | Run ESLint |
| `npm test` | Run tests (Vitest) |
| `npm run dist` | Package with electron-builder |
| `npm run dist:mac` | Build macOS artifacts |
| `npm run dist:win` | Build Windows installer artifacts |
| `npm run dist:dry-run` | Signed build without publishing |
| `npm run dist:mac:dry-run` | macOS dry run without publishing |
| `npm run dist:win:dry-run` | Windows dry run without publishing |
| `npm run release:preflight` | Verify signing/notarization environment |
| `npm run deploy` | Run local release deployment script (typecheck, test, build, package, install) |
| `npm run firebase:deploy:hosting` | Build/deploy Hydra Remote PWA hosting |

### CI/CD

GitHub Actions runs on every push and pull request:

- **CI** (`.github/workflows/ci.yml`) — Lint, typecheck, and test on Ubuntu + Windows with Node.js 20
- **Release** (`.github/workflows/release.yml`) — macOS signed/notarized builds plus Windows installer builds on `v*` tags or manual dispatch

### Release

Releases are published as GitHub draft releases with signed/notarized macOS binaries and Windows installer artifacts.

```bash
# Tag a release
git tag v0.1.0
git push origin v0.1.0

# Or trigger a dry run manually from GitHub Actions
```

Project release flow used in this repository:

1. Commit pending changes (Conventional Commit format)
2. Bump patch version in `package.json`
3. Create matching git tag `vX.Y.Z`
4. Push commit + tags
5. Run local deploy script:

```bash
bash scripts/deploy-local.sh
```

Required repository secrets for macOS signing:

`CSC_LINK` `CSC_KEY_PASSWORD` `CSC_NAME` `APPLE_ID` `APPLE_APP_SPECIFIC_PASSWORD` `APPLE_TEAM_ID`

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Electron 33 |
| Frontend | React 18 + TypeScript |
| Build | electron-vite + Vite 5 |
| Terminal | node-pty + xterm.js |
| Orchestration | Model Context Protocol (MCP) SDK |
| Validation | Zod |
| Testing | Vitest + React Testing Library |
| Packaging | electron-builder |

## Contributing

Contributions are welcome. Please read the [Code of Conduct](CODE_OF_CONDUCT.md) before participating.

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Run quality checks before submitting:
   ```bash
   npm run lint && npm run typecheck && npm test
   ```
4. Open a pull request against `main`

## License

[MIT](LICENSE) - 2026 jpdlr

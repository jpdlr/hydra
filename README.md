# Hydra

Hydra is an Electron desktop app for running and supervising multiple Claude Code CLI sessions in parallel.

## What it does

- Chat view with a focused single-session terminal and input bar
- Grid view with multiple live terminals, per-tile start/restart/remove actions, and project broadcast
- Claude session import on startup from `~/.claude/projects`
- Resume existing Claude sessions from the New Agent dialog
- Global and per-agent YOLO toggles
- Workspace persistence for Hydra-created agents across relaunches
- Persistent UI state (last selected project/agent/view and expanded grid tile)
- Persisted app settings in Electron `userData`
- Headless orchestration via IPC plus in-app Headless Runs panel with search/filter/details/log history
- Structured JSONL observability logs with renderer/main error capture
- Diagnostics export bundle (logs + runtime snapshot) from Settings
- Optional opt-in remote error reporting endpoint

## Key behavior

- Chat input submission is split into two writes:
  1. prompt text
  2. delayed `\r` (75ms)
- This avoids missed submits in Claude Code interactive handlers.
- Imported sessions start as idle and can be resumed by:
  - clicking start/restart in grid
  - sending chat input in chat view
  - broadcasting to the project
- New interactive sessions automatically discover and persist their Claude `sessionId` for reliable resume.

## Tech stack

- Electron + React + TypeScript + electron-vite
- `node-pty` for Claude CLI PTY sessions
- `xterm.js` for terminal rendering
- Vitest + React Testing Library

## Prerequisites

- Node.js 20+
- Claude Code CLI available on PATH as `claude`

## Development

```bash
npm install
npm run dev
```

## Quality checks

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

## Scripts

- `npm run dev` - run Electron + renderer in dev mode
- `npm run build` - build main/preload/renderer bundles
- `npm run typecheck` - run TypeScript checks for node + web
- `npm run lint` - run ESLint
- `npm test -- --run` - run tests once
- `npm run dist` - package app with electron-builder
- `npm run release:preflight` - verify signing/notarization env is present
- `npm run dist:dry-run` - signed/notarized build attempt without publishing

## Configuration

Config is stored in `<userData>/config.json` and includes:

- theme and default view mode
- default model and max concurrent agents
- startup session import options
- hidden imported session IDs
- observability settings:
  - `enableRemoteErrorReporting`
  - `errorReportingEndpoint`
  - `includeSensitiveDiagnostics`

Workspace state is stored in `<userData>/workspace.json`:

- Hydra-created agents (name/project/model/yolo/session id)
- Used to restore your working set on next launch

UI runtime state is stored in browser local storage:

- selected project and selected agent
- current view mode (grid/chat)
- per-project expanded grid tile

Structured logs are stored in `<userData>/logs/hydra.log.jsonl` (with rotation).

## CI

GitHub Actions workflow: `.github/workflows/ci.yml`

- Runs on push/PR
- Executes `npm ci`, `npm run lint`, `npm run typecheck`, and `npm test -- --run`

## Release hardening

Release workflow: `.github/workflows/release.yml`

- Tag `v*` publishes draft release.
- Manual trigger supports `dry_run=true` to execute full signed/notarized build without publishing.
- `electron-builder.yml` is configured for:
  - hardened runtime
  - entitlements (`build/entitlements.mac*.plist`)
  - GitHub publish provider (draft releases)
- Optional auto-update check is enabled in production (`electron-updater`).

Required repository secrets for signed/notarized macOS releases:

- `CSC_LINK`
- `CSC_KEY_PASSWORD`
- `CSC_NAME`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

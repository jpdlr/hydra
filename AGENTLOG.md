# Agent Log

Mistakes, gotchas, and lessons learned during development. Check here before starting work to avoid repeating past errors.

---

### `npm start` does not exist
**Date**: 2026-02-10
**Mistake**: Tried `npm start` to run the app locally.
**Fix**: Use `npm run dev` — the dev script is `electron-vite dev`.

### jsdom does not implement `scrollIntoView`
**Date**: 2026-02-10
**Mistake**: Called `element.scrollIntoView()` unconditionally in a component, which threw `TypeError: selected.scrollIntoView is not a function` in jsdom tests.
**Fix**: Guard with `if (selected?.scrollIntoView)` before calling. jsdom stubs many DOM APIs but not `scrollIntoView`.

### Fake timers + async React effects cause test timeouts
**Date**: 2026-02-10
**Mistake**: Used `vi.useFakeTimers()` with components that have debounced `useEffect` calling async IPC methods. `vi.advanceTimersByTime()` advances the timer but the mocked Promise resolution never flushes, causing infinite `waitFor` loops.
**Fix**: Use real timers and let `waitFor` naturally wait for the debounce to complete. Only use fake timers when you genuinely need precise timer control and the code path is synchronous.

### React Testing Library cleanup with fake timers
**Date**: 2026-02-10
**Mistake**: Auto-cleanup between tests didn't work when fake timers were active, causing "multiple elements found" errors from leftover DOM nodes.
**Fix**: Add explicit `cleanup()` in `afterEach` when using fake timers, or avoid fake timers altogether (preferred).

### Always add new `window.hydra` methods to ALL test mocks
**Date**: 2026-02-10
**Context**: Added `searchFiles` to `window.hydra` in preload.
**Fix**: Update mocks in `App.flow.test.tsx`, `NewAgentDialog.test.tsx`, `EditorPanel.test.tsx`, and any other test file that sets `window.hydra = { ... }`. Missing methods cause runtime errors in unrelated tests.

### vi.clearAllMocks() breaks vi.mock() factory return values
**Date**: 2026-02-28
**Context**: Remote control tests used `vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => ...) }))` with `vi.clearAllMocks()` in `beforeEach`.
**Mistake**: `vi.clearAllMocks()` resets the mock implementations set in `vi.mock()` factory functions, causing subsequent tests to get `undefined` return values from mocked modules.
**Fix**: Use `.mockReturnValue()` / `.mockResolvedValue()` in the factory (these survive `clearAllMocks`), or avoid `clearAllMocks` and just create fresh service instances in `beforeEach`.

### New AppConfig fields must be added to test config objects
**Date**: 2026-02-28
**Context**: Added `remoteControlEnabled` and `remoteSessionTimeoutMinutes` to `AppConfig`.
**Fix**: Always check `App.flow.test.tsx` for `baseConfig` objects typed as `AppConfig` — they'll fail typecheck if new required fields are missing.

### ConfigStore and WorkspaceStore constructors require userDataPath
**Date**: 2026-02-28
**Context**: Decoupled Electron `app` dependency from stores for daemon support.
**Fix**: Both `ConfigStore` and `WorkspaceStore` now take `userDataPath: string` in their constructor instead of calling `app.getPath('userData')` internally. Pass `app.getPath('userData')` from main.ts.

### DaemonClient.get() overloads — don't mix API paths and agent IDs
**Date**: 2026-02-28
**Context**: Tried to use method overloads for `get('/path')` vs `get('agentId')`.
**Fix**: Keep `get(agentId)` as the only public method, use `httpRequest('GET', path)` internally for API endpoints.

### PTY restart race can orphan processes and cause respawn loops
**Date**: 2026-02-28
**Context**: Restarting an agent can spawn a new PTY before the old PTY emits `onExit`.
**Mistake**: Applying old PTY `onExit` cleanup unconditionally clears the new PTY reference and stale kill timeouts can terminate the replacement process.
**Fix**: In `onData`/`onExit`, ignore events unless `managed.pty === emittingPty`; clear `killTimeout` on confirmed exit/restart; scope force-kill timers to the PTY instance they were created for.

### Packaged daemon spawn must set `ELECTRON_RUN_AS_NODE=1`
**Date**: 2026-02-28
**Context**: Launching Hydra.app caused runaway new app instances/windows.
**Mistake**: Daemon bootstrap used `spawn(process.execPath, [daemon.js, ...])` without forcing Node mode, so packaged Electron could relaunch the full app recursively instead of running daemon script-only.
**Fix**: Set `ELECTRON_RUN_AS_NODE=1` in daemon child env when spawning `daemon.js`.

### Avoid unhandled rejections in fake-timer promise tests
**Date**: 2026-02-28
**Context**: Daemon timeout tests advanced fake timers until rejection, then asserted afterwards.
**Mistake**: Attaching `await expect(promise).rejects...` after advancing timers can surface `PromiseRejectionHandledWarning`/unhandled rejection noise.
**Fix**: Attach the rejection assertion immediately (`const pending = expect(promise).rejects...`) before advancing timers, then await `pending`.

### Don't collapse spawn failure and cap-hit into one boolean
**Date**: 2026-02-28
**Context**: Hardened agent cap checks around `spawnProcess`.
**Mistake**: Returning only `true/false` from spawn made cap denials and real spawn errors indistinguishable, which can report the wrong error and hide real failures.
**Fix**: Return explicit spawn outcomes (`spawned` / `capped` / `errored`) and handle each path separately in `create/restart/ensureProcess`.

### Hosting smoke checks can fail from local DNS despite successful deploy
**Date**: 2026-02-28
**Context**: Tried verifying Firebase Hosting immediately after deploy with local `curl`.
**Mistake**: Treating a local DNS resolution error (`Could not resolve host`) as a deploy failure signal.
**Fix**: Trust Firebase CLI success output first, then retry remote checks or verify from a different network/device when local DNS is unstable.

### iOS Safari cannot be treated as guaranteed `BarcodeDetector` support
**Date**: 2026-02-28
**Context**: Remote scanner showed "not supported" in Safari despite camera permission working.
**Mistake**: Relying on `BarcodeDetector` as the only QR decode path and assuming Safari always implements it.
**Fix**: Keep camera stream and decode frames with a JS fallback (`jsQR`) when native detector is absent/unavailable.

### Renderer CSP blocks `data:` QR images
**Date**: 2026-02-28
**Context**: Desktop remote modal showed a broken/blank QR image even when payload and session were present.
**Mistake**: Rendering QR via `<img src=\"data:image/png;base64,...\">` while renderer CSP effectively allows only `'self'` resources.
**Fix**: Render QR directly to a `<canvas>` with `qrcode.toCanvas`, and show explicit loading/error overlays instead of silent blanks.

### Promise resolver typing can break strict TS in tests
**Date**: 2026-02-28
**Context**: Added async QR-render loading test in `RemoteControlModal.test.tsx`.
**Mistake**: Nullable function resolver patterns can narrow unexpectedly under strict typecheck and trigger `Type 'never' has no call signatures`.
**Fix**: Use a definite-assigned resolver (`let resolve!: () => void`) and assign inside `new Promise` setup.

### Historical releases may exist without matching local git tags
**Date**: 2026-02-28
**Context**: Backfilling release notes from GitHub releases failed on `v0.1.5`.
**Mistake**: Assuming every published release tag still exists in local/remote git tag history.
**Fix**: Release-note tooling must gracefully handle missing tags and still generate a clean metadata-only note body.

### `iconutil` may reject generated iconsets from scripted PNG pipelines
**Date**: 2026-02-28
**Context**: Automated brand-asset generation attempted to rebuild `build/icon.icns`.
**Mistake**: Assuming `iconutil` will accept any correctly named PNG iconset produced by PIL/sips.
**Fix**: Treat `.icns` generation as best-effort and point `electron-builder` mac icon to `build/icon.png` so branding updates still apply reliably.

### Remote QR render can fail if payload arrives before QR canvas mounts
**Date**: 2026-02-28
**Context**: Remote modal set `qrPayload` while state was still `creating`, so QR effect ran before active QR UI existed.
**Mistake**: Triggering QR rendering solely on payload presence caused `Canvas not ready` errors and persistent fallback mode.
**Fix**: Gate QR rendering on active session UI (`enabled && status === 'active'`) and rerun when state transitions into active.

### Enable button visibility must also gate on disconnected/expired status
**Date**: 2026-02-28
**Context**: Remote modal briefly showed both `Enable Remote Control` and `Creating session...` simultaneously.
**Mistake**: Condition for showing the enable action relied on `!loading`, but `loading` can flip false before backend status leaves `creating`.
**Fix**: Show enable action only when `!enabled && !loading && (status === 'disconnected' || status === 'expired')`.

### iOS home-screen icon updates need explicit cache-busting
**Date**: 2026-03-01
**Context**: PWA icon looked unchanged on iPhone after deploying regenerated assets.
**Mistake**: Reusing stable asset URLs (`/manifest.json`, `/icons/*.png`, `/sw.js`) lets Safari/service-worker caches keep stale icon metadata.
**Fix**: Add versioned query strings to manifest/icon/service-worker URLs, bump service-worker cache name, and use network-first for manifest/icon fetches.

### PWA auto-update needs explicit waiting-worker promotion and reload
**Date**: 2026-03-01
**Context**: Wanted updates to apply as soon as the app opens instead of waiting for manual refresh.
**Mistake**: Relying on registration alone can leave an updated service worker in `waiting`, so users stay on old assets.
**Fix**: On load/focus/visible, call `registration.update()`, post `SKIP_WAITING` to waiting worker, and hard reload on `controllerchange`.

### GitHub release-note upsert can fail even when git push succeeds
**Date**: 2026-03-01
**Context**: `npm run release:notes -- upsert <tag>` failed with `error connecting to api.github.com` after successful commit/tag/push.
**Mistake**: Assuming API reachability is guaranteed if git remote operations worked.
**Fix**: Treat release-note upsert as a separate network dependency; retry later or from a network with GitHub API access.

### Remote control defaults must start as `disconnected`, never `creating`
**Date**: 2026-03-01
**Context**: Remote modal could show `Creating session...` forever before a real enable attempt.
**Mistake**: Initial `RemoteControlState` in both renderer hook and main service used `status: 'creating'`.
**Fix**: Initialize to `status: 'disconnected'` and only switch to `creating` inside `enable()`.

### Remote enable flow needs explicit phase timeouts
**Date**: 2026-03-01
**Context**: Enable could stall indefinitely if Firebase init/session creation never resolved.
**Mistake**: Awaiting remote setup phases without timeout leaves UI stuck in spinner state forever.
**Fix**: Wrap `initFirebase`, `createSession`, and `syncAgentState` in bounded timeouts and transition to error state on timeout.

### Desktop mobile-presence status depends on first inbox event
**Date**: 2026-03-01
**Context**: Desktop Remote modal stayed on `Waiting for mobile` even while mobile app showed connected agent list.
**Mistake**: Mobile connect flow authenticated and subscribed to Firestore but never wrote an inbox message, so desktop never flipped `mobileConnected`.
**Fix**: Send a handshake inbox message immediately after mobile token sign-in.

### zsh globbing can break `rg` scans when patterns match nothing
**Date**: 2026-03-01
**Context**: Used `rg ... hydra-remote/src/**/*.test.ts` and zsh failed before `rg` ran.
**Mistake**: Unquoted shell globs in zsh error with `no matches found` when there are no matching files.
**Fix**: Prefer `rg --glob` filters or quote glob patterns so `rg` handles matching directly.

### Electron main process may not auto-load root `.env`
**Date**: 2026-03-01
**Context**: Remote control errored with missing `HYDRA_FIREBASE_*` despite `.env` file existing.
**Mistake**: Assuming Electron main process always receives `.env` values without explicit loading.
**Fix**: Load project `.env` files during startup and support `MAIN_VITE_` env aliases for Electron-Vite builds.

### Dynamic `process.env[key]` blocks MAIN_VITE compile-time substitution
**Date**: 2026-03-01
**Context**: Release builds needed `MAIN_VITE_HYDRA_FIREBASE_*` injection from GitHub workflow env.
**Mistake**: Reading env via computed keys (`process.env[alias]`) can prevent build-time replacement of `MAIN_VITE_*` values.
**Fix**: Use static env member access (`process.env.MAIN_VITE_HYDRA_FIREBASE_*`) for values that must be embedded at build time.

### `path.join` can produce Windows separators in daemon lifecycle tests
**Date**: 2026-03-01
**Context**: `getDaemonPaths('/tmp/hydra-user-data')` unexpectedly returned `\\tmp\\...` under test, failing Unix-socket path assertions.
**Mistake**: Building daemon socket/lock paths with OS-dependent `path.join` in code that assumes POSIX-style paths from slash-prefixed inputs.
**Fix**: Build daemon socket/lock paths using the separator style implied by `userDataPath` (preserve `/...` as POSIX, `C:\\...` as Windows-style) instead of relying on runtime `path.join` behavior.

### `firebase:deploy:hosting` can print Firebase CLI internal errors even when deploy status is unclear
**Date**: 2026-03-01
**Context**: Running `npm run firebase:deploy:hosting` printed `This tool has encountered an error` from Firebase CLI and exited without a clear deploy summary.
**Mistake**: Treating script output as definitive success/failure without verifying hosting release details.
**Fix**: If deploy script output is ambiguous, run `firebase deploy --only hosting --debug` in `firebase-backend` and confirm `release complete` plus version/release IDs.

### PWA visual updates must preserve Hydra Midnight token language
**Date**: 2026-03-01
**Context**: A first UI refresh for Hydra Remote introduced blue gradients/accents that felt off-brand.
**Mistake**: Optimizing for generic “modern/minimal” look without anchoring to desktop Midnight palette (`#191919/#212121/#2a2a2a` + white accents).
**Fix**: For Hydra UI refreshes, map colors from Midnight tokens first and avoid introducing blue accent systems unless explicitly requested.

### Vitest here rejects Jest-style `--runInBand`
**Date**: 2026-03-01
**Context**: Tried `npm test -- --runInBand` while validating a renderer regression.
**Mistake**: Assuming Vitest accepts Jest’s `--runInBand` flag.
**Fix**: Use `npm test` (or Vitest-native flags like `--pool`, `--maxWorkers`, or file filters) instead of `--runInBand`.

### `ws+unix://` breaks daemon WebSocket when socket paths contain spaces
**Date**: 2026-03-01
**Context**: Hydra renderer showed a blank terminal with no live output while daemon HTTP requests still worked.
**Mistake**: Constructing daemon WebSocket URLs as `ws+unix://${socketPath}:/ws` lets spaces become `%20`, and `ws` then tries to open the literal encoded path (ENOENT).
**Fix**: Create the WebSocket with `new WebSocket('ws://localhost/ws', { socketPath })` so Unix socket paths are passed directly without URL path encoding.

### TypeScript can mis-narrow captured PTY refs inside timeout guards
**Date**: 2026-03-01
**Context**: Added delayed wake-up write after restart and guarded with `if (restartPty === null || managed.pty !== restartPty) return`.
**Mistake**: Assuming TS would always narrow `restartPty` to `IPty`; in this closure it inferred `never` for `restartPty.write`.
**Fix**: Keep runtime null/identity guards and use an explicit `IPty` cast at the write site inside the timeout callback.

### Mixed `rg` path targets can cause false-negative scans
**Date**: 2026-03-01
**Context**: Searched agent status wiring with `rg` using multiple top-level path targets.
**Mistake**: Including a non-existent target directory (`app`) made `rg` exit non-zero and obscured whether results were complete.
**Fix**: Scope `rg` targets to known existing roots (for this repo: `src`, `electron`, `hydra-remote`, `shared`) or run from repo root without extra path args.

### Hydra session picker is provider-specific even though the IPC name is generic
**Date**: 2026-03-08
**Context**: Codex resume looked broken from the New Agent dialog.
**Mistake**: Assuming `sessions:list` already covered both providers because the frontend API was generic. The route still returned only the Claude catalog, and the dialog hid resume for Codex entirely.
**Fix**: Treat session listing as provider-aware end to end. Pass `provider` through the session list options, route `/sessions?provider=codex` to `CodexSessionCatalog`, and keep the dialog copy/selection logic aligned with the active provider.

### Claude session indexes can be stale or polluted by meta prompts
**Date**: 2026-03-08
**Context**: Hydra resumed the wrong Claude sessions after restart in projects using `sessions-index.json` or raw JSONL fallback.
**Mistake**: Trusting `sessions-index.json` entries even when `fullPath` no longer exists, and treating meta/local-command transcript records (`<local-command-caveat>`, `/clear`, IDE tags) as the real first prompt.
**Fix**: Ignore index entries whose transcript file is missing, fall back to the live JSONL file, support structured `message.content` arrays, and skip meta/local-command prompt noise when deriving the session’s first meaningful prompt.

### Grid tiles can inherit live activity sorting unless order is frozen per Grid session
**Date**: 2026-03-08
**Context**: Grid-mode terminal tiles kept jumping as agents produced output.
**Mistake**: Letting Grid read project agent arrays directly from `useAgents`, where per-project agents are re-sorted by `lastActivityAt`, means the "default" tile order is not stable.
**Fix**: Freeze the initial per-project tile order when Grid mounts or when a project tab is first opened, then only reconcile removals/additions unless the user manually drags tiles into a custom order.

### Intentional PTY stops must not be treated as agent errors
**Date**: 2026-03-08
**Context**: Clicking Stop on a running session surfaced an `Agent Error` toast instead of returning the session to idle.
**Mistake**: PTY exit handling treated any non-zero exit code as `errored`, even when the exit was caused by Hydra sending a deliberate stop signal.
**Fix**: Track explicit stop intent on the managed agent and convert that exit path to `idle`; keep a regression test that simulates `kill()` followed by a non-zero PTY exit.

### Codex app-server requires `initialize` before `model/list`
**Date**: 2026-03-08
**Context**: Added dynamic Codex model discovery for Hydra model pickers.
**Mistake**: The app-server protocol looks like simple JSON-RPC, but `model/list` is not reliable as a first request on a fresh stdio session.
**Fix**: Always send `initialize` first, wait for its response, then request `model/list`, and cache the result so the UI does not repeatedly spawn `codex app-server`.

### Model pills should follow terminal output, not just UI intent
**Date**: 2026-03-08
**Context**: Codex model changes can be made through the terminal-native `/model` flow, so UI-selected values can drift from the real session model.
**Mistake**: Treating the picker selection as the source of truth caused Hydra to display models that the terminal session had not actually switched to.
**Fix**: Parse recent PTY output for model-change messages and use that as the authoritative model state, especially for Codex.

### Hydra Remote prompts are inbox-only and need optimistic local chat state
**Date**: 2026-03-01
**Context**: Mobile PWA chat stayed visually empty after sending prompts even though daemon processing started.
**Mistake**: Assuming prompt commands would appear in Firestore outbox; remote outbox only carries daemon events (`output`, `status`, `notification`) and not user prompt submissions.
**Fix**: Render sent prompts immediately in local PWA state, show a typing indicator while awaiting remote output/status completion, then render finalized assistant text from outbox output aggregation.

### `firebase login:use` may print internal errors while deploy still succeeds
**Date**: 2026-03-01
**Context**: `npm run firebase:deploy:hosting` printed `This tool has encountered an error` before and after build, but exited `0`.
**Mistake**: Treating wrapper-script output as definitive deployment status when Firebase CLI emits noisy internal errors.
**Fix**: Verify with `firebase deploy --only hosting --debug` in `firebase-backend` and confirm `hosting[...]: release complete` plus Hosting URL.

### `useAgents.restartAgent` can clobber early PTY output with late HTTP response
**Date**: 2026-03-01
**Context**: Clicking Start/Restart showed agent status as running, but terminal stayed blank as if session only ran in daemon.
**Mistake**: Clearing `rawOutput` after `restartAgent` resolved can erase output that arrived earlier via realtime WS events.
**Fix**: Clear output before issuing restart, preserve streamed output on response, and backfill from `getAgentBuffer` after restart to cover event ordering races.

### Hook test promise types should match async callback signatures
**Date**: 2026-03-01
**Context**: New `useAgents` regression test failed `typecheck:web`.
**Mistake**: Typed `restartPromise` as `Promise<AgentState | null>` even though `useAgents.restartAgent` returns `Promise<void>`.
**Fix**: Align local test variable types to the hook API (`Promise<void>`) to avoid TS2322 mismatches.

### PWA chat must sanitize PTY output before rendering bubbles
**Date**: 2026-03-01
**Context**: Remote chat showed broken oversized bubbles full of ANSI/control fragments (`[38;...m`, replacement chars, CLI UI frames).
**Mistake**: Rendering daemon PTY output batches as plain chat text without cleaning terminal escape/control sequences or filtering low-signal UI noise.
**Fix**: Sanitize output (strip ANSI/OSC/C1/control bytes), ignore known terminal-frame noise lines, clamp oversized payloads, and only render outputs relevant to local prompt windows.

### Timestamp scoping for remote chat can hide existing history on open
**Date**: 2026-03-01
**Context**: PWA chat showed `No messages yet` even when daemon had prior outbox output for the selected agent.
**Mistake**: Returning an empty message set unless a local mobile prompt timestamp existed, which unintentionally suppressed pre-existing assistant history.
**Fix**: When no local prompt has been sent in the current mobile view, render a bounded recent history from agent outbox; only apply prompt-window scoping after the first local prompt.

### Remote chat finish detection cannot rely only on `idle`/`errored` status transitions
**Date**: 2026-03-01
**Context**: PWA got stuck on `Agent is typing...` even though replies appeared in desktop terminal while agent status remained `running`.
**Mistake**: Clearing typing/finalizing replies only on terminal status transitions misses normal interactive runs that stay in `running`.
**Fix**: Treat new outbox output events as reply progress/completion signals and keep one consistent rendering path for both live updates and re-entry.

### PTY-to-chat rendering must collapse to a single extracted response window
**Date**: 2026-03-01
**Context**: Mobile chat showed many fragmented bubbles (`*ra`, `es`, `bae`) caused by terminal redraw chunks being rendered independently.
**Mistake**: Mapping each outbox `output` document to a separate assistant bubble preserved partial redraw states and produced unreadable shards.
**Fix**: Build one assistant bubble from output emitted after the latest mobile prompt, apply strict line-quality filtering, and ignore low-signal terminal UI fragments.

### Remote chat prompt windows should anchor to outbox chronology, not device-clock timestamps
**Date**: 2026-03-01
**Context**: PWA reply bubbles mixed stale prior output with newer terminal stream and sometimes clipped the start of the true answer.
**Mistake**: Using client-side send timestamps for output windowing is brittle under clock skew and batching; tail-trimming long bubbles can cut off the beginning of the assistant reply.
**Fix**: On prompt send, capture the latest known outbox timestamp as an anchor and only parse output after that point; stop parsing at the next prompt echo and truncate from the top-preserving direction.

### PWA streaming parser needs explicit prompt-echo boundaries and UI-chrome suppression
**Date**: 2026-03-01
**Context**: Remote chat streamed terminal frame lines (`────────────────`, `❯`) and usage footer (`Opus 4.6`, `ccusage`, `bypass permissions`) into assistant bubbles.
**Mistake**: Generic “text-like line” heuristics admitted terminal UI chrome and status lines; assistant extraction had no strong boundary tied to the current prompt echo.
**Fix**: Track active prompt text, begin extraction only after matching prompt echo, stop at next prompt echo, and hard-filter frame/footer signatures (box-drawing lines, prompt bars, usage/cost footer, bypass-permissions strip).

### `ws` client `socketPath` options can still fall back to localhost TCP in runtime
**Date**: 2026-03-01
**Context**: Daemon HTTP calls worked, but live `agent:status`/`agent:output` websocket events never reached the renderer; terminals stayed blank while agents ran.
**Mistake**: Assuming `new WebSocket('ws://localhost/ws', { socketPath })` forces Unix socket transport in all runtime cases.
**Fix**: Provide `createConnection: () => net.createConnection(socketPath)` in websocket options so transport is explicitly bound to the daemon Unix socket and not localhost TCP.

### Electron `close` guard must call `preventDefault()` before async checks
**Date**: 2026-03-01
**Context**: Clicking the window close button skipped the quit-confirm modal even with active agents.
**Mistake**: Awaiting `daemonClient.list()` before calling `event.preventDefault()` in the `BrowserWindow` close handler.
**Fix**: Prevent close synchronously, then run async active-agent checks and explicitly re-close only when safe (with a re-entry guard flag).

### Root ESLint ignores must handle nested build artifacts
**Date**: 2026-03-01
**Context**: Running `npm run lint` from repo root started linting generated bundles in `firebase-backend/public/assets`, `firebase-backend/functions/lib`, and nested `dist` folders.
**Mistake**: Using root-only ignore globs (`dist/**`, `out/**`) that miss nested build output directories.
**Fix**: Prefer recursive ignore patterns (`**/dist/**`, `**/out/**`, `**/node_modules/**`) and explicitly ignore generated deployment/build folders under Firebase.

### Flat-config ESLint does not honor `/* eslint-env */` comments
**Date**: 2026-03-01
**Context**: Tried fixing service worker `no-undef` with `/* eslint-env serviceworker */` in `hydra-remote/public/sw.js`.
**Mistake**: Relying on legacy env comments while using ESLint flat config.
**Fix**: Declare service worker globals in `eslint.config.mjs` with a file-specific `languageOptions.globals` block.

### Auto-reconnect must block scanner mount to avoid camera permission prompts
**Date**: 2026-03-01
**Context**: Hydra Remote auto-reconnected successfully but still prompted for camera on launch.
**Mistake**: Rendering `Scanner` on the first scan screen paint before the saved-session reconnect attempt completed, which immediately triggers `getUserMedia`.
**Fix**: Add a startup `restoringSession` gate and only mount `Scanner` after reconnect resolution (or fallback), so camera APIs are never touched during auto-reconnect.

### Chat parser must never treat prompt/frame text as assistant output
**Date**: 2026-03-01
**Context**: Remote PWA showed the latest prompt and terminal frame/footer chrome inside assistant bubbles instead of actual reply text.
**Mistake**: Allowing assistant extraction to start from generic “natural language” lines before a real assistant marker was seen.
**Fix**: Start extraction only on assistant marker lines (`⏺/●/•`), then stop on prompt/frame/footer boundaries to keep typing state active until real assistant text arrives.

### Prompt marker detection must strip frame prefixes first
**Date**: 2026-03-01
**Context**: Even with strict marker-based parsing, prompt echo text still leaked into assistant bubbles.
**Mistake**: Matching `❯`/`⏺` only at absolute line start while streamed lines were prefixed with terminal frame glyphs (`│`, `─`, etc.).
**Fix**: Normalize each candidate line by stripping UI-frame prefixes/suffixes before prompt/assistant marker detection and continuation extraction.

### Parser-state schema changes should version chat storage keys
**Date**: 2026-03-01
**Context**: After parser updates, remote chat could still show stale/incorrect bubbles from prior persisted prompt-window state.
**Mistake**: Reusing the same `sessionStorage` key across incompatible parser state behavior.
**Fix**: Add a storage key version suffix and bump it when parser state semantics change.

### Active prompt text must be explicitly denied in assistant extraction
**Date**: 2026-03-01
**Context**: Remote chat still rendered the user prompt text as assistant output in some streams.
**Mistake**: Assuming prompt echoes always include a reliable `❯` marker; in practice some lines arrive with altered/partial prefixes and slip through.
**Fix**: Normalize text and block any extracted line matching the active prompt text (exact/prefix) from assistant start and continuation paths.

### "Test locally" means `npm run dev`, NOT deploy to `/Applications`
**Date**: 2026-03-08
**Mistake**: Ran `bash scripts/deploy-local.sh` when user said "test locally" or "build local".
**Fix**: "Test locally" / "run locally" = `npm run dev`. Only "deploy locally" means `bash scripts/deploy-local.sh`.

### Remote chat needs strict assistant-marker gating, not prompt-echo inference
**Date**: 2026-03-01
**Context**: User required that nothing after `>` should ever render as assistant content; only text after `⏺` is valid.
**Mistake**: Using mixed prompt-echo + heuristic collection paths allowed occasional prompt text leaks under irregular terminal framing.
**Fix**: Flatten output chunks into ordered lines, find first assistant marker (`⏺/●/•`), and only collect content from that marker onward until stop boundaries.

### Open In menu must have a non-empty fallback while editor detection resolves
**Date**: 2026-03-08
**Context**: The Header `Open in` dropdown rendered only the section header when installed-editor probing returned late/failed, leaving no clickable entries.
**Mistake**: Initializing renderer state with an empty editor list and assuming IPC detection always succeeds quickly.
**Fix**: Seed `Open in` with fallback entries (`defaultEditor` + system file manager, plus terminal on non-Windows), then replace with detected editors when available.

### Browser platform detection should not rely on `Navigator.userAgentData` typings
**Date**: 2026-03-08
**Context**: Added OS-aware editor labels in renderer (`Finder` vs `Explorer`) and used `navigator.userAgentData` for platform sniffing.
**Mistake**: Accessing `navigator.userAgentData` directly breaks `tsconfig.web` when DOM lib typings don’t include that property.
**Fix**: Use a narrowed `Navigator` type with optional `userAgentData` and fall back to `navigator.platform` / `navigator.userAgent`.

### Editor detection should not rely only on CLI commands in Electron PATH
**Date**: 2026-03-08
**Context**: `Open in` only showed fallback entries when app was launched from Finder, even though Windsurf/Antigravity were installed.
**Mistake**: Detecting editors only via `which/where` on CLI binaries; GUI-launched Electron often has a reduced PATH and misses `/usr/local/bin` and user-installed toolchains.
**Fix**: On macOS, detect editor app bundles (`/Applications` and `~/Applications`) and launch via `open -a <AppName>`, with CLI probing only as fallback.

### Superpower path may differ across environments
**Date**: 2026-03-08
**Context**: AGENTS instructions referenced `~/.agents/skills/superpowers/superpowers`, but that directory did not exist in this workspace.
**Mistake**: Assuming the superpower directory path is always present as written.
**Fix**: Verify superpower files by searching for `SUPERPOWER.md`; if none exist, proceed with normal workflow and note the missing path.

### Timer-based PTY submit tests must track the real submit delay constant
**Date**: 2026-03-08
**Context**: Local deploy failed in `AgentManager.test.ts` before packaging because the fake-timer expectation still assumed a 75ms delayed submit.
**Mistake**: Changing `INPUT_SUBMIT_DELAY_MS` in `AgentManager` without updating timer-based tests leaves deploy blocked by a stale assertion.
**Fix**: Keep fake-timer tests aligned with the current submit delay, or derive the expectation from a shared exported constant when that timing is intentionally part of behavior.

### xterm `convertEol` breaks richer TUI redraw behavior
**Date**: 2026-03-08
**Context**: Codex terminal UI showed duplicated or stale prompt/status lines even though PTY output was only emitted once.
**Mistake**: Enabling xterm's `convertEol` rewrote incoming line endings, which interfered with cursor-driven redraws from terminal UIs.
**Fix**: Keep `convertEol` disabled for Hydra terminal panes and add a regression test that asserts the terminal option stays `false`.

### Codex restart requires native `resume`, not a fresh interactive spawn
**Date**: 2026-03-08
**Context**: Hydra restarts for Codex agents reopened a fresh session instead of continuing the previous thread.
**Mistake**: Treating Codex as non-resumable in `providers.ts` meant Hydra never captured a Codex session id and never invoked `codex resume <session>`.
**Fix**: Discover Codex session ids from `~/.codex/sessions/*/*/*/*.jsonl` and restart Codex agents with the native `resume` subcommand once a session id is known.

### Codex ccusage integration should use the documented `npx` entrypoint
**Date**: 2026-03-20
**Context**: The Usage Dashboard showed Codex token totals but missing pricing/model data, plus invalid day labels, even though `npx @ccusage/codex@latest daily` worked correctly in Terminal.
**Mistake**: Assuming Codex exposed a standalone `ccusage-codex` binary and that its output shape could be treated exactly like Claude's existing path without normalizing dates/cost aliases.
**Fix**: Invoke Codex usage through `npx -y @ccusage/codex@latest ...`, and defensively normalize Codex date/cost fields before rendering.

### Discriminated unions in JSX renderers should use `switch` when fields differ by variant
**Date**: 2026-03-21
**Context**: Reworked `hydra-remote/src/components/AgentChat.tsx` to render paragraphs, headings, lists, and code blocks from parsed chat content.
**Mistake**: Used a chain of `if` branches inside `Array.map()` and then accessed `block.text` in the fallback branch, assuming TypeScript would exclude list variants cleanly.
**Fix**: Prefer an explicit `switch (block.type)` for discriminated unions in JSX renderers, especially when some variants expose different fields (`text` vs `items` vs `code`).

### Remote transcript history must be provider-aware
**Date**: 2026-03-21
**Context**: Hydra Remote showed Claude conversation history but empty Codex history for the same chat UI.
**Mistake**: Reused a Claude-only transcript reader for remote and daemon history endpoints, even though Codex stores sessions under `~/.codex/sessions/...` with different JSONL event shapes.
**Fix**: Pass `agent.provider` into transcript history lookups and parse Claude and Codex transcripts separately instead of assuming one transcript format.

### Cross-process searches should target `src`, `electron`, and `shared`
**Date**: 2026-03-21
**Context**: While tracing agent output flow, a search against `electron/shared` failed because shared types live in the top-level `shared/` directory.
**Mistake**: Assuming a colocated `electron/shared` tree exists when following imports like `@shared/types`.
**Fix**: Search `src`, `electron`, and `shared` explicitly when tracing renderer/main/daemon boundaries in Hydra.

### Vitest only discovers tests under `src/` and `electron/`
**Date**: 2026-03-22
**Context**: Added a new `shared/keybindings.test.ts` file for the keybinding helpers, but `npm test -- shared/keybindings.test.ts` returned "No test files found".
**Mistake**: Placing new tests under `shared/` without checking the repo's Vitest include globs.
**Fix**: Keep new tests under `src/` or `electron/`, or update Vitest config intentionally if shared tests need first-class coverage.

### Hydra Remote auto-reconnect needs host heartbeat validation and session-scoped cache keys
**Date**: 2026-03-22
**Context**: Hydra Remote reopened into a stale Firestore session and showed chat/history that no longer matched the current desktop agent, while prompt sends appeared to do nothing.
**Mistake**: Trusting any saved QR payload without validating live desktop heartbeat, and keying mobile chat cache too loosely (`agentId` only) let stale remote sessions and stale bubbles masquerade as the active desktop state.
**Fix**: Publish a desktop heartbeat to the session document, reject or tear down stale mobile reconnects when the heartbeat expires, and scope persisted remote chat state to both the remote session id and the underlying agent session id.

### Codex session discovery must be allowed to correct stale catalog matches
**Date**: 2026-03-22
**Context**: Hydra Remote kept showing an older Codex thread even after the mobile app refreshed correctly and the live desktop terminal had moved on.
**Mistake**: Treating the first discovered Codex `sessionId` as final meant a bad catalog match could stick forever; remote transcript lookups then faithfully read the wrong JSONL session even though the active PTY was the right one.
**Fix**: Let Codex session discovery continue after spawn when the current session id looks stale relative to the agent start time, and allow catalog probing to replace the current session id with a fresher project-local candidate.

### Standalone slash mode commands should switch composer state client-side
**Date**: 2026-03-27
**Context**: Added chat-vs-terminal input modes using a `t3code`-style slash-command flow.
**Mistake**: Treating `/terminal` and `/chat` like normal submissions would send them into the agent PTY instead of changing the composer mode.
**Fix**: Parse completed standalone slash commands in the input bar before submit and update local composer mode without sending them to the backend.
### TerminalPane must serialize xterm writes under bursty output

**Context**: Hydra terminals sometimes failed to render the full PTY stream when output arrived faster than React/xterm write callbacks settled.

**Mistake**: Advancing the local written-length cursor immediately after calling `terminal.write(...)` assumed xterm had already consumed that chunk, which can desync incremental slicing under rapid back-to-back updates.

**Fix**: Treat xterm writes as an async queue. Only advance the rendered cursor in the `write` callback, keep the latest target output separately, and flush any remaining tail once the in-flight write completes.

### Codex startup output can be lost if buffer backfill overwrites live stream

**Context**: Codex emits substantial terminal UI immediately on startup, so live PTY output can arrive before `createAgent()` or initial agent-load buffer reads finish in the renderer.

**Mistake**: Replacing renderer `rawOutput` with the later daemon buffer snapshot discarded already-streamed Codex frames when the snapshot was older or less complete.

**Fix**: Merge snapshot backfills with any existing live output and prefer the longer/newer tail-compatible stream instead of blindly overwriting renderer state.

### Codex TUI panes should stay mounted across chat-agent switches

**Context**: Codex uses a full-screen, cursor-driven terminal UI. Replaying raw PTY output into a fresh xterm instance after switching agents can fail to reconstruct the exact current screen.

**Mistake**: Mounting only the selected chat terminal meant Hydra disposed the live xterm state whenever the user switched to another agent, then tried to rebuild Codex from buffered bytes alone.

**Fix**: Keep chat-view terminal panes mounted per agent, hide inactive panes instead of unmounting them, and refit/focus the pane when it becomes visible again.

### Codex alternate-screen sequences degrade Hydra scrollback and replay

**Context**: Even with persistent xterm instances, Codex output could still appear truncated or unstable when switching back to an agent or scrolling around the current session.

**Mistake**: Passing Codex's alternate-screen enter/exit sequences straight through to xterm put Hydra into full-screen TUI buffer behavior that does not preserve scrollback/replay the way users expect inside the app.

**Fix**: Strip Codex alternate-screen control sequences (`?47`, `?1047`, `?1049`) from the PTY stream before buffering/emitting so Hydra keeps Codex in the normal scrollback buffer.

### CI lint catches control-regex literals and hook callback ordering

**Context**: Release CI failed after the Codex terminal patch even though targeted tests and typecheck passed locally.

**Mistake**: Using a regex literal with `\x1b` triggered ESLint `no-control-regex`, and a closure used inside `useEffect` before its declaration triggered `react-hooks/immutability`.

**Fix**: Build control-sequence regexes with `new RegExp(...)` string escapes, and declare memoized callbacks like `handleClose` before effects that capture them.

### Windows packaged startup needs daemon fallback and daemon-side file logging

**Context**: A Windows device log showed repeated `daemon.connect-failed` timeouts followed by a main-process `Cannot read properties of null (reading 'on')`, leaving Hydra unable to open.

**Mistake**: Main startup assumed `daemonClient` existed even after daemon connection failed, and the daemon launcher discarded child stdout/stderr with `stdio: 'ignore'`, hiding the real startup failure cause.

**Fix**: Let IPC registration and window startup tolerate a missing daemon, and on Windows route daemon stdout/stderr to a persistent `daemon.log` under the user-data directory for post-mortem debugging.

### Cross-platform daemon lifecycle tests must not inherit host `process.platform`

**Context**: The `v0.2.20` Windows release workflow failed even though local lint, typecheck, and targeted daemon tests passed on macOS.

**Mistake**: A stale-lock respawn test asserted `stdio: 'ignore'` without pinning `process.platform`, so it silently encoded macOS behavior and broke on Windows where daemon output is redirected to `daemon.log`.

**Fix**: Explicitly mock `process.platform` inside daemon lifecycle tests whenever the expected `spawn(...)` options are platform-specific, and keep separate Windows assertions for log redirection behavior.

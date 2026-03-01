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

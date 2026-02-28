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

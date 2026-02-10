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

# Hydra — Project Instructions

## Development

- **Run locally**: `npm run dev` (uses `electron-vite dev` with hot reload)
- **Build**: `npm run build`
- **Tests**: `npm test`
- **Typecheck**: `npm run typecheck`
- There is no `npm start` script — always use `npm run dev` for local development.

## Agent Log

Keep a running log of mistakes, gotchas, and lessons learned during development. When you encounter an error, a failed approach, or a non-obvious catch, append it to `AGENTLOG.md` in the project root. This prevents repeating the same mistakes across sessions. Format each entry with a short title and what to do instead.

## Release Build

When the user says **"Release Build"**, execute all of the following steps in order:

1. **Commit** — Stage and commit all pending changes using Conventional Commits format.
2. **Version bump** — Increment the patch version in `package.json` (e.g. `0.1.5` → `0.1.6`)
3. **Tag** — Create a git tag `vX.Y.Z` matching the new version.
4. **Push** — Push commits and tags to the remote (`git push && git push --tags`).
5. **Deploy locally** — Run `bash scripts/deploy-local.sh` (typechecks, tests, builds, packages, and installs to `/Applications`).

If any step fails, stop and report the error — do not continue to subsequent steps.

## Terminology

- **"Test locally"** / **"Run locally"** → Run `npm run dev` (electron-vite dev server with hot reload). Do NOT build to `/Applications`.
- **"Deploy locally"** / **"Build local"** → Run `bash scripts/deploy-local.sh` (full build + install to `/Applications/Hydra.app`).

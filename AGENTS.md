# Hydra — Agent Instructions

## Release Build

When the user says **"Release Build"**, execute all of the following steps in order:

1. **Commit** — Stage and commit all pending changes using Conventional Commits format.
2. **Version bump** — Increment the patch version in `package.json` (e.g. `0.1.5` → `0.1.6`), commit as `Bump version to X.Y.Z`.
3. **Tag** — Create a git tag `vX.Y.Z` matching the new version.
4. **Push** — Push commits and tags to the remote (`git push && git push --tags`).
5. **Deploy locally** — Run `bash scripts/deploy-local.sh` (typechecks, tests, builds, packages, and installs to `/Applications`).

If any step fails, stop and report the error — do not continue to subsequent steps.

# Packaging

Hydra is published to three package managers, all auto-updated when a new
GitHub release is created.

| Platform | Install command | How it updates |
|---|---|---|
| macOS | `brew install --cask jpdlr/hydra/hydra` | `update-homebrew.yml` bumps the cask in `jpdlr/homebrew-hydra` |
| Windows | `winget install jpdlr.Hydra` | `update-winget.yml` submits a PR to `microsoft/winget-pkgs` via `vedantmgoyal9/winget-releaser` |
| Arch Linux | `yay -S hydra-bin` | `update-aur.yml` pushes a new `PKGBUILD` to the AUR repo `hydra-bin` |

All three jobs run automatically as part of the `Release` workflow after a
`v*` tag is pushed. Each job is a no-op unless its credentials/secrets are
configured — see the per-platform sections below.

## macOS — Homebrew tap

We publish via a **personal tap** (`jpdlr/homebrew-hydra`) rather than the
official `homebrew-cask` repo. This avoids review latency and lets us ship on
every release. Users install with `brew tap jpdlr/hydra && brew install --cask hydra`
or the one-liner above.

**One-time setup:**

1. Create a new GitHub repo: `jpdlr/homebrew-hydra` (public, empty).
2. Copy `packaging/homebrew/hydra.rb` into it as `Casks/hydra.rb` and commit.
3. Create a fine-grained PAT with `contents:write` on `jpdlr/homebrew-hydra`.
4. Add it to this repo's secrets as `HOMEBREW_TAP_TOKEN`.

After that, `update-homebrew.yml` will rewrite the cask on every release.

**Gatekeeper requirement:** the cask installs the signed & notarized `.dmg`
from the GitHub release. The mac-release job in `release.yml` already signs
and notarizes, so this works out of the box once secrets are set.

## Windows — winget

Uses `vedantmgoyal9/winget-releaser` which opens a PR against
`microsoft/winget-pkgs`. Microsoft usually merges within a few hours.

**One-time setup:**

1. Fork `microsoft/winget-pkgs` under the account that will own the PRs
   (can be `jpdlr`).
2. Create a classic PAT with `public_repo` scope on that account.
3. Add it to this repo's secrets as `WINGET_TOKEN`.
4. The first release manifest will need to be submitted manually — see
   `packaging/winget/README.md`. After that, the Action auto-updates.

## Arch Linux — AUR

We publish the `hydra-bin` package (installs the prebuilt `.AppImage` from the
release). Users install with `yay -S hydra-bin` or `paru -S hydra-bin`.

**One-time setup:**

1. Create an account on https://aur.archlinux.org.
2. Add your SSH public key to your AUR account.
3. Submit the initial package manually:
   ```bash
   git clone ssh://aur@aur.archlinux.org/hydra-bin.git
   cp packaging/aur/PKGBUILD hydra-bin/
   cd hydra-bin && makepkg --printsrcinfo > .SRCINFO
   git add PKGBUILD .SRCINFO && git commit -m "Initial import" && git push
   ```
4. Add the AUR SSH **private** key to this repo's secrets as `AUR_SSH_PRIVATE_KEY`.
5. Add your AUR commit identity to secrets: `AUR_USERNAME`, `AUR_EMAIL`.

After that, `update-aur.yml` will rewrite `PKGBUILD` on every release.

cask "hydra" do
  version "0.2.32"
  sha256 "REPLACE_WITH_DMG_SHA256"

  url "https://github.com/jpdlr/hydra/releases/download/v#{version}/hydra-#{version}.dmg"
  name "Hydra"
  desc "Orchestrate Claude Code and OpenAI Codex CLI agents in parallel"
  homepage "https://github.com/jpdlr/hydra"

  auto_updates true
  depends_on macos: ">= :big_sur"

  app "Hydra.app"

  zap trash: [
    "~/Library/Application Support/Hydra",
    "~/Library/Preferences/com.hydra.app.plist",
    "~/Library/Saved Application State/com.hydra.app.savedState",
    "~/Library/Logs/Hydra",
    "~/.config/Hydra",
  ]
end

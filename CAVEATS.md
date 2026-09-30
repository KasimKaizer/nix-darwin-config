# Caveats & Warnings

- **Homebrew is fully declarative.** `homebrew.onActivation.cleanup = "zap"` uninstalls anything not in `modules/darwin/homebrew.nix`. Taps are pinned (`mutableTaps = false`). Manual `brew install` or `brew tap` will not survive, so update the flake instead.

- **`defaults write` doesn't stick.** Keys in `modules/darwin/defaults.nix` are reasserted on every switch.

- **inferno's right speaker is forced off.** Broken right speaker on this MacBook Air. `hosts/inferno/audio.nix` runs a `mute-builtin-right-speaker` C binary via a launchd `KeepAlive` agent that sets CoreAudio StereoPan to full left (`0.0`) on built-in speakers while keeping headphones centered (`0.5`). Startup chime is muted via `system.startup.chime = false`. Don't copy to new hosts.

- **Rollback window is short.** `nixup` keeps 2 generations; GC deletes older than 7d. Use `darwin-rebuild --list-generations` + `--switch-generation N` for older ones.

- **Updates track unstable.** `nixpkgs-unstable` and `home-manager` `master` track unstable channels, so `nixup` can break. Check the result and use `nix-rollback` if needed.

- **A missing age key fails the switch.** `sops.age.generateKey = false`, so restore `~/.config/sops/age/keys.txt` from your password manager before the first switch. See README for multi-host key setup and vault updates.

- **Zed / VS Code configs are reset on switch.** Copied (not symlinked) into `~/.config/zed` and VS Code User dir. Keep permanent changes in `modules/home/editors/`. Zed's `settings.json` is rendered from sops templates, so never paste real keys into the repo copy.

- **Editor extensions are only ever added.** Removing IDs from `modules/home/editors/vscode/extensions.txt` or Zed's `auto_install_extensions` does not uninstall. Do it in the editor instead.

- **Agent skills and configs are overwritten on switch.** Custom skills live in `modules/home/agents/skills/`, and third-party skills are allowlisted via `sources` and `skills.enable` in `modules/home/agents/skills.nix`. Changes made directly in any of the six install targets (`agents`, `cursor`, `codex`, `opencode`, `antigravity`, `copilot` across `~/.agents`, `~/.cursor`, `~/.codex`, `~/.config/opencode`, `~/.gemini/antigravity-cli`, and `~/.copilot`) won't survive.

- **Feynman is only partly declarative.** Nix pins the release and manages the wrapper, generated config, and sops-backed environment, but the wrapper copies the program to the writable `~/.config/.feynman/runtime/<version>` on first launch so Feynman can maintain it itself. Use `feynman-update` to refresh the pinned version and hash, review and commit its diff, then run `nixswitch`; old runtime directories are not removed automatically. Browser-cookie access is enabled for web search; remove `allowBrowserCookies` in `modules/home/agents/feynman.nix` if that is not wanted. The optional Antigravity extension needs a one-time manual install: `npm install --global --prefix "$HOME/.config/.feynman/npm-global" @cortexkit/pi-antigravity-auth`.

- **Stale `.hm-bak` blocks the switch.** Delete the leftover `*.hm-bak` and retry.

- **Leave `stateVersion` alone.** Don't bump `home.stateVersion`/`system.stateVersion`.

- **One-time manual setup.** `skhd` needs Accessibility, `masApps` needs App Store login, LuLu rules live outside nix.

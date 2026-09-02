# Caveats & Warnings

- **Homebrew is fully declarative.** `homebrew.onActivation.cleanup = "zap"` uninstalls anything not in `modules/darwin/homebrew.nix`. Taps are pinned (`mutableTaps = false`). Manual `brew install` or `brew tap` will not survive, so update the flake instead.

- **`defaults write` doesn't stick.** Keys in `modules/darwin/defaults.nix` are reasserted on every switch.

- **inferno's right speaker is forced off.** Broken right speaker on this MacBook Air. `hosts/inferno/audio.nix` pans the built-in device left only, while headphones stay stereo. Don't copy to new hosts. Startup chime is muted via NVRAM.

- **Rollback window is short.** `nixup` keeps 2 generations; GC deletes older than 7d. Use `darwin-rebuild --list-generations` + `--switch-generation N` for older ones.

- **Updates track unstable.** `nixpkgs-unstable` and `home-manager` `master` track unstable channels, so `nixup` can break. Check the result and use `nix-rollback` if needed.

- **A missing age key fails the switch.** `sops.age.generateKey = false`, so restore `~/.config/sops/age/keys.txt` from your password manager before the first switch. See README for multi-host key setup and vault updates.

- **Zed / VS Code configs are reset on switch.** Copied (not symlinked) into `~/.config/zed` and VS Code User dir. Keep permanent changes in `modules/home/editors/`. Zed's `settings.json` is rendered from sops templates, so never paste real keys into the repo copy.

- **Editor extensions are only ever added.** Removing IDs from `modules/home/editors/vscode/extensions.txt` or Zed's `auto_install_extensions` does not uninstall. Do it in the editor instead.

- **Agent skills and configs are overwritten on switch.** Custom skills live in `modules/home/agents/skills/`; changes made directly in `~/.agents`, `~/.cursor`, or `~/.codex` won't survive.

- **Stale `.hm-bak` blocks the switch.** Delete the leftover `*.hm-bak` and retry.

- **Leave `stateVersion` alone.** Don't bump `home.stateVersion`/`system.stateVersion`.

- **One-time manual setup.** `skhd` needs Accessibility, `masApps` needs App Store login, LuLu rules live outside nix.

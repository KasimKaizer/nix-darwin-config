# Flake reference

Read this for layout, Homebrew pinning, adding a host, or an activation failure.
For secrets, see [references/secrets.md](references/secrets.md). For editors, see
[references/editors.md](references/editors.md).

## Layout

```
flake.nix                         hosts attrset, mkDarwin, formatter (nixfmt-tree)
.sops.yaml                        age recipients + sops CLI cheat sheet
secrets/secrets.yaml              encrypted vault (safe to commit)
skills/<name>/SKILL.md            user skills → ~/.agents/skills/<name>
hosts/<hostname>/default.nix      platform, hostname, timezone, primaryUser, imports darwin
hosts/<hostname>/*.nix            host-only darwin (inferno: audio.nix + launchd)
modules/darwin/default.nix        import list (core, defaults, skhd, fonts, homebrew)
modules/darwin/nix-homebrew.nix   imported from flake.nix, not darwin/default.nix
modules/home/default.nix          import list, generic home.packages, sessionVariables
```

`homeDirectory` is `/Users/${username}`. `flakeDir` defaults to
`${homeDirectory}/.config/nix-darwin-config`.

One module ≈ one concern. `default.nix` files are import lists.

## Homebrew vs nixpkgs

- **casks** — GUI apps (`zed`, `ghostty`, `visual-studio-code`, …) and a few
  CLIs shipped as casks (`copilot-cli`, `android-platform-tools`).
  `cursor-cli` and `antigravity-cli` are nixpkgs (`home.packages`), not casks.
- **masApps** — `{ PrettyName = 123456789; }`. Needs App Store login on the
  machine. `mas search 'Name'` prints ids (`mas` is already in `brews`).
- **brews** — only `mas` today. If nixpkgs has the CLI, put it in
  `home.packages` — after confirming it is not already a cask.
- **taps** — `homebrew/core`, `cask`, `bundle` pinned via flake inputs.
  `mutableTaps = false`: a tap not in `nix-homebrew.nix` will not stick.
  `homebrew.nix` also lists those tap names; keep both in sync if you ever add
  one.

Cask/formula versions move only with `nixup` (flake lock), not with ad-hoc
`brew upgrade`. `onActivation.upgrade = true` upgrades declared formulae/casks
on switch. Prefix is `/opt/homebrew` on aarch64 and `/usr/local` on Intel
(`homebrew.nix`). `nix-homebrew.enableRosetta` is on for `aarch64-darwin` only.

`programs.zsh` `profileExtra` currently runs
`eval "$(/opt/homebrew/bin/brew shellenv)"`. An Intel host needs that path
updated when you add one.

## New host

1. Add `hosts.<hostname> = { system, username, timezone, ... };` in `flake.nix`.
   Attr key is the `darwin-rebuild --flake .#<hostname>` name.
2. Copy `hosts/inferno` → `hosts/<hostname>/`.
3. If a **new** age key: add the public key to `.sops.yaml` `keys` and
   `creation_rules`, then `sops updatekeys secrets/secrets.yaml`. Skip if the
   same key is reused.
4. First boot: age private key at `~/.config/sops/age/keys.txt` **before**
   switch (`generateKey = false`). Command in README bootstrap (`darwin-rebuild`
   is not on PATH yet).
5. Shared home modules (git identity, zsh brew path, Helix flake path) assume
   inferno-like defaults. Override or parameterize them if the new machine
   differs — do not silently inherit the wrong username/path.

Git identity lives in `modules/home/tools/git.nix` (shared). Helix's nixd
options in `helix.nix` currently point at
`~/.config/nix-darwin-config`, not `flakeDir`. If a host sets `flakeDir` to
something else, update that path too.

## Activation pitfalls

- Stale `*.hm-bak` next to a managed file → delete it.
- Screenshots dir: `home.activation.screenshotsDir` must keep
  `~/Pictures/Screenshots` because `system.defaults` screencapture.location
  ignores a missing folder.
- skhd: enable Accessibility once per machine.
- `nixup` deletes all but 2 system generations; weekly GC is
  `--delete-older-than 7d`. Rollback is not a long undo history.
- Inputs track unstable / home-manager master. Treat `nixup` as potentially
  breaking.
- rclone token refreshes rewrite `~/.config/rclone/rclone.conf`; the next
  switch restores the vault copy. Put the new file back with the `sops set`
  recipe in `.sops.yaml`.

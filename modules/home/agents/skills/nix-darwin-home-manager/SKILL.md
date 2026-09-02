---
name: nix-darwin-home-manager
description: >-
  Edit this nix-darwin + home-manager + nix-homebrew + sops-nix flake
  (~/.config/nix-darwin-config, host inferno, user ew). Use whenever the user
  adds or changes packages, Homebrew casks, formulae, masApps, taps, macOS
  defaults, Dock icons, login items, skhd hotkeys, fonts, zsh aliases,
   Helix/Zed/VS Code, sops/age secrets, SSH, Agent Skills (including
  requests to create, modify, move, or install a skill, even when only `SKILL.md`
  is named), hosts, or mentions nixswitch, nixup, nixgc, nix-rollback,
  darwin-rebuild, home-manager,
  nix-darwin, or this repo — including casual "install", "brew install",
  "defaults write", or "put this in my PATH" requests. This flake's layout is
  the source of truth; do not follow a generic nix-darwin tutorial.
---

# This flake

Declarative multi-host macOS. Shared modules apply to every host; per-machine
facts live in `flake.nix` → `hosts.<name>` plus `hosts/<name>/`. Primary host:
**inferno** (`ew`, `aarch64-darwin`). Clone path default:
`~/.config/nix-darwin-config`.

A change that is not in an imported module never reaches `nixswitch`. Open the
file the table names, match its style, then stop. Do not invent a parallel
layout.

Read more only when the task needs it:

- [reference.md](reference.md) — file map, Homebrew vs nixpkgs, new host, activation pitfalls
- [references/secrets.md](references/secrets.md) — env vars, secret files, rendered configs, sops CLI
- [references/editors.md](references/editors.md) — Zed / VS Code copy-on-switch vs Helix `programs.helix`

## Workflow

1. **Search, then classify.** `rg` the requested name (and obvious aliases) in
   this flake first. Some CLIs are Homebrew casks here, and some tools live in
   an editor module's `home.packages` — the GUI/CLI heuristic alone will
   duplicate them. If an entry exists, edit that list. If it does not, classify
   with the table. Do not guess a new directory.
2. **Read** the target file (and its `default.nix` import list). Match lists,
   comments, and indentation already there.
3. **Edit once**, in the module that already owns that concern. New module →
   create it, then append it to the matching `imports`. An unimported file is
   dead.
4. Keep secrets out of Nix and JSON in git. Vault is `inputs.nix-secrets/secrets.yaml`
   via `sops` (`inputs.nix-secrets`, `flake = false`).
5. When adding multiple related packages to one `home.packages` profile, apply
   the package-profile collision check below before asking the user to switch.
6. From the flake root: `nix fmt` and `nix flake check --no-build`.
7. Tell the user to run **`nixswitch`**. Do not run it unless they ask (needs
   sudo). Do not run **`nixup`** unless they asked to update flake inputs.

`specialArgs` / `extraSpecialArgs` already pass `inputs`, `hostname`,
`username`, `system`, `timezone`, `homeDirectory`, `flakeDir`. Use those
instead of hardcoding `/Users/ew`.

## Classify

Pick the **kind** of change first. GUI vs CLI is the usual fork:

| User wants | Put it here |
| ---------- | ----------- |
| Something with a `.app` / they click it / Homebrew cask | `modules/darwin/homebrew.nix` → `casks` |
| App Store app | same file → `masApps` (`PrettyName = id;`). Find ids with `mas search 'Name'` |
| CLI that nixpkgs has | `home.packages` in `modules/home/default.nix`, **or** the module that already owns the tool |
| CLI nixpkgs lacks but Homebrew has as a formula | `homebrew.nix` → `brews` (today only `mas` — prefer nixpkgs) |
| New Homebrew tap | **Don't.** Taps are flake-pinned in `modules/darwin/nix-homebrew.nix` (`mutableTaps = false`) |

Those rows are for **new** entries. A few CLIs are already casks (`copilot-cli`,
`android-platform-tools`).

Then the rest of the map:

| Change | File |
| ------ | ---- |
| Host facts (`system`, `username`, `timezone`, optional `flakeDir`) | `flake.nix` → `hosts` |
| Host-only nix-darwin (hostname, `stateVersion`, `allowUnfree`) | `hosts/<hostname>/default.nix` |
| Host-only hardware, launchd, or machine quirks | `hosts/<hostname>/` (inferno: `audio.nix`), not shared `modules/darwin/` |
| New host | `flake.nix` hosts **and** `hosts/<hostname>/` (copy inferno). Age key: [reference.md](reference.md) |
| Shared LSP / formatters (Python, Nix, Go, TS, shell, markdown) | `modules/home/editors/zed.nix` `home.packages` (Helix uses these too) |
| Helix-only LSP / `programs.helix` | `modules/home/editors/helix.nix` |
| Zed keymap / tasks / toggle script | `modules/home/editors/zed/` (copied on switch) |
| Zed `settings.json` (includes API keys) | `zed/settings.json` + `sops.templates` in `zed.nix` |
| VS Code settings / extensions | `editors/vscode/settings.json`, `extensions.txt`, logic in `vscode.nix` |
| macOS `defaults` | `modules/darwin/defaults.nix`; app blobs under `modules/darwin/defaults/` |
| Itsycal prefs | `defaults/itsycal.nix` |
| Dock icons | `modules/darwin/defaults/dock-items.nix` |
| Login items | `loginItems` in `defaults.nix` |
| ⌘⌥ app hotkeys | `modules/darwin/skhd.nix` |
| Fonts | `modules/darwin/fonts.nix` |
| Nix daemon / GC / Touch ID / firewall / shells | `modules/darwin/core.nix` |
| zsh / `nixswitch` aliases | `modules/home/shell/zsh.nix` |
| `ls`/`cat`/`cd` aliases, fzf, yazi, btop, bat | `modules/home/tools/cli.nix` |
| Git identity / gh / lazygit | `modules/home/tools/git.nix` |
| Azure CLI | `modules/home/tools/azure.nix` |
| Exercism CLI + token | `modules/home/tools/exercism.nix` |
| SSH key + `~/.ssh/config` | `modules/home/tools/ssh.nix` (sops templates, not `programs.ssh`) |
| Non-secret env vars | `home.sessionVariables` in `modules/home/default.nix` |
| Extra PATH **directories** (not packages) | `home.sessionPath` in `modules/home/default.nix` |
| Secret **env vars** | vault + `sops.secrets` + `secret-env` in `tools/secrets.nix` |
| Secret **file** (ssh key) | `sops.secrets.<name>.path` in the owning module |
| Config that **contains** secrets | `sops.templates` + `config.sops.placeholder.*` |
| Create or modify a custom Agent Skill | `modules/home/agents/skills/<name>/SKILL.md` — auto-installed into `~/.agents/skills/<name>` on switch |
| Install / enable a third-party Agent Skill | `modules/home/agents/skills.nix` (`sources` + `skills.enable`) |
| Ghostty / Zellij | `modules/home/terminal/` |
| Starship | `modules/home/shell/starship.nix` |

Lookups: [nixpkgs](https://search.nixos.org/packages), [Homebrew](https://formulae.brew.sh/). GUI apps are Homebrew, not `home.packages`. New CLIs are nixpkgs, not `brew install` — after `rg` so you do not duplicate a cask.

## Recipes

**Add a nixpkgs CLI** (e.g. `jq`): `rg` the name first so you do not duplicate a
cask or editor-scoped package → confirm the attribute on search.nixos.org →
append to the existing `home.packages` list in the owning module (generic tools:
`modules/home/default.nix`) → `nix fmt` → tell the user `nixswitch`.

**Add a GUI app**: App Store → `masApps` with `mas search`; otherwise a `casks` entry. If it should sit in the Dock, login at boot, or get a ⌘⌥ hotkey, update `dock-items.nix` / `loginItems` / `skhd.nix` in the same change. Never `brew install`.

**Add a secret env var**: `sops secrets.yaml` in the private vault (`inputs.nix-secrets`, cheat sheet in its `.sops.yaml`) → `sops.secrets.<name> = { };` in `tools/secrets.nix` → `export NAME="${config.sops.placeholder.<name>}"` on `sops.templates."secret-env"` → `git push` in the vault repo, then `nix flake update nix-secrets && nixswitch && exec zsh` here. Other secret shapes: [references/secrets.md](references/secrets.md).

**Create or modify a custom Agent Skill**: Treat `modules/home/agents/skills/<name>/SKILL.md` as the only editable source of truth. Use the flat `modules/home/agents/skills/<name>/` layout; do not create category subdirectories. For new or substantive skill content, use `skill-creator` after locating this source file. Local skills are auto-installed on `nixswitch` (`enableAll = [ "local" ]`) to Zed (`~/.agents/skills`), Cursor, Codex, OpenCode, Antigravity, and Copilot. Never create, edit, or duplicate a managed skill in an agent directory.

**Enable a third-party Agent Skill**: pin the repo in `flake.nix` (`flake = false`) if it is not already an input, add or reuse a `sources` entry in `modules/home/agents/skills.nix`, put the directory name in that source's discover list, then move it into `skills.enable`. Do not `npx skills` / skills.sh.

## Package-profile collision checks

`home.packages` lands in one `buildEnv` with a shared `bin`. Related packages
(same upstream, CLI + LSP, runtime + bundled tool) can collide even when the
main commands differ. Apply this only when adding two or more packages that
overlap that way — not as a blanket ban on complementary CLI/LSP pairs.

1. Add only what the requested workflow needs. Do not add a fallback CLI or
   server just because an editor extension might call it.
2. Build the Home Manager profile before recommending `nixswitch`:

   ```sh
   nix build --no-link --print-out-paths \
     .#darwinConfigurations.inferno.config.home-manager.users.ew.home.path
   ```

3. If `buildEnv` reports a conflicting subpath, keep both workflows with the
   smallest fix. Do not hide the collision with `pathsToLink`. A CLI and an
   LSP can both be valid (`terraform` + `terraform-ls` in this flake); drop
   one only when they collide or one already covers the other.

## Hard rules

These exist because the next `nixswitch` will undo the "easy" workaround.

- **No `brew install` / `brew tap` / `mas install`.** `cleanup = "zap"` removes undeclared Homebrew. Add the cask/formula/`masApps` entry instead.
- **No `defaults write`** for keys this flake manages. `defaults.nix` reasserts them on switch.
- **Do not bump** `home.stateVersion` (`24.11`) or `system.stateVersion` (`5`). They record when the config was created, not the current nixpkgs.
- **Do not add taps** without pinning them in `nix-homebrew.nix` `taps` **and** a `flake.nix` input (`flake = false`). Prefer not adding taps.
- **Do not** put secrets in `home.sessionVariables`, `programs.ssh`, or editor JSON in git. Store ciphertext; substitute with placeholders.
- **Do not** use `programs.vscode` / `home.file` for Zed or VS Code settings — activation **copies** baselines over `~/.config/zed` and VS Code User settings. Permanent edits go in `modules/home/editors/`.
- **Do not** nest skills. Zed only sees `skills/<name>/SKILL.md`. Custom skills live under `modules/home/agents/skills/`; third-party skills are allowlisted in `modules/home/agents/skills.nix`. Do not write into any generated agent skill directory.
- Removing a VS Code / Zed extension ID does **not** uninstall it; only stops ensuring it. Uninstall in the editor.
- If activation fails on `*.hm-bak`, delete the leftover backup and retry. `backupFileExtension = "hm-bak"`.
- `sops.age.generateKey = false`. Missing `~/.config/sops/age/keys.txt` must fail, not mint a new key.

## Apply

| User wants | Command |
| ---------- | ------- |
| Apply current repo | `nixswitch` |
| Update nixpkgs/darwin/home-manager/etc. | `nixup` (also prunes system generations to 2) |
| Undo last switch | `nix-rollback` (only last two gens survive `nixup` + weekly GC) |
| Collect garbage now | `nixgc` |
| Format / eval | `nix fmt` and `nix flake check --no-build` from the flake root |

Bootstrap for a **new Mac** is in the repo `README.md` (age key before first switch). Do not re-encode those steps as Nix.

Outside nix (do not try to declare these): DoGitWork, OnVUE, Rosalyn; `gh`/`az` login; LuLu rules; iCloud; Bitwarden/browser profiles; skhd Accessibility permission; Cursor.app / Gemini OAuth.

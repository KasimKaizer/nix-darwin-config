# Agent Instructions

## Repository

This multi-host macOS flake declaratively manages nix-darwin, Home Manager,
nix-homebrew, SOPS secrets, editors, MCP servers, and Agent Skills. `flake.nix`
turns each `hosts.<name>` entry into `darwinConfigurations.<name>`; `inferno` is
the current primary Apple Silicon host.

Host facts (`system`, `username`, `timezone`, `flakeDir`) belong in `flake.nix`.
Host-only settings and hardware workarounds belong in `hosts/<hostname>/`.
Shared behavior belongs in `modules/darwin/` or `modules/home/`. Use the flake's
provided arguments instead of hardcoded paths or host facts.

## Working Rules

- Inspect `git status --short`, read the owning module and its import path, and
  find a nearby pattern before editing. Read `README.md` for host, bootstrap,
  activation, or repository-wide changes.
- Search for an existing owner before adding a package, setting, skill, MCP,
  editor setting, or secret. A new module must be imported; `default.nix` may
  contain both imports and configuration.
- Keep changes small, in the imported owner, and consistent with local style.
  Preserve unrelated work and never revert or discard it.
- Use current primary documentation for package and option facts. When
  available, use the Nix MCP for nixpkgs, Home Manager, nix-darwin, flakes, and
  package-version queries.
- Keep this root file as the shared baseline. Add a nested `AGENTS.md` only for
  a subtree with its own owner, validation path, or safety boundary.

## Ownership

| Change                                                             | Owner                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------ |
| Shared macOS defaults, Dock, login items, fonts, hotkeys           | `modules/darwin/`                                            |
| Nix daemon, GC, PAM, firewall, shells                              | `modules/darwin/core.nix`                                    |
| Casks, formulae, and App Store apps                                | `modules/darwin/homebrew.nix`                                |
| Homebrew bootstrap and pinned taps                                 | `modules/darwin/nix-homebrew.nix`                            |
| Home Manager imports, generic CLI packages, non-secret environment | `modules/home/default.nix`                                   |
| Shell, terminal, Git, SSH, cloud, and exercise tools               | `modules/home/{shell,terminal,tools}/`                       |
| Helix, Zed, VS Code, extensions, and shared LSPs                   | `modules/home/editors/`                                      |
| Encrypted values and SOPS wiring                                   | `secrets/secrets.yaml`, `.sops.yaml`, and the owning module  |
| OpenCode, Cursor, Codex, Copilot, and Antigravity MCPs             | `modules/home/tools/agents.nix`                              |
| Zed native context servers and secret rendering                    | `modules/home/editors/zed.nix` and `zed/settings.json`       |
| Agent Skills and their deployment                                  | `skills/<name>/SKILL.md` and `modules/home/tools/skills.nix` |

## Declarative Boundaries

- Treat generated paths under `~/.config`, `~/.cursor`, `~/.codex`,
  `~/.copilot`, `~/.gemini`, and `~/.agents` as outputs. Edit this repository,
  never those outputs.
- Zed and VS Code baseline files are copied on `nixswitch`; Zed's
  `settings.json` is the SOPS-rendered exception and is a generated symlink.
  Permanent changes belong in `modules/home/editors/`.
- Custom skills use the flat `skills/<name>/SKILL.md` layout. Third-party skills
  need a pinned `flake.nix` input and an allowlisted source in `skills.nix`.
- Prefer nixpkgs for CLI tools, Homebrew casks for GUI apps, and `masApps` for
  App Store apps. The existing `mas` formula is a bootstrap exception, not a
  precedent for installing other formulae.
- Homebrew cleanup is `zap`; do not run `brew install`, `brew tap`, or `mas install`. Do not run `defaults write` for keys this flake manages.
- Keep secret source values encrypted in `secrets/secrets.yaml`. Use
  `sops.secrets` for whole secret files and `sops.templates` with
  `config.sops.placeholder.*` for generated configurations containing secrets.
  Never commit plaintext secrets or put them in non-secret Nix, prompts, rules,
  or Git configuration.
- Do not change an existing `home.stateVersion` or `system.stateVersion`.

## Approval Boundaries

Never run `nixswitch`, `nixup`, `nixgc`, `nix-rollback`, `darwin-rebuild
switch`, package installation, destructive cleanup, `git add`, `git commit`, or
`git push` without explicit approval. Do not use destructive Git commands such
as `git reset --hard` or `git checkout --` without approval.

One-time application logins, browser and Bitwarden profiles, iCloud, LuLu rules,
and macOS Accessibility permissions remain outside this flake.

## Verification

Always run `git diff --check`; run `git diff --cached --check` when files are
staged, and inspect each intended untracked file for whitespace errors.

For Nix changes, first ensure whole-tree `nix fmt` cannot rewrite unrelated
dirty files. Then run:

```sh
nix fmt
nix flake check --no-build
nix eval --raw .#darwinConfigurations.<hostname>.config.system.build.toplevel.drvPath
```

Evaluate every affected host. Do not substitute activation for evaluation, and
report any command intentionally not run. `nixswitch` requires explicit approval
after validation.

## Detailed Workflow

Use the `nix-darwin-home-manager` Agent Skill for package placement, new hosts,
editor behavior, SOPS recipes, package-profile collision checks, and activation
pitfalls.

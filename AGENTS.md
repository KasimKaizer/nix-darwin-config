# Agent Instructions

Multi-host macOS flake (`nix-darwin` + `home-manager` + `nix-homebrew` + `sops-nix`). `flake.nix:hosts.<name>` → `darwinConfigurations.<name>`. Primary host `inferno` (`ew`, `aarch64-darwin`). Secrets live in a private vault (`inputs.nix-secrets`).

## Workflow

1. **Search first.** `rg <name>` + `git status --short`. If it exists, edit that owner — don't duplicate.
2. **Read the owner** and its `default.nix` imports. Match existing style. New module → must be imported.
3. **Edit once**, small and in the imported owner. Don't touch unrelated files. New `.nix` file → `git add -N` before `nix eval` (flakes ignore untracked files).
4. Use Nix MCP for package/option facts — don't rely on training data.
5. `nix fmt` then `nix flake check --no-build` and `nix eval .#darwinConfigurations.<hostname>.config.system.build.toplevel.drvPath`. Tell user `nixswitch` — never run it.

## Where to put things

| What | Where |
|---|---|
| Host facts (`system`, `username`, `timezone`) | `flake.nix` |
| Host-only overrides | `hosts/<hostname>/` |
| System (defaults, Dock, fonts, homebrew, shells) | `modules/darwin/` |
| User (shell, terminal, editors, tools, agents) | `modules/home/` |
| Secrets (vault is private, wiring is `sops.*` in owning module) | `sops.secrets` / `sops.templates` |

Details: `README.md` (bootstrap), `CAVEATS.md` (warnings).

## Guardrails

- No `brew install`/`brew tap`/`mas install` — `cleanup = "zap"` will undo it.
- No `defaults write` for keys in `modules/darwin/`.
- No plaintext secrets, no `builtins.readFile` on vault paths, no decrypting vault into chat. Vault is private (`inputs.nix-secrets`); use `sops.secrets` + `config.sops.placeholder.*`.
- Don't hardcode `/Users/ew` or host facts — use `inputs`/`hostname`/`homeDirectory`/`flakeDir` from `specialArgs`.
- Don't bump `home.stateVersion` / `system.stateVersion`.
- Never run `nixswitch`, `nixup`, `nixgc`, `git add/commit/push`, or destructive git without approval.

Treat `~/.config`, `~/.cursor`, `~/.codex`, `~/.agents` as generated outputs.

## Verify

`git diff --check` (and `--cached` if staged). For Nix: `nix fmt` → `nix flake check --no-build` → `nix eval`. Report what you skipped. See skill for collision checks.

# Agent Instructions

Multi-host macOS flake (`nix-darwin` + `home-manager` + `nix-homebrew` + `sops-nix`). `flake.nix:hosts.<name>` → `darwinConfigurations.<name>`. Primary host `inferno` (`ew`, `aarch64-darwin`). Secrets live in a private vault (`inputs.nix-secrets`).

## Workflow

1. **Search first.** `rg <name>` + `git status --short`. If it exists, edit that owner — don't duplicate.
2. **Read the owner** and its `default.nix` imports. Match existing style. New module → must be imported.
3. **Edit once**, small and in the imported owner. Don't touch unrelated files. New `.nix` file → use `git add -N` before `nix eval` only with user approval (flakes ignore untracked files); otherwise report that the untracked file cannot be included in flake evaluation.
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

## Code Style

Write readable, intuitive, followable, idiomatic code — not the shortest or smartest. A new team member should understand the change faster than the original.

## Nix Development

- Use Git for version control. Prefer modern `nix` CLI commands such as `nix build`, `nix eval`, and `nix flake check`; avoid legacy commands such as `nix-build`.
- Never call `builtins.getFlake`; use flake references through the `nix` CLI. Avoid searching `/nix/store` directly. If store source lookup is necessary, run `nix flake archive --json` separately and use its literal output path in a later command; do not combine archive and search in one command.
- Prefer `jq` over Python for processing JSON from commands when it is sufficient.
- Follow this flake's `darwinConfigurations` and explicit module imports. Do not migrate to flake-parts/Dendritic auto-discovery or `.mod.nix` files unless explicitly requested; new modules must be imported.

## Nix Style

- Prefer `lib.lists.singleton` for a one-item list. In `let` bindings, inherit library functions from their specific namespace (for example, `inherit (lib.lists) head;`); use `inherit (lib) name;` for top-level functions.
- In shell aliases, prefer `${lib.getExe pkgs.<package>}` over bare command names; bind the executable once if it is reused.
- Leave a blank line between unrelated options. When one module defines these categories, order them as environment variables, aliases, packages, XDG configuration, then program-specific configuration.
- Do not bind values in `let` that duplicate configurable module options. When an option is set through `config.*`, refer to it through `config.*`; `let` bindings are appropriate for computed derivations, helpers, and reused `getExe` values.
- Prefer destructured attribute-set arguments when they improve clarity.
- Prefix multiline code strings with a language comment, such as `/* bash */ ''`.
- Write category comments in uppercase without a period (for example, `# DOCK`).
- Prefer applying `lib.mkIf` to individual options rather than wrapping a whole attribute set when both forms are equivalent.
- Use `darwin`, not `macos`, in filenames and module names.
- Define inline packages with `pkgs.callPackage` and destructured arguments. Keep a package definition in its own imported file/module when it is a separate concern; write inline source with `writeText` directly in the `src` attribute instead of an extra `let` binding.
- In modules that define both `darwinModules` and other module types, put `darwinModules` first.
- Prefer library functions or module options over direct `builtins.*` calls when an equivalent exists, but keep necessary builtins used by this flake (for example, `builtins.toJSON`). Avoid `rec`; use `let` bindings or an explicit fixpoint helper if recursion is unavoidable.
- Prefer long-form CLI options in scripts and documented commands when available; short options are fine for interactive use. For paths that must preserve derivation context, use `"${path}"` rather than `toString`.

## Git Commits

- Follow the repository's established message style: prefer `<area>: <Capitalized imperative summary>` with no trailing period. Use a useful area, often path-like, as in `agents/opencode: Stage OpenAI OAuth in sandbox`, `editors/zed: Update Zed AI model defaults`, `homebrew: Disable Ollama app cask`, and `flake: Update flake inputs`.
- Keep each commit focused on one logical change. Related changes can span multiple files; do not impose an arbitrary file-count or line-count limit.
- Add a concise body when the subject alone does not capture important motivation, scope, constraints, or behavior-preservation details. Do not restate the diff just to make a message longer.
- Only stage or commit after explicit user approval. Once approved, inspect `git status --short` and the staged diff, stage only files for the approved change, check for secrets and unrelated changes, and run the relevant verification before committing. Never include pre-existing user changes in a commit without approval.

## Guardrails

- No `brew install`/`brew tap`/`mas install` — `cleanup = "zap"` will undo it.
- Before recommending a switch after changing Homebrew declarations, evaluate the target host's `homebrew.brews` and `homebrew.casks`; `cleanup = "zap"` removes undeclared packages.
- No `defaults write` for keys in `modules/darwin/`.
- No plaintext secrets, no `builtins.readFile` on vault paths, no decrypting vault into chat. Vault is private (`inputs.nix-secrets`); use `sops.secrets` + `config.sops.placeholder.*`. Avoid passing plaintext secret values in shell arguments or history; use SOPS editor, file, or stdin workflows.
- Don't hardcode `/Users/ew` or host facts — use `inputs`/`hostname`/`homeDirectory`/`flakeDir` from `specialArgs`.
- Don't bump `home.stateVersion` / `system.stateVersion`.
- Never run `nixswitch`, `nixup`, `nixgc`, `git add/commit/push`, or destructive git without approval.

Treat flake-managed client configuration as generated outputs, not source. Zed and VS Code settings come from `modules/home/editors/`; agent configs and skills come from `modules/home/agents/`. Do not edit deployed copies such as `~/.config/zed`, VS Code User settings, `~/.agents`, `~/.cursor`, `~/.codex`, `~/.config/opencode`, `~/.gemini/config/mcp_config.json`, `~/.gemini/antigravity-cli`, or `~/.copilot` directly.

## Verify

`git diff --check` (and `--cached` if staged). For Nix: `nix fmt` → `nix flake check --no-build` → `nix eval`. For explicit builds, prefer `nix build --no-link` to avoid leaving a `result` symlink in the repository. Report what you skipped. See skill for collision checks.

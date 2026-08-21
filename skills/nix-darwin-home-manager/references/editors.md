# Editors

Zed and VS Code are Homebrew casks. Helix is nixpkgs (`programs.helix`). The
install path and the config path are different files.

| | Zed | VS Code | Helix |
| --- | --- | --- | --- |
| App | Homebrew cask | Homebrew cask | `programs.helix` in `helix.nix` |
| Baseline | `modules/home/editors/zed/` copied on switch | `editors/vscode/settings.json` copied on switch | Nix `programs.helix` (store-managed) |
| Secrets | `sops.templates."zed-settings.json"` → `~/.config/zed/settings.json` | none in-repo | none |
| Extensions | `auto_install_extensions` in settings (install only) | `vscode/extensions.txt` IDs, `code --install-extension` (install only) | n/a |

`nixswitch` **copies** Zed keymap/tasks/toggle script and VS Code settings into
writable locations so the editors can rewrite them while experimenting. The next
switch overwrites those experiments. Permanent changes belong in
`modules/home/editors/`, not in `~/.config/zed` or VS Code User settings.

Do not switch this to `programs.vscode` or `home.file` / `xdg.configFile` for
those baselines: that would symlink read-only store files and break in-app
edits. `settings.json` for Zed is the exception — it is a sops template
(API keys) and is symlinked, never plaintext in the nix store.

Shared language servers and formatters used by **both** Zed and Helix live in
`zed.nix` `home.packages` so Helix sees them on PATH. Helix-only extras
(`vscode-langservers-extracted`, taplo, Dockerfile LSP, …) stay in `helix.nix`.
If the user asks for a Python/Nix/Go/TS/shell/markdown LSP "for Helix", still
add it in `zed.nix` unless it is Helix-only.

Removing an extension ID from either list does not uninstall it; do that in the
editor. Install failures for VS Code extensions are non-fatal so a flaky
network cannot abort `nixswitch`.

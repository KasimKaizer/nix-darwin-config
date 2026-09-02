# nix-darwin-config

<p align="center">
  <img src="assets/banner.png" alt="macOS + Nix" width="720" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/macOS-000000?logo=apple&logoColor=white" alt="macOS" />
  <img src="https://img.shields.io/badge/Nix-5277C3?logo=nixos&logoColor=white" alt="Nix" />
  <img src="https://img.shields.io/badge/nix--darwin-111111?logo=apple&logoColor=white" alt="nix-darwin" />
  <img src="https://img.shields.io/badge/home--manager-7EBAE4?logo=nixos&logoColor=white" alt="home-manager" />
</p>

Declarative macOS environment with `nix-darwin` and `home-manager`. One flake manages system defaults, Homebrew, shells, editors and tools. Secrets are encrypted in a private vault.

## Hosts

Every `hosts.<name>` entry in `flake.nix` becomes a `darwinConfigurations.<name>`. Host facts (`system`, `username`, `timezone`, `flakeDir`) live there, per-host quirks live in `hosts/<name>/`, and shared behavior lives in `modules/darwin/` and `modules/home/`. Use `specialArgs` (`inputs`, `hostname`, `homeDirectory`, `flakeDir`) instead of hardcoding paths.

Add a host:

```nix
# flake.nix → outputs → let → hosts
hosts = {
  myhost = {
    system = "aarch64-darwin"; # or x86_64-darwin for Intel
    username = "foo";
    timezone = "Europe/London";
    # flakeDir = "/Users/foo/.config/nix-darwin-config"; # optional: override clone path
  };
};
```

Then `cp -r hosts/<existing> hosts/<new>` and tweak. If the new machine needs its own age key, add it to the private vault's `.sops.yaml` and run `sops updatekeys secrets.yaml` there first.

## Bootstrap (mostly for future me)

Use on **any** Mac this flake manages. Replace `<hostname>` with your `hosts` key. Age key must exist **before** the first switch.

1. **Xcode Command Line Tools**
   ```bash
   xcode-select --install
   ```
2. **Install Nix** (flakes-capable)
   ```bash
   curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
   ```
3. **Clone + restore age key**
   ```bash
   git clone https://github.com/KasimKaizer/nix-darwin-config.git ~/.config/nix-darwin-config
   cd ~/.config/nix-darwin-config
   mkdir -p ~/.config/sops/age
   chmod 600 ~/.config/sops/age/keys.txt
   ```
   Also clone the private vault (for secrets):
   ```bash
   git clone git@github.com:KasimKaizer/nix-secrets.git ~/.config/nix-secrets
   ```
4. **First activation** (`darwin-rebuild` not on `PATH` yet)
   ```bash
   sudo nix run nix-darwin#darwin-rebuild -- switch --flake ~/.config/nix-darwin-config#<hostname>
   ```
5. **After first switch**
   ```bash
   exec zsh
   ```

## Commands

Useful aliased commands:

| Command        | Purpose                                       |
| -------------- | --------------------------------------------- |
| `nixswitch`    | apply flake for this machine (`…#<hostname>`) |
| `nixup`        | `nix flake update` + switch + prune to 2 gens |
| `nix-rollback` | undo last switch                              |
| `nixgc`        | collect garbage                               |

Useful non-aliased commands:

| Command                             | Purpose                         |
| ----------------------------------- | ------------------------------- |
| `nix fmt`                           | format the flake tree           |
| `nix flake check --no-build`        | evaluate flake without building |
| `darwin-rebuild --list-generations` | list system generations         |

## Structure

This flake is organized by concern: `default.nix` files are import lists, one module is one concern.

- **Flake entry**: `flake.nix` (inputs, `hosts` registry, `mkDarwin`, formatter) and `flake.lock` (pinned inputs including private vault)
- **Hosts**: `hosts/<name>/` for per-machine darwin settings (e.g. `audio.nix` for hardware quirks, `default.nix` for host identity)
- **System**: `modules/darwin/` (`core.nix` for nix/GC/PAM, `defaults.nix` + `defaults/` for macOS defaults, `homebrew.nix` for casks/brews/masApps, `nix-homebrew.nix` for taps, `fonts.nix`, `skhd.nix`)
- **User**: `modules/home/` (`default.nix` for imports/packages, `shell/` for zsh/starship, `terminal/` for ghostty/zellij, `editors/` for helix/vscode/zed, `tools/` for cli/git/ssh/secrets/exercism/azure, `agents/` for agents, skills and MCPs)

Rules of thumb: CLI package → `modules/home/default.nix` (or owning `tools/` module); GUI/MAS app → `modules/darwin/homebrew.nix`; macOS default → `modules/darwin/defaults.nix`.

See [Caveats](CAVEATS.md) for the full list of platform quirks and one-time setup steps.

## Outside nix

These stay manual and are **not** declared in this flake:

- **Install by hand**: DoGitWork, OnVUE, Rosalyn (App Store / pkg)
- **Auth and state**: `gh auth login`, `az login`, Bitwarden/browser profiles, Gemini/Copilot OAuth, App Store/iCloud login, Ollama config, JetBrains Settings Sync (synced via JetBrains account)
- **System permissions**: `skhd` needs Accessibility enabled each machine; LuLu rules live outside nix and must be configured in-app

## References

- [nix-darwin](https://nix-darwin.github.io/nix-darwin/manual/index.html)
- [home-manager](https://nix-community.github.io/home-manager/options.html)
- [sops-nix](https://github.com/Mic92/sops-nix)
- [nix-homebrew](https://github.com/zhaofengli/nix-homebrew)
- [macOS defaults](https://macos-defaults.com)
- [Nix packages](https://search.nixos.org/packages)
- [Homebrew](https://formulae.brew.sh/)

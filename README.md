# nix-darwin-config ❄️

*A [snowflake](https://github.com/lanjoni/snowflake) inspired configuration using nix-darwin and home-manager flakes*

This repository contains complete system configurations for macOS management through Nix, implementing a reproducible development environment with atomic updates and rollbacks.

## Pre-Installation Setup

**Replace these values with your specific values in configuration files**:
- `inferno` ➔ Your system hostname (check with `hostname` in terminal)
- `ew` ➔ Your macOS username (check with `whoami`)
- `/Users/ew/` ➔ Your user home path (typically `/Users/<your-username>/`)

## Installation

1. **Install Nix** (skip if already installed):
```bash
curl --proto '=https' --tlsv1.2 -sSf -L https://install.determinate.systems/nix | sh -s -- install
```
2. **Clone repository**:
```bash
git clone https://github.com/KasimKaizer/nix-darwin-config.git ~/.config/nix-darwin-config
```
3. **Build configuration** (replace `inferno` with your hostname):
```bash
nix --extra-experimental-features "nix-command flakes" build .#darwinConfigurations.inferno.system
```
4. **Activate configuration**:
```bash
./result/sw/bin/darwin-rebuild switch --flake ~/.config/snowflake/.#inferno
```
## Configuration

- `flake.nix`: Contains the base configuration of our flake, controlling the expected inputs and outputs, in addition to managing the external urls of `home-manager` and `nix-darwin`;
- `modules/darwin/default.nix`: Contains the complete configuration of our nix-darwin, including imports for configurations, extra options, among others;
- `modules/darwin/settings/homebrew.nix`: Contains the [homebrew](https://brew.sh/) and MacStore apps configuration, including casks, brews and taps;
- `modules/darwin/settings/system.nix`: Contains the entire system configuration, including appearance, dock management, I/O devices settings, and others;
- `modules/home-manager/default.nix`: Contains the `home-manager` configuration imports, packages and session variables;
- `modules/home-manager/settings/inputrc`: This is just que `inputrrc` file for input settings with `home-manager`;
- `modules/home-manager/settings/zsh.nix`: Contains the entire [zsh](https://zsh.sourceforge.io/) configuration;
- `result`: A symlink which apoints to your build at `/nix/store`.

Note: if you want to install a simple package, go to `modules/home-manager/default.nix` and add the package name to the `home.packages` list. But, if you want to strictly configure your package, then include a file in `modules/home-manager/settings` with the name of your package and its settings following the template below:

```nix
# At modules/home-manager/settings/yourpackage.nix
{ pkgs, ... }: {
  programs.yourpackage = {
    # Your settings
  };
}
```

And don't forget to import in `modules/home-manager/default.nix`:

```nix
# ...
  imports = [
    ./settings/zsh.nix
    ./settings/yourpackage.nix
  ];
# ...
```

To search for packages you can use the [official search at nixos.org](https://search.nixos.org/packages).

## Documentation Resources

- [NixOS Wiki](https://nixos.wiki/)
- [nix-darwin Configuration Options ](https://daiderd.com/nix-darwin/manual/index.html)
- [Home Manager Options](https://nix-community.github.io/home-manager/options.html)

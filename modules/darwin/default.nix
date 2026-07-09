{ pkgs, lib, ... }: {
  # here go the darwin preferences and config items
  programs.zsh.enable = true;
  users.users.ew.home = "/Users/ew";
  system.primaryUser = "ew";
  # services.nix-daemon.enable = true;
  nix.settings.experimental-features = [
    "nix-command"
    "flakes"
  ];
  nix.optimise.automatic = true;
  nix.enable = true;
  # Flakes-only setup: default NIX_PATH points at root channels that don't
  # exist (warning on impure evals). Resolve <nixpkgs> via the flake registry.
  nix.nixPath = lib.mkForce [ "nixpkgs=flake:nixpkgs" ];
  # HTML manual build is broken by nixpkgs/nix-darwin skew
  # (nixos-render-docs removed --toc-depth, nix-darwin master still passes it).
  # The uninstaller embeds a default config that hits the same bug.
  # Re-enable both once upstream nix-darwin catches up.
  documentation.doc.enable = false;
  system.tools.darwin-uninstaller.enable = false;
  # do garbage collection weekly to keep disk usage low
  nix.gc = {
    automatic = lib.mkDefault true;
    options = lib.mkDefault "--delete-older-than 7d";
  };

  imports = [
    ./settings/system.nix
    ./settings/homebrew.nix
  ];
}

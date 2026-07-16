{
  pkgs,
  lib,
  username,
  homeDirectory,
  ...
}:
{
  # here go the darwin preferences and config items
  programs.zsh.enable = true;
  users.users.${username}.home = homeDirectory;

  nix.enable = true;
  nix.settings.experimental-features = [
    "nix-command"
    "flakes"
  ];
  nix.optimise.automatic = true;
  # Flakes-only setup: default NIX_PATH points at root channels that don't
  # exist (warning on impure evals). Resolve <nixpkgs> via the flake registry.
  nix.nixPath = lib.mkForce [ "nixpkgs=flake:nixpkgs" ];
  # do garbage collection weekly to keep disk usage low
  nix.gc = {
    automatic = lib.mkDefault true;
    options = lib.mkDefault "--delete-older-than 7d";
  };

  # HTML manual build is broken by nixpkgs/nix-darwin skew
  # (nixos-render-docs removed --toc-depth, nix-darwin master still passes it).
  # The uninstaller embeds a default config that hits the same bug.
  # Re-enable both once upstream nix-darwin catches up.
  documentation.doc.enable = false;
  system.tools.darwin-uninstaller.enable = false;

  # Add ability to use Touch ID for sudo authentication.
  security.pam.services.sudo_local.touchIdAuth = true;
  security.pam.services.sudo_local.reattach = true;

  # macOS built-in firewall (LuLu adds outbound filtering on top).
  networking.applicationFirewall.enable = true;

  environment = {
    shells = with pkgs; [
      bash
      zsh
    ];
    systemPackages = [ pkgs.coreutils ];
    systemPath = [ "/usr/local/bin" ];
    pathsToLink = [ "/Applications" ];
  };
}

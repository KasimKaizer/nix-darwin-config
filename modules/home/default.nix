{
  pkgs,
  config,
  lib,
  username,
  homeDirectory,
  ...
}:
{
  # specify my home-manager configs
  imports = [
    ./shell/zsh.nix
    ./shell/starship.nix
    ./terminal/ghostty.nix
    ./terminal/zellij.nix
    ./editors/helix.nix
    ./editors/vscode.nix
    ./editors/zed.nix
    ./tools/cli.nix
    ./tools/git.nix
    ./tools/ssh.nix
    ./tools/secrets.nix
    ./tools/exercism.nix
  ];

  xdg.enable = true;

  home = {
    username = username;
    homeDirectory = homeDirectory;
    sessionPath = [
      "${config.home.homeDirectory}/go/bin"
      "${config.home.homeDirectory}/.local/bin"
    ];
    packages = with pkgs; [
      # General CLI utilities
      bitwarden-cli
      ffmpeg
      glow
      htop
      mole-cleaner
      moor
      p7zip
      powershell
      rar
      rclone
      sherlock
      wget
    ];

    sessionVariables = {
      PAGER = "moor";
      CLICOLOR = 1;
      EDITOR = "hx";
      AOC_PATH = "${config.home.homeDirectory}/projects/advent_of_code";
    };
  };

  # screencapture.location (modules/darwin/defaults.nix) points here; macOS
  # silently ignores the setting if the directory is missing.
  home.activation.screenshotsDir = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    ${pkgs.coreutils}/bin/mkdir -p "${homeDirectory}/Pictures/Screenshots"
  '';

  # Let Home Manager install and manage itself.
  programs.home-manager.enable = true;

  # Don't change this when you change package input. Leave it alone.
  home.stateVersion = "24.11"; # 23.11 # 24.05
}

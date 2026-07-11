{
  pkgs,
  config,
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
    ./editors/vscodium.nix
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
      htop
      bitwarden-cli
      wget
      powershell
      mosh
      sherlock
      p7zip
      rar
    ];

    sessionVariables = {
      PAGER = "less";
      CLICOLOR = 1;
      EDITOR = "hx";
      AOC_PATH = "${config.home.homeDirectory}/projects/advent_of_code";
    };
  };

  # Let Home Manager install and manage itself.
  programs.home-manager.enable = true;

  # Don't change this when you change package input. Leave it alone.
  home.stateVersion = "24.11"; # 23.11 # 24.05
}

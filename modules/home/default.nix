{
  pkgs,
  username,
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
    ./tools/cli.nix
    ./tools/git.nix
    ./tools/secrets.nix
  ];

  home = {
    username = username;
    homeDirectory = "/Users/${username}";
    packages = with pkgs; [
      htop
      gh
      bitwarden-cli
      biome
      go
      python3
      uv
      pyrefly
      nodejs
      prettier
      typescript-language-server
      vscode-langservers-extracted
      fastfetch
      exercism
      wget
      spicetify-cli
      nixfmt
      jetbrains-mono
      delve
      go-tools
      gopls
      golangci-lint
      nil
      marksman
      ltex-ls
      bash-language-server
      mosh
      # yt-dlp
      yazi
      glow
      lazygit
      # Upstream sherlock pins pandas<3.0.0, but nixpkgs now ships pandas 3.x,
      # which fails its runtime-dependency check. Skip that check.
      (sherlock.overridePythonAttrs (_: {
        dontCheckRuntimeDeps = true;
      }))
      osx-cpu-temp
      btop
      p7zip
      rar
      live-server
      # ollama
      # gemini-cli
      nixd
    ];

    sessionVariables = {
      PAGER = "less";
      CLICOLOR = 1;
      EDITOR = "hx";
      AOC_PATH = "/Users/${username}/projects/advent_of_code";
    };
  };

  # Let Home Manager install and manage itself.
  programs.home-manager.enable = true;

  home.file.".inputrc".source = ./inputrc;
  # Don't change this when you change package input. Leave it alone.
  home.stateVersion = "24.11"; # 23.11 # 24.05
}

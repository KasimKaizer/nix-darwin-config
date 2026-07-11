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
    ./editors/zed.nix
    ./tools/cli.nix
    ./tools/git.nix
    ./tools/ssh.nix
    ./tools/secrets.nix
  ];

  home = {
    username = username;
    homeDirectory = "/Users/${username}";
    packages = with pkgs; [
      htop
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
      gotools # goimports (go-tools is staticcheck; gotools has goimports)
      gopls
      golangci-lint
      nil
      marksman
      ltex-ls
      bash-language-server
      shfmt # shell formatter (Zed "Shell Script")
      shellcheck # shell diagnostics (used by bash-language-server)
      powershell # pwsh runtime for the Zed PowerShell extension (PSES)
      mosh
      # yt-dlp
      glow
      # Upstream sherlock pins pandas<3.0.0, but nixpkgs now ships pandas 3.x,
      # which fails its runtime-dependency check. Skip that check.
      (sherlock.overridePythonAttrs (_: {
        dontCheckRuntimeDeps = true;
      }))
      osx-cpu-temp
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

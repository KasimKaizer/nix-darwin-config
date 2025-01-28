{ pkgs, ... }: {
  # specify my home-manager configs
  imports = [
    ./settings/zsh.nix
    ./settings/helix.nix
    ./settings/vscodium.nix
    ./settings/ghostty.nix
    ./settings/zellij.nix
  ];

  home = {
    username = "ew";
    homeDirectory = "/Users/ew";
    packages = with pkgs; [
      htop
      gh
      go
      python3
      fastfetch
      exercism
      wget
      spicetify-cli
      nixpkgs-fmt
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
      yt-dlp
      yazi
      glow
      lazygit
      sherlock
      osx-cpu-temp
      btop
      ollama
    ];

    sessionVariables = {
      PAGER = "less";
      CLICLOLOR = 1;
      EDITOR = "hx";
    };
  };

  programs = {
    starship = {
      enable = true;
      enableZshIntegration = true;
      settings = {
        add_newline = false;
        git_branch = {
          symbol = "🌱 ";
        };
        git_commit = {
          commit_hash_length = 4;
          tag_symbol = "🔖 ";
        };
        git_state = {
          format = "[\($state($progress_current of $progress_total)\)]($style) ";
          cherry_pick = "[🍒 PICKING](bold red)";
        };

        git_status = {
          conflicted = "🏳";
          ahead = "🏎💨";
          behind = "😰";
          diverged = "😵";
          untracked = "🤷‍";
          stashed = "📦";
          modified = "📝";
          staged = "[++\($count\)](green)";
          renamed = "👅";
          deleted = "🗑";
        };

        battery = {
          full_symbol = "🔋 ";
          charging_symbol = "⚡️ ";
          discharging_symbol = "💀 ";
        };

        nix_shell = {
          disabled = true;
          impure_msg = "[impure shell](bold red)";
          pure_msg = "[pure shell](bold green)";
          format = "via [☃️ $state( \($name\))](bold blue) ";
        };
      };
    };

    bat = {
      enable = true;
      config.theme = "TwoDark";
    };

    fzf = {
      enable = true;
      enableZshIntegration = true;
    };

    zoxide = {
      enable = true;
      enableBashIntegration = true;
    };

    eza.enable = true;
    git.enable = true;
  };

  # Let Home Manager install and manage itself.
  programs.home-manager.enable = true;

  home.file.".inputrc".source = ./settings/inputrc;
  # Don't change this when you change package input. Leave it alone.
  home.stateVersion = "24.11"; # 23.11 # 24.05
}

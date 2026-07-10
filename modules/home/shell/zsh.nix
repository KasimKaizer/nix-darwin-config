{ ... }:
{
  # .zshenv
  programs.zsh = {
    enable = true;
    enableCompletion = true;
    autosuggestion.enable = true;
    syntaxHighlighting.enable = true;

    history = {
      ignoreDups = true;
      ignoreAllDups = true;
      ignoreSpace = true;
      save = 1000000;
      size = 1000000;
    };

    shellAliases = {
      nixswitch = "sudo -H darwin-rebuild switch --flake /Users/ew/.config/nix-darwin-config#inferno";
      nixup = "pushd /Users/ew/.config/nix-darwin-config && nix flake update && nixswitch && sudo -H nix-env --profile /nix/var/nix/profiles/system --delete-generations +2 && popd";
      nixgc = "sudo -H nix-collect-garbage -d && nix-collect-garbage -d";
      ls = "eza -F --icons=always";
      ll = "ls -lahrts";
      la = "eza -la --git --group-directories-first --icons";
      l = "eza -l --git --group-directories-first --icons";
      cd = "z";
      zj = "zellij";
      za = "zellij a";
      zk = "zellij ka -y && zellij da -y";
      cat = "bat";
      python = "python3";
      zjt = "zellij action rename-tab";
      zjs = "zellij action rename-session";
    };

    profileExtra = ''
      eval "$(/opt/homebrew/bin/brew shellenv)"
    '';

    initContent = ''
      export ERL_AFLAGS="-kernel shell_history enabled"

      export PATH="/Users/ew/go/bin/:$PATH"
      export XDG_CONFIG_HOME="/Users/ew/.config"
      # And enable this
      if [ -e '/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh' ]; then
        . '/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh'
      fi

      source ~/.aoc_vars
    '';

    oh-my-zsh = {
      enable = true;
      # theme = "spaceship";
      plugins = [
        "golang"
        "git"
        "asdf"
        "fzf"
        "rbenv"
        "history"
        "history-substring-search"
      ];
    };
  };
}

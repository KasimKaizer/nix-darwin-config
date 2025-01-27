{ pkgs, ... }: {
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
      nixswitch = "darwin-rebuild switch --flake ~/.config/nix-darwin-config/.#inferno";
      nixup = "pushd ~/.config/nix-darwin-config; nix flake update; nixswitch; popd";
      nixgc = "sudo nix-store --gc -d;sudo nix-store --gc --print-roots | egrep -v \"^(/nix/var|/run/\w+-system|\{memory|/proc)\"";
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

    initExtra = ''
      # Legacy settings:
      # export ZSH="/Users/ew/.oh-my-zsh"
      # export TERM=xterm-256color
      # export LANG=en_US.UTF-8
      # export PATH="$HOME/.emacs.d/bin:$PATH"
      # . "$HOME/.asdf/asdf.sh"
      # eval "$(rbenv init - zsh)"
      # eval $(opam env)
      # export PATH="/Users/ew/.layerform/:$PATH"
      # Ok, if Nix doesn't work, try this:
      # export PATH="/run/current-system/sw/bin:$PATH"
      # source <(kubectl completion zsh)
      # export NVM_DIR="$HOME/.nvm"
      # export KERL_BUILD_DOCS="yes"
      # export ERL_AFLAGS="-kernel shell_history enabled"
      # export SDKMAN_DIR="$HOME/.sdkman"
      # [[ -s "$HOME/.sdkman/bin/sdkman-init.sh" ]] && source "$HOME/.sdkman/bin/sdkman-init.sh"

      # real settings:
      export EDITOR=hx
      SPACESHIP_SCALA_SHOW=false
      export PATH="/Users/ew/go/bin/:$PATH"
      export XDG_CONFIG_HOME="/Users/ew/.config"
      # And enable this
      if [ -e '/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh' ]; then
        . '/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh'
      fi

      if [ -t 0 ] && [ -z "$ZELLIJ" ]; then
          zellij
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

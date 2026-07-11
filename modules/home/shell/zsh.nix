{
  config,
  hostname,
  lib,
  ...
}:
{
  # .zshenv
  programs.zsh = {
    enable = true;
    enableCompletion = true;
    autosuggestion.enable = true;
    syntaxHighlighting.enable = true;
    defaultKeymap = "viins";
    dotDir = config.home.homeDirectory;

    # oh-my-zsh runs compinit; point the dump at ~/.cache/zsh (D5).
    localVariables = {
      ZSH_COMPDUMP = "${config.xdg.cacheHome}/zsh/zcompdump-${hostname}";
    };

    history = {
      ignoreDups = true;
      ignoreAllDups = true;
      ignoreSpace = true;
      save = 1000000;
      size = 1000000;
    };

    shellAliases = {
      nixswitch = "sudo -H darwin-rebuild switch --flake ${config.home.homeDirectory}/.config/nix-darwin-config#${hostname}";
      nixup = "pushd ${config.home.homeDirectory}/.config/nix-darwin-config && nix flake update && nixswitch && sudo -H nix-env --profile /nix/var/nix/profiles/system --delete-generations +2 && popd";
      nixgc = "sudo -H nix-collect-garbage -d && nix-collect-garbage -d";
      python = "python3";
    };

    profileExtra = ''
      eval "$(/opt/homebrew/bin/brew shellenv)"
    '';

    initContent = lib.mkMerge [
      (lib.mkOrder 550 ''
        mkdir -p "${config.xdg.cacheHome}/zsh"
      '')
      ''
        export ERL_AFLAGS="-kernel shell_history enabled"

        # nix-daemon env (also sourced from /etc/zshrc on nix-darwin; kept here
        # so interactive shells that skip system rc still get NIX_* vars).
        if [ -e '/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh' ]; then
          . '/nix/var/nix/profiles/default/etc/profile.d/nix-daemon.sh'
        fi

        [ -f "${config.sops.templates."secret-env".path}" ] && source "${
          config.sops.templates."secret-env".path
        }"
      ''
    ];

    oh-my-zsh = {
      enable = true;
      plugins = [
        "golang"
        "git"
        "history"
        "history-substring-search"
      ];
    };
  };
}

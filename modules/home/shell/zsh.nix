{
  config,
  flakeDir,
  hostname,
  lib,
  pkgs,
  ...
}:
{
  # .zshenv
  programs.zsh = {
    enable = true;
    enableCompletion = true;
    autosuggestion = {
      enable = true;
      strategy = [
        "history"
        "completion"
      ];
    };
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

    # flakeDir comes from flake.nix (default: ~/…/.config/nix-darwin-config).
    shellAliases = {
      nixswitch = "sudo -H darwin-rebuild switch --flake ${flakeDir}#${hostname}";
      nixup = "pushd ${flakeDir} && nix flake update && nixswitch && sudo -H nix-env --profile /nix/var/nix/profiles/system --delete-generations +2 && popd";
      nix-rollback = "sudo -H darwin-rebuild --rollback";
      nixgc = "sudo -H nix-collect-garbage -d && nix-collect-garbage -d";
      python = "python3";
      oc = "sbx-opencode";
      oc-clone = "sbx-opencode --clone";
    };

    profileExtra = ''
      eval "$(/opt/homebrew/bin/brew shellenv)"
    '';

    # Add Homebrew's native Zsh completion locations
    envExtra = ''
      () {
        local completion_dir
        for completion_dir in \
          /opt/homebrew/share/zsh/site-functions \
          /opt/homebrew/share/zsh/vendor-completions \
          /usr/local/share/zsh/site-functions \
          /usr/local/share/zsh/vendor-completions; do
          [[ -d "$completion_dir" ]] && fpath+=("$completion_dir")
        done
      }
    '';

    initContent = lib.mkMerge [
      (lib.mkOrder 550 ''
        mkdir -p "${config.xdg.cacheHome}/zsh"
      '')
      (lib.mkOrder 1500 ''
        # `node` ships only a Bash completion. `mas` also ships Bash-only
        # completion, but it depends on Bash runtime helpers that bashcompinit
        # cannot provide, so its first-level commands are completed natively.
        autoload -Uz bashcompinit
        bashcompinit
        source ${pkgs.nodejs}/share/bash-completion/completions/node.bash

        _mas() {
          local -a commands
          commands=(
            'config:Show mas configuration and system information'
            'get:Download a free app'
            'purchase:Alias for get'
            'home:Open an app page in the default browser'
            'install:Install an app previously obtained from the App Store'
            'list:List installed App Store apps'
            'lookup:Show App Store app information'
            'info:Alias for lookup'
            'lucky:Install the first App Store search result'
            'open:Open an app page in the App Store'
            'outdated:List apps with pending updates'
            'reset:Reset App Store processes and cached downloads'
            'search:Search the App Store'
            'seller:Open an app seller page in the default browser'
            'vendor:Alias for seller'
            'signout:Sign out of the App Store'
            'uninstall:Uninstall an App Store app'
            'update:Update outdated apps'
            'upgrade:Alias for update'
            'version:Show the mas version'
            'help:Show help'
          )

          if (( CURRENT == 2 )); then
            _describe -t commands 'mas command' commands
          fi
        }
        compdef _mas mas
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

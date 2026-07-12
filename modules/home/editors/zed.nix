{
  config,
  pkgs,
  lib,
  ...
}:
# Zed is installed as a Homebrew cask (see modules/darwin/homebrew.nix). Only its
# config is managed here.
#
# Design: the repo holds the PERMANENT baseline, but
# ~/.config/zed must stay a set of normal, writable files so Zed can rewrite them
# and so settings can be tweaked on the fly while experimenting. So instead of
# symlinking read-only store files (home.file / xdg.configFile), every `nixswitch`
# COPIES the baseline into place, overwriting any ad-hoc experiments. Anything you
# want to keep goes into this repo.
#
# Exception: settings.json holds API keys. It is rendered by sops-nix templates
# (placeholders → secrets at activation) and symlinked into place — same pattern
# as ssh-config / exercism-user.json. Never written to the Nix store in plaintext.
let
  zedDir = "${config.home.homeDirectory}/.config/zed";

  # Non-secret files. @ZED_DIR@ is expanded now (build time); no secrets involved.
  subst = lib.replaceStrings [ "@ZED_DIR@" ] [ zedDir ];

  tasksFile = pkgs.writeText "zed-tasks.json" (subst (builtins.readFile ./zed/tasks.json));
  toggleFile = pkgs.writeTextFile {
    name = "zed-toggle-disable-ai.py";
    executable = true;
    text = subst (builtins.readFile ./zed/toggle_disable_ai.py);
  };
  keymapFile = ./zed/keymap.json;
in
{
  # Declared so sops.placeholder.* resolves and sops-install-secrets decrypts them.
  # ssh_box_user is already declared in tools/ssh.nix.
  sops.secrets = {
    zed_exa_api_key = { };
    zed_context7_api_key = { };
    zed_github_pat = { };
  };

  # Render settings.json with secrets substituted in-process by sops-nix
  sops.templates."zed-settings.json" = {
    path = "${zedDir}/settings.json";
    mode = "0644";
    content =
      lib.replaceStrings
        [
          "@ZED_EXA_API_KEY@"
          "@ZED_CONTEXT7_API_KEY@"
          "@ZED_GITHUB_PAT@"
          "@ZED_SSH_BOX_USER@"
        ]
        [
          config.sops.placeholder.zed_exa_api_key
          config.sops.placeholder.zed_context7_api_key
          config.sops.placeholder.zed_github_pat
          config.sops.placeholder.ssh_box_user
        ]
        (builtins.readFile ./zed/settings.json);
  };

  # Primary editor tooling. Shared language servers and formatters used by both
  # Zed and Helix live here
  home.packages = with pkgs; [
    # Python
    python3
    uv
    pyrefly
    ruff
    # Nix
    nixd
    nixfmt
    # Shell
    bash-language-server
    shfmt
    # Go
    go
    gopls
    delve
    # TypeScript / JavaScript
    nodejs
    prettier
    typescript-go
    # Markdown
    marksman
  ];

  home.activation.zedConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    zedDir="${zedDir}"
    ${pkgs.coreutils}/bin/mkdir -p "$zedDir"

    # Non-secret configs: overwrite the baseline, keep them writable.
    # settings.json is owned by sops.templates."zed-settings.json" (above).
    ${pkgs.coreutils}/bin/install -m 0644 ${keymapFile} "$zedDir/keymap.json"
    ${pkgs.coreutils}/bin/install -m 0644 ${tasksFile} "$zedDir/tasks.json"
    ${pkgs.coreutils}/bin/install -m 0755 ${toggleFile} "$zedDir/toggle_disable_ai.py"
  '';
}

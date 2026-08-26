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

  # arch-ops-server 3.4.0 permits MCP SDK 2.x, but uses an API removed there.
  # Run the verified compatible SDK release through an executable wrapper.
  archOpsServer = pkgs.writeShellScript "zed-arch-ops-server" ''
    exec ${pkgs.uv}/bin/uvx \
      --with "mcp==1.29.1" \
      "arch-ops-server==3.4.0"
  '';

  nixosMcpServer = pkgs.writeShellScript "zed-mcp-nixos-server" ''
    exec ${pkgs.uv}/bin/uvx "mcp-nixos==3.0.1"
  '';

  serenaMcpServer = pkgs.writeShellScript "zed-serena-mcp-server" ''
    exec ${pkgs.uv}/bin/uvx \
      --from "git+https://github.com/oraios/serena@7fcbca7e62555ec2287ddb2f083caee805848ea6" \
      serena start-mcp-server \
      --project-from-cwd \
      --enable-web-dashboard false \
      --open-web-dashboard false
  '';

  # An isolated, headless browser avoids persisting sessions or opening windows.
  playwrightMcpServer = pkgs.writeShellScript "zed-playwright-mcp-server" ''
    exec ${pkgs.nodejs}/bin/npx \
      --yes "@playwright/mcp@0.0.76" \
      --isolated \
      --headless
  '';

  # Non-secret files. Tokens are expanded now (build time); no secrets involved.
  subst =
    lib.replaceStrings
      [
        "@ZED_DIR@"
        "@ARCH_OPS_SERVER@"
        "@NIXOS_MCP_SERVER@"
        "@SERENA_MCP_SERVER@"
        "@PLAYWRIGHT_MCP_SERVER@"
      ]
      [
        zedDir
        (toString archOpsServer)
        (toString nixosMcpServer)
        (toString serenaMcpServer)
        (toString playwrightMcpServer)
      ];

  tasksFile = pkgs.writeText "zed-tasks.json" (subst (builtins.readFile ./zed/tasks.json));
  toggleFile = pkgs.writeTextFile {
    name = "zed-toggle-disable-ai.py";
    executable = true;
    text = subst (builtins.readFile ./zed/toggle_disable_ai.py);
  };
  keymapFile = ./zed/keymap.json;
in
{
  # Declared here because this editor template consumes these placeholders.
  # ssh_box_user is declared in tools/ssh.nix.
  sops.secrets = {
    zed_exa_api_key = { };
    zed_context7_api_key = { };
    zed_github_pat = { };
  };

  # Render settings.json with secrets substituted in-process by sops-nix
  sops.templates."zed-settings.json" = {
    path = "${zedDir}/settings.json";
    mode = "0600";
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
        (subst (builtins.readFile ./zed/settings.json));
  };

  # Primary editor tooling. Shared language servers and formatters used by both
  # Zed and Helix live here
  home.packages = with pkgs; [
    # Python
    python3
    uv
    pyrefly
    ruff
    python3Packages.pytest
    python3Packages.pytest-cov
    python3Packages.debugpy
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
    # Azure IaC
    dotnet-sdk_8
    bicep-lsp
    terraform
    terraform-ls
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

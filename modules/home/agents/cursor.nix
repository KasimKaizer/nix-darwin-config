{
  config,
  lib,
  pkgs,
  homeDirectory,
  mcpServers,
}:
let
  toMcpJson =
    _: server:
    if server.transport == "http" then
      {
        inherit (server) url headers;
      }
    else
      {
        inherit (server) command args;
      };

  # Cursor CLI has its own permission system. Auto-review evaluates commands
  # outside this routine allowlist and requests confirmation for risky work.
  # Arbitrary package scripts and git branch mutations go through auto-review.
  cliPreferences = pkgs.writeText "cursor-cli-preferences.json" (
    builtins.toJSON {
      editor.vimMode = false;
      display = {
        showLineNumbers = false;
        showThinkingBlocks = false;
        showStatusIndicators = true;
        showStatusLineRunningTime = false;
        mode = "zen";
      };
      notifications = false;
      hints = true;
      modelSlashCommands = true;
      steering = true;
      rewind = true;
      channel = "static";
      maxMode = false;
      exploreSubagentModel = "default";
      permissions = {
        allow = [
          "Read(**)"
          "Write(**)"
          "Mcp(*:*)"
          "Shell(ls)"
          "Shell(pwd)"
          "Shell(cat)"
          "Shell(head)"
          "Shell(tail)"
          "Shell(wc)"
          "Shell(rg)"
          "Shell(grep)"
          "Shell(git:status*)"
          "Shell(git:diff*)"
          "Shell(git:log*)"
          "Shell(git:branch)"
          "Shell(git:branch --show-current)"
          "Shell(git:branch --list*)"
          "Shell(git:show*)"
          "Shell(git:rev-parse*)"
          "Shell(git:ls-files*)"
          "Shell(nix:fmt*)"
          "Shell(nix:flake check*)"
          "Shell(nix:eval*)"
          "Shell(nix:build*)"
          "Shell(npm:test*)"
          "Shell(pnpm:test*)"
          "Shell(yarn:test*)"
          "Shell(bun:test*)"
          "Shell(pytest)"
          "Shell(ruff)"
          "Shell(mypy)"
          "Shell(cargo:build*)"
          "Shell(cargo:test*)"
          "Shell(cargo:check*)"
          "Shell(cargo:fmt*)"
          "Shell(cargo:clippy*)"
          "Shell(go:test*)"
          "Shell(go:build*)"
          "Shell(go:vet*)"
        ];
        deny = [
          "Read(**/.env*)"
          "Read(**/secrets/**)"
          "Read(**/.sops.yaml)"
          "Read(**/.ssh/**)"
          "Read(**/*.key)"
          "Read(**/*.pem)"
          "Write(**/.env*)"
          "Write(**/secrets/**)"
          "Write(**/.sops.yaml)"
          "Write(**/.ssh/**)"
          "Write(**/*.key)"
          "Write(**/*.pem)"
        ];
      };
      approvalMode = "auto-review";
      autoAcceptWebSearch = true;
      sandbox = {
        mode = "enabled";
        networkAccess = "allow_all";
      };
      network.useHttp1ForAgent = false;
      attribution = {
        attributeCommitsToAgent = false;
        attributePRsToAgent = false;
      };
    }
  );
in
{
  # Bare names keep the self-updating install in ~/.local/bin, which is newer
  # than nixpkgs' cursor-cli. MCP servers have no config-file approval setting.
  home.shellAliases = {
    agent = "agent --approve-mcps";
    cursor-agent = "cursor-agent --approve-mcps";
  };

  home.file = {
    ".cursor/agents/explorer.md".source = ./cursor/explorer.mdc;
    ".cursor/agents/implementer.md".source = ./cursor/implementer.mdc;
    ".cursor/agents/planner.md".source = ./cursor/planner.mdc;
    ".cursor/agents/researcher.md".source = ./cursor/researcher.mdc;
    ".cursor/agents/reviewer.md".source = ./cursor/reviewer.mdc;
    ".cursor/agents/verifier.md".source = ./cursor/verifier.mdc;

    # Local user rules apply across projects, including CLI/ACP sessions.
    # https://cursor.com/help/customization/rules
    ".cursor/rules/workflow.mdc".source = ./cursor/workflow.mdc;
  };

  # With XDG_CONFIG_HOME set, the CLI reads $XDG_CONFIG_HOME/cursor/cli-config.json
  # and rewrites it with login, model-picker, and cache state, so it must stay
  # writable. Each switch merges these preferences over it; Nix lists replace
  # session-approved ones.
  home.activation.cursorCliConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    configFile="${config.xdg.configHome}/cursor/cli-config.json"
    ${pkgs.coreutils}/bin/mkdir -p "$(${pkgs.coreutils}/bin/dirname "$configFile")"
    [ -s "$configFile" ] || echo '{}' > "$configFile"

    mergedFile="$(${pkgs.coreutils}/bin/mktemp "$configFile.XXXXXX")"
    if ${lib.getExe pkgs.jq} --slurpfile preferences ${cliPreferences} \
      '. * $preferences[0]' "$configFile" > "$mergedFile"; then
      ${pkgs.coreutils}/bin/mv "$mergedFile" "$configFile"
    else
      ${pkgs.coreutils}/bin/rm -f "$mergedFile"
      echo "cursor: $configFile is not valid JSON; preferences not applied" >&2
    fi
  '';

  sops.templates."cursor-mcp.json" = {
    path = "${homeDirectory}/.cursor/mcp.json";
    mode = "0600";
    content = builtins.toJSON {
      mcpServers = lib.mapAttrs toMcpJson mcpServers // {
        # Complements Playwright and supplies the browser-testing skill's tools.
        # Pinned npm release; first launch needs registry access and a local Chrome.
        "chrome-devtools" = {
          command = "${pkgs.nodejs}/bin/npx";
          args = [
            "--yes"
            "chrome-devtools-mcp@1.12.0"
            "--isolated"
            "--headless"
            "--no-usage-statistics"
            "--no-performance-crux"
          ];
        };
      };
    };
  };
}

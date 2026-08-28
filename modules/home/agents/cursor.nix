{
  lib,
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
in
{
  home.file = {
    ".cursor/agents/planner.md".source = ./cursor/planner.mdc;
    ".cursor/agents/researcher.md".source = ./cursor/researcher.mdc;
    ".cursor/agents/reviewer.md".source = ./cursor/reviewer.mdc;

    # Cursor CLI has its own permission system. Auto-review evaluates commands
    # outside this routine allowlist and requests confirmation for risky work.
    ".cursor/cli-config.json".text = builtins.toJSON {
      version = 1;
      editor.vimMode = false;
      display = {
        showLineNumbers = false;
        showThinkingBlocks = false;
        showStatusIndicators = false;
        showStatusLineRunningTime = false;
        mode = "zen";
      };
      notifications = true;
      hints = true;
      modelSlashCommands = true;
      rewind = true;
      hasChangedDefaultModel = false;
      exploreSubagentModel = "default";
      permissions = {
        allow = [
          "Read(**)"
          "Write(**)"
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
          "Shell(git:branch*)"
          "Shell(git:show*)"
          "Shell(git:rev-parse*)"
          "Shell(git:ls-files*)"
          "Shell(nix:fmt*)"
          "Shell(nix:flake check*)"
          "Shell(nix:eval*)"
          "Shell(nix:build*)"
          "Shell(npm:test*)"
          "Shell(npm:run*)"
          "Shell(pnpm:test*)"
          "Shell(pnpm:run*)"
          "Shell(yarn:test*)"
          "Shell(yarn:run*)"
          "Shell(bun:test*)"
          "Shell(bun:run*)"
          "Shell(pytest)"
          "Shell(ruff)"
          "Shell(mypy)"
          "Shell(uv:run*)"
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
      sandbox = {
        mode = "disabled";
        networkAccess = "user_config_with_defaults";
      };
      runEverythingSettingsPromptStreak = 0;
      network.useHttp1ForAgent = false;
      attribution = {
        attributeCommitsToAgent = true;
        attributePRsToAgent = true;
      };
    };
  };

  sops.templates."cursor-mcp.json" = {
    path = "${homeDirectory}/.cursor/mcp.json";
    mode = "0600";
    content = builtins.toJSON {
      mcpServers = lib.mapAttrs toMcpJson mcpServers;
    };
  };
}

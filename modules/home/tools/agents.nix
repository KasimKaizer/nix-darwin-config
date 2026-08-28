{
  config,
  lib,
  pkgs,
  flakeDir,
  ...
}:
let
  homeDirectory = config.home.homeDirectory;

  remote = url: token: {
    transport = "http";
    inherit url;
    headers = {
      Authorization = "Bearer ${token}";
    };
  };

  stdio = command: args: {
    transport = "stdio";
    inherit command args;
  };

  serenaMcpServer = pkgs.writeShellScript "serena-mcp-server" ''
    exec ${pkgs.uv}/bin/uvx \
      --from "git+https://github.com/oraios/serena@7fcbca7e62555ec2287ddb2f083caee805848ea6" \
      serena start-mcp-server \
      --project-from-cwd \
      --enable-web-dashboard false \
      --open-web-dashboard false
  '';

  # An isolated, headless browser avoids persisting sessions or opening windows.
  playwrightMcpServer = pkgs.writeShellScript "playwright-mcp-server" ''
    exec ${pkgs.nodejs}/bin/npx \
      --yes "@playwright/mcp@0.0.76" \
      --isolated \
      --headless
  '';

  # Canonical definition for MCP servers shared by the agent clients.
  # Client-specific functions below only adapt their transport schema.
  mcpServers = {
    exa = remote "https://mcp.exa.ai/mcp" config.sops.placeholder.zed_exa_api_key;
    context7 = remote "https://mcp.context7.com/mcp" config.sops.placeholder.zed_context7_api_key;
    github = remote "https://api.githubcopilot.com/mcp/" config.sops.placeholder.zed_github_pat;
    "sequential-thinking" = stdio "npx" [
      "-y"
      "@modelcontextprotocol/server-sequential-thinking"
    ];
    # mcp-nixos includes nix-darwin and Home Manager option sources.
    nix = stdio "${pkgs.mcp-nixos}/bin/mcp-nixos" [ ];
    serena = stdio (toString serenaMcpServer) [ ];
    playwright = stdio (toString playwrightMcpServer) [ ];
  };

  toAntigravity =
    _: server:
    if server.transport == "http" then
      {
        serverUrl = server.url;
        inherit (server) headers;
      }
    else
      {
        inherit (server) command args;
      };

  toCopilot =
    _: server:
    if server.transport == "http" then
      {
        type = "http";
        inherit (server) url headers;
        tools = [ "*" ];
      }
    else
      {
        type = "local";
        inherit (server) command args;
        env = { };
        tools = [ "*" ];
      };

  toCodexMcp =
    name: server:
    if server.transport == "http" then
      ''
        [mcp_servers.${name}]
        url = "${server.url}"
        http_headers = { Authorization = "${server.headers.Authorization}" }
      ''
    else
      ''
        [mcp_servers.${name}]
        command = "${server.command}"
        args = [ ${lib.concatMapStringsSep ", " (arg: "\"${arg}\"") server.args} ]
      '';

  codexMcpServers = lib.concatStringsSep "\n" (lib.mapAttrsToList toCodexMcp mcpServers);
  cursorConfig = import ./agents/cursor.nix {
    inherit lib homeDirectory mcpServers;
  };
  opencode = import ./agents/opencode.nix {
    inherit
      config
      homeDirectory
      lib
      mcpServers
      ;
  };
in
{
  imports = [ cursorConfig ];

  # sops-nix renders templates after this activation entry. Ensure target
  # directories exist even for clients that have not been launched yet.
  home.activation.mcpConfigDirectories = lib.hm.dag.entryBefore [ "sops-nix" ] ''
    $DRY_RUN_CMD ${pkgs.coreutils}/bin/mkdir -p \
      "${homeDirectory}/.config/opencode" \
      "${homeDirectory}/.cursor/agents" \
      "${homeDirectory}/.cursor/rules" \
      "${homeDirectory}/.codex" \
      "${homeDirectory}/.gemini/config" \
      "${homeDirectory}/.copilot"
  '';

  sops.templates = opencode.templates // {
    "codex-config.toml" = {
      path = "${homeDirectory}/.codex/config.toml";
      mode = "0600";
      content = ''
        plan_mode_reasoning_effort = "xhigh"
        model = "gpt-5.6-terra"
        model_reasoning_effort = "xhigh"
        approvals_reviewer = "auto_review"

        [projects."${flakeDir}"]
        trust_level = "trusted"

        ${codexMcpServers}
      '';
    };

    "antigravity-mcp.json" = {
      path = "${homeDirectory}/.gemini/config/mcp_config.json";
      mode = "0600";
      content = builtins.toJSON {
        mcpServers = lib.mapAttrs toAntigravity mcpServers;
      };
    };

    "copilot-mcp-config.json" = {
      path = "${homeDirectory}/.copilot/mcp-config.json";
      mode = "0600";
      content = builtins.toJSON {
        mcpServers = lib.mapAttrs toCopilot mcpServers;
      };
    };
  };
}

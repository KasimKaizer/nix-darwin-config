{
  lib,
  pkgs,
  homeDirectory,
  flakeDir,
  mcpServers,
}:
let
  rexSessionStart = pkgs.writeShellScript "rex-codex-session-start" /* bash */ ''
    if [[ -n "''${REX_BLOCK:-}" && -n "''${REX_BIN_DIR:-}" ]]; then
      exec "$REX_BIN_DIR/rex" --autostart=false __internal session-start \
        --agent codex --feature-session-naming=true
    fi
  '';

  toCodexMcp =
    _: server:
    if server.transport == "http" then
      {
        inherit (server) url;
      }
      // lib.optionalAttrs (server.headers != { }) {
        http_headers = server.headers;
      }
    else
      {
        inherit (server) command args;
      };
in
{
  home.file = {
    ".codex/agents/planner.toml".source = ./codex/planner.toml;
    ".codex/agents/researcher.toml".source = ./codex/researcher.toml;
    ".codex/agents/reviewer.toml".source = ./codex/reviewer.toml;

    # Same SessionStart integration Rex installs, kept in the source config.
    # Codex requires one-time trust for this hook through /hooks.
    ".codex/hooks.json".text = builtins.toJSON {
      hooks.SessionStart = lib.lists.singleton {
        hooks = lib.lists.singleton {
          type = "command";
          command = "${rexSessionStart}";
          timeout = 5;
        };
      };
    };
  };

  sops.templates."codex-config.toml" = {
    path = "${homeDirectory}/.codex/config.toml";
    mode = "0600";
    file = (pkgs.formats.toml { }).generate "codex-config.toml" {
      model = "gpt-6.1-sol";
      model_reasoning_effort = "high";
      plan_mode_reasoning_effort = "high";
      sandbox_mode = "workspace-write";
      approval_policy = "on-request";
      # Deliberately review escalation automatically, rather than prompting for each one.
      approvals_reviewer = "auto_review";

      developer_instructions = builtins.readFile ./codex/root.md;

      agents.max_concurrent_threads_per_session = 3;

      sandbox_workspace_write.network_access = false;

      desktop = {
        followUpQueueMode = "steer";
        conversationDetailMode = "STEPS_PROSE";
        sansFontSize = 14;
        codeFontSize = 13;
        ambient-suggestions-enabled = false;
      };

      tui = {
        notifications = [
          "approval-requested"
          "agent-turn-complete"
        ];
        notification_condition = "unfocused";
        notification_method = "osc9";
        status_line = [
          "model-with-reasoning"
          "current-dir"
          "git-branch"
          "context-remaining"
          "five-hour-limit"
          "weekly-limit"
        ];
      };

      # Desktop/runtime setup supplies these local plugin sources.
      marketplaces = {
        openai-bundled = {
          source_type = "local";
          source = "${homeDirectory}/.codex/.tmp/bundled-marketplaces/openai-bundled";
        };
        openai-primary-runtime = {
          source_type = "local";
          source = "${homeDirectory}/.cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime";
        };
      };

      plugins = {
        "codex-app-tools@openai-bundled".enabled = true;
        "browser@openai-bundled".enabled = true;
        "unified-computer-use@openai-bundled".enabled = true;
        "code-review@openai-bundled".enabled = true;
        "visualize@openai-bundled".enabled = true;
        "computer-use@openai-bundled".enabled = true;
        "documents@openai-primary-runtime".enabled = true;
        "pdf@openai-primary-runtime".enabled = true;
        "spreadsheets@openai-primary-runtime".enabled = true;
        "presentations@openai-primary-runtime".enabled = true;
        "template-creator@openai-primary-runtime".enabled = true;
      };

      projects.${flakeDir}.trust_level = "trusted";

      mcp_servers = lib.mapAttrs toCodexMcp mcpServers;
    };
  };
}

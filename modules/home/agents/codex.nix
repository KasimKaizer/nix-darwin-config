{
  lib,
  pkgs,
  homeDirectory,
  flakeDir,
}:
{
  home.shellAliases = {
    co = "${lib.getExe pkgs.codex} --profile lean";
    cor = "${lib.getExe pkgs.codex} --profile lean resume";
  };

  # Codex saves TUI preferences and project trust into the selected profile.
  sops.templates."codex-lean-config.toml" = {
    path = "${homeDirectory}/.codex/lean.config.toml";
    mode = "0600";
    file = (pkgs.formats.toml { }).generate "codex-lean-config.toml" {
      features = {
        apps = false;
        image_generation = false;
        plugins = false;
      };

      skills = {
        include_instructions = true;
        config =
          map
            (name: {
              inherit name;
              enabled = false;
            })
            [
              "imagegen"
              "skill-creator"
              "skill-installer"
            ];
      };

      projects."${homeDirectory}/Developer/projects/ai-coding-crash-course".trust_level = "trusted";
    };
  };

  sops.templates."codex-config.toml" = {
    path = "${homeDirectory}/.codex/config.toml";
    mode = "0600";
    file = (pkgs.formats.toml { }).generate "codex-config.toml" {
      model = "gpt-6.2-sol";
      model_reasoning_effort = "medium";
      plan_mode_reasoning_effort = "high";
      sandbox_mode = "workspace-write";
      approval_policy = "on-request";
      # Deliberately review escalation automatically, rather than prompting for each one.
      approvals_reviewer = "auto_review";

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
          "context-used"
          "five-hour-limit"
          "weekly-limit"
          "branch-changes"
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
    };
  };
}

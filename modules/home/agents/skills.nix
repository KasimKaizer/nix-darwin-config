{
  lib,
  inputs,
  ...
}:
# Agent Skills land in each configured agent directory on nixswitch via
# github:Kyure-A/agent-skills-nix.
#
# Custom (this flake): skills/<name>/SKILL.md — auto-installed (enableAll local).
# Third-party: pin the repo in flake.nix (`flake = false`), add a `sources`
# entry, then add the directory name to that source's `enable` list. Local
# overlays replace the intentionally excluded upstream `using-agent-skills`
# and `skill-creator` skills.
#
# To add a new upstream repo: flake input + `sources` + discover/enable names.
let
  addy = {
    enable = [
      "spec-driven-development"
      "planning-and-task-breakdown"
      "incremental-implementation"
      "test-driven-development"
      "source-driven-development"
      "doubt-driven-development"
      "api-and-interface-design"
      "debugging-and-error-recovery"
      "code-review-and-quality"
      "security-and-hardening"
      "git-workflow-and-versioning"
      "ci-cd-and-automation"
      "deprecation-and-migration"
      "documentation-and-adrs"
      "observability-and-instrumentation"
      "frontend-ui-engineering"
      "browser-testing-with-devtools"
      "performance-optimization"
      # "idea-refine"
      # "interview-me"
      # "code-simplification"
      # "context-engineering"
      # "shipping-and-launch"
    ];
  };

  anthropic = {
    enable = [
      "pdf"
      "docx"
      "pptx"
      "xlsx"
    ];
  };

  discoverRegex = names: "^(${lib.concatStringsSep "|" names})$";

  skillTarget = dest: {
    enable = true;
    inherit dest;
    structure = "link";
  };
in
{
  imports = [ inputs.agent-skills-nix.homeManagerModules.default ];

  programs.agent-skills = {
    enable = true;

    sources = {
      local = {
        path = ./skills;
        filter.maxDepth = 1;
      };

      addy = {
        # github:addyosmani/agent-skills
        path = inputs.agent-skills;
        subdir = "skills";
        filter.maxDepth = 1;
        filter.nameRegex = discoverRegex addy.enable;
      };

      anthropic = {
        # github:anthropics/skills
        path = inputs.anthropic-skills;
        subdir = "skills";
        filter.maxDepth = 1;
        filter.nameRegex = discoverRegex anthropic.enable;
      };

      superpowers = {
        # github:obra/superpowers
        path = inputs.superpowers;
        subdir = "skills";
        filter.maxDepth = 1;
        filter.nameRegex = "^verification-before-completion$";
      };

      ast-grep = {
        # github:code-yeongyu/ast-grep-skill
        path = inputs.ast-grep-skill;
        filter.maxDepth = 1;
      };

      omo = {
        # github:code-yeongyu/oh-my-openagent
        path = inputs.oh-my-openagent;
        subdir = "packages/shared-skills/skills";
        filter.maxDepth = 1;
        filter.nameRegex = "^programming$";
      };
    };

    skills = {
      enableAll = [ "local" ];
      enable =
        addy.enable
        ++ anthropic.enable
        ++ [
          "verification-before-completion"
          "ast-grep"
          "programming"
        ];
    };

    # `link` is home.file (HM-native); destinations must be static relative to $HOME.
    targets = {
      agents = skillTarget ".agents/skills";
      cursor = skillTarget ".cursor/skills";
      codex = skillTarget ".codex/skills";
      opencode = skillTarget ".config/opencode/skills";
      antigravity = skillTarget ".gemini/antigravity-cli/skills";
      copilot = skillTarget ".copilot/skills";
    };
  };
}

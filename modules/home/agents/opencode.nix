{
  config,
  homeDirectory,
  inputs,
  lib,
  mcpServers,
  pkgs,
}:
let
  toOpenCode =
    _: server:
    if server.transport == "http" then
      {
        type = "remote";
        inherit (server) url headers;
        enabled = true;
        oauth = false;
      }
    else
      {
        type = "local";
        command = [ server.command ] ++ server.args;
        enabled = true;
      };

  mcpToolAccess = action: names: lib.genAttrs (map (name: "${name}_*") names) (_: action);
  allMcpToolsDisabled = mcpToolAccess false (builtins.attrNames mcpServers);
  allMcpToolsEnabled = mcpToolAccess true (builtins.attrNames mcpServers);
  serenaReadTools = {
    "serena_*" = false;
    "serena_find_*" = true;
    "serena_get_*" = true;
    "serena_list_*" = true;
    "serena_read_file" = true;
    "serena_search_for_pattern" = true;
  };
  minimalDeny = {
    "rm -rf /" = "deny";
    "rm -rf /*" = "deny";
  };
  workerTask = {
    "*" = "deny";
    explorer = "allow";
    researcher = "allow";
  };
  inherit (import ./hooks.nix { inherit inputs pkgs; }) omoHooks omoDisabledHooks;
in
rec {
  inherit
    allMcpToolsDisabled
    allMcpToolsEnabled
    mcpToolAccess
    minimalDeny
    serenaReadTools
    toOpenCode
    workerTask
    ;
  agent = {
    build.disable = true;
    plan.disable = true;
    general.disable = true;
    explore.disable = true;
    scout.disable = true;
    builder = {
      description = "Primary orchestrator and lead builder for implementing code, fixing bugs, delegating to specialists, and verifying changes.";
      mode = "primary";
      # model = "cursor/grok-4.6";
      # model = "google/antigravity-gemini-3.8-flash";
      model = "opencode/muse-spark-1.3-contributor-free";
      prompt = builtins.readFile ./opencode/alt/builder-gemini.md;
      tools = allMcpToolsEnabled;
      permission = {
        bash = {
          "*" = "allow";
        }
        // minimalDeny;
        task = {
          "*" = "deny";
          planner = "allow";
          reviewer = "allow";
          advisor = "allow";
          researcher = "allow";
          explorer = "allow";
          "worker-deep" = "allow";
          "worker-visual" = "allow";
          "worker-ultra" = "allow";
          "worker-quick" = "allow";
        };
        "playwright_*" = "ask";
      };
    };
    planner = {
      description = "Explores requirements, performs gap analysis, and writes durable decision-complete work plans under docs/plans/ without modifying product code. MUST BE USED for any multi-step, ambiguous, or architecture-scale task before implementation. Grounds in codebase, asks only genuine owner-decisions, researchs to best practice when fuzzy, waits for explicit approval, then writes one plan workers execute with zero interview.";
      mode = "all";
      # model = "cursor/grok-4.6";
      # model = "google/antigravity-gemini-3.8-flash";
      model = "opencode/muse-spark-1.3-contributor-free";
      prompt = builtins.readFile ./opencode/planner.md;
      tools =
        (mcpToolAccess true [
          "codegraph"
          "context7"
          "exa"
          "grep_app"
          "nix"
          "sequential-thinking"
        ])
        // serenaReadTools;
      permission = {
        edit = {
          "*" = "deny";
          "docs/plans" = "allow";
          "docs/plans/**" = "allow";
        };
        bash = {
          "*" = "allow";
        }
        // minimalDeny;
        task = {
          "*" = "deny";
          advisor = "allow";
          explorer = "allow";
          researcher = "allow";
          reviewer = "allow";
        };
        todowrite = "deny";
        webfetch = "allow";
        websearch = "allow";
      };
    };
    advisor = {
      description = "Strategic technical advisor for architecture tradeoffs, security audits, and hard debugging. MUST BE USED for complex architecture design, after significant work, after 2+ failed fixes, or for unfamiliar patterns. Provides pragmatic minimalism, one clear path, and effort estimates (Quick/Short/Medium/Large). Read-only consultant.";
      mode = "all";
      # model = "cursor/claude-opus-5";
      # model = "google/antigravity-gemini-3.8-flash";
      model = "opencode/muse-spark-1.3-contributor-free";
      prompt = builtins.readFile ./opencode/advisor-claude.md;
      tools =
        (mcpToolAccess true [
          "codegraph"
          "context7"
          "exa"
          "grep_app"
          "nix"
          "sequential-thinking"
        ])
        // serenaReadTools;
      permission = {
        edit = "deny";
        bash = {
          "*" = "allow";
        }
        // minimalDeny;
        task = "deny";
        todowrite = "deny";
        webfetch = "allow";
        websearch = "allow";
      };
    };
    explorer = {
      description = ''Contextual grep for codebases. Answers "Where is X?", "Which file has Y?", "Find the code that does Z". Fire multiple in parallel for broad searches.'';
      mode = "all";
      # model = "google/antigravity-gemini-3.8-flash";
      model = "opencode/muse-spark-1.3-contributor-free";
      prompt = builtins.readFile ./opencode/explorer.md;
      tools =
        (mcpToolAccess true [
          "codegraph"
          "sequential-thinking"
        ])
        // serenaReadTools;
      permission = {
        edit = "deny";
        bash = {
          "*" = "allow";
        }
        // minimalDeny;
        task = "deny";
        todowrite = "deny";
        webfetch = "deny";
        websearch = "deny";
      };
    };
    reviewer = {
      description = "Adversarial plan reviewer for executable work plans. MUST BE USED for high-accuracy review of docs/plans/*.md. Verifies references exist, tasks have executable QA scenarios, and no blocking contradictions. Returns OKAY or REJECT with max 3 blockers. Read-only, blocker-finder not perfectionist.";
      mode = "all";
      # model = "openai/gpt-5.6-terra";
      # model = "google/antigravity-gemini-3.8-flash";
      model = "opencode/muse-spark-1.3-contributor-free";
      prompt = builtins.readFile ./opencode/reviewer-gpt.md;
      tools =
        (mcpToolAccess true [
          "codegraph"
          "context7"
          "exa"
          "grep_app"
          "nix"
          "sequential-thinking"
          "playwright"
        ])
        // serenaReadTools;
      permission = {
        edit = "deny";
        bash = {
          "*" = "allow";
        }
        // minimalDeny;
        task = "deny";
        todowrite = "deny";
        webfetch = "allow";
        websearch = "allow";
        "playwright_*" = "ask";
      };
    };
    researcher = {
      description = "Specialized codebase understanding agent for multi-repository analysis, searching remote codebases, retrieving official documentation, and finding implementation examples using GitHub CLI, Context7, and Web Search. MUST BE USED when users ask to look up code in remote repositories, explain library internals, or find usage examples in open source.";
      mode = "all";
      # model = "google/antigravity-gemini-3.8-flash";
      model = "opencode/muse-spark-1.3-contributor-free";
      prompt = builtins.readFile ./opencode/researcher.md;
      tools = mcpToolAccess true [
        "context7"
        "exa"
        "grep_app"
        "nix"
        "sequential-thinking"
      ];
      permission = {
        edit = "deny";
        bash = {
          "*" = "allow";
        }
        // minimalDeny;
        task = "deny";
        todowrite = "deny";
        webfetch = "allow";
        websearch = "allow";
      };
    };
    worker-deep = {
      description = "Autonomous deep task executor for multi-file features, cross-module reasoning, and deep debugging. MUST BE USED for complex features spanning multiple files, architectural changes, and tasks requiring extensive codebase understanding.";
      mode = "all";
      # model = "cursor/grok-4.6";
      # model = "google/antigravity-gemini-3.8-flash";
      model = "opencode/muse-spark-1.3-contributor-free";
      prompt = builtins.readFile ./opencode/alt/worker-deep-gemini.md;
      tools = allMcpToolsEnabled;
      permission = {
        bash = {
          "*" = "allow";
        }
        // minimalDeny;
        task = workerTask;
        "playwright_*" = "ask";
      };
    };
    worker-visual = {
      description = "Visual engineering specialist for UI/UX, CSS, styling, layouts, animations, and frontend components. MUST BE USED for any task involving interfaces, design systems, responsive layouts, browser rendering, or Playwright visual QA.";
      mode = "all";
      # model = "google/antigravity-gemini-3.8-flash";
      model = "opencode/muse-spark-1.3-contributor-free";
      prompt = builtins.readFile ./opencode/worker-visual-gemini.md;
      tools = allMcpToolsEnabled;
      permission = {
        bash = {
          "*" = "allow";
        }
        // minimalDeny;
        task = workerTask;
        "playwright_*" = "ask";
      };
    };
    worker-ultra = {
      description = "Deep reasoning specialist for complex algorithms, intricate state machines, concurrency, and high-stakes logic. MUST BE USED for the single hardest cohesive problem in a plan requiring heavy reasoning and architectural insight. Preserves shared insight by not splitting.";
      mode = "all";
      # model = "cursor/claude-opus-5";
      # model = "google/antigravity-gemini-3.8-flash";
      model = "opencode/muse-spark-1.3-contributor-free";
      prompt = builtins.readFile ./opencode/alt/worker-ultra-gemini.md;
      tools = allMcpToolsEnabled;
      permission = {
        bash = {
          "*" = "allow";
        }
        // minimalDeny;
        task = workerTask;
        "playwright_*" = "ask";
      };
    };
    worker-quick = {
      description = "Fast mechanical worker for single-file edits, typos, trivial configs, and minor chores. MUST BE USED for quick, isolated mechanical changes, formatting, and git ops. Prefers many small parallel tasks.";
      mode = "all";
      # model = "google/antigravity-gemini-3.8-flash";
      model = "opencode/muse-spark-1.3-contributor-free";
      prompt = builtins.readFile ./opencode/worker-quick-gemini.md;
      tools = allMcpToolsEnabled;
      permission = {
        bash = {
          "*" = "allow";
        }
        // minimalDeny;
        task = workerTask;
        "playwright_*" = "ask";
      };
    };
  };
  templates = {
    "opencode-mcp.jsonc" = {
      path = "${homeDirectory}/.config/opencode/opencode.jsonc";
      mode = "0600";
      content = builtins.toJSON {
        "$schema" = "https://opencode.ai/config.json";
        default_agent = "builder";
        lsp = true;
        subagent_depth = 2;
        plugin = [
          "cursor-opencode-provider"
          "@cortexkit/opencode-antigravity-auth@2.1.0"
          "opencode-sandbox"
          "${omoHooks}/packages/omo-opencode"
        ];
        provider = {
          cursor = {
            npm = "cursor-opencode-provider";
            name = "Cursor";
            models = { };
          };
          openrouter.options.apiKey = config.sops.placeholder.openrouter_api_key;
        };
        mcp = lib.mapAttrs toOpenCode mcpServers;
        tools = allMcpToolsDisabled;
        inherit agent;
      };
    };
    "opencode-tui.json" = {
      path = "${homeDirectory}/.config/opencode/tui.json";
      mode = "0600";
      content = builtins.toJSON { plugin = [ "@cortexkit/opencode-antigravity-auth" ]; };
    };
  };
  # Plain (non-secret) opencode files, merged into home.file by agents.nix.
  files = {
    # Read by the OMO opencode plugin on startup (no OMO CLI needed).
    # Selects which of its 56 hooks run; list lives in hooks.nix.
    ".omo/omo.jsonc" = {
      text = builtins.toJSON {
        "$schema" =
          "https://raw.githubusercontent.com/code-yeongyu/oh-my-openagent/dev/assets/omo.schema.json";
        disabled_hooks = omoDisabledHooks;
      };
    };
    # Sandbox config (outside the repo). Empty allowlist = all bash traffic blocked.
    # MCP/model calls bypass the sandbox; allowUnixSockets keeps nix working.
    ".config/opencode-sandbox/config.json" = {
      text = builtins.toJSON {
        network = {
          allowedDomains = [ ];
        };
        allowUnixSockets = [ "/nix/var/nix/daemon-socket/socket" ];
      };
    };
  };
}

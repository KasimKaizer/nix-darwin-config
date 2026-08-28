{
  config,
  homeDirectory,
  lib,
  mcpServers,
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
  githubReadTools = {
    "github_*" = false;
    "github_get_*" = true;
    "github_issue_read" = true;
    "github_list_*" = true;
    "github_pull_request_read" = true;
    "github_search_*" = true;
  };
  serenaReadTools = {
    "serena_*" = false;
    "serena_find_*" = true;
    "serena_get_*" = true;
    "serena_list_*" = true;
    "serena_read_file" = true;
    "serena_search_for_pattern" = true;
  };
  ask = names: lib.genAttrs names (_: "ask");
  builderBash = {
    "*" = "allow";
  }
  // ask [
    "sudo*"
    "doas*"
    "darwin-rebuild switch*"
    "defaults write*"
    "diskutil*"
    "launchctl*"
    "osascript*"
    "rm*"
    "rmdir*"
    "unlink*"
    "shred*"
    "dd*"
    "chmod*"
    "chown*"
    "kill*"
    "pkill*"
    "git commit*"
    "git push*"
    "git pull*"
    "git checkout*"
    "git switch*"
    "git restore*"
    "git reset*"
    "git clean*"
    "git rebase*"
    "git merge*"
    "git tag*"
    "nix flake update*"
    "nix profile*"
    "nix-env*"
    "nixswitch*"
    "nixup*"
    "nixgc*"
    "nix-rollback*"
    "brew install*"
    "brew tap*"
    "mas install*"
    "npm install*"
    "npm uninstall*"
    "npm update*"
    "pnpm add*"
    "pnpm remove*"
    "pnpm update*"
    "yarn add*"
    "yarn remove*"
    "yarn upgrade*"
    "bun add*"
    "bun remove*"
    "pip install*"
    "pip uninstall*"
    "uv add*"
    "uv remove*"
    "cargo install*"
    "go install*"
    "curl*"
    "wget*"
    "scp*"
    "rsync*"
    "ssh*"
    "gh*"
  ]
  // {
    "rm -rf /" = "deny";
    "rm -rf /*" = "deny";
  };
  readOnlyBash = {
    "*" = "deny";
  }
  // lib.genAttrs [ "git diff*" "git status*" "git log*" "rg*" ] (_: "allow");
  plannerBash =
    readOnlyBash
    // lib.genAttrs [
      "pwd"
      "ls*"
      "cat*"
      "head*"
      "tail*"
      "wc*"
      "git show*"
      "git branch"
      "git branch -a"
      "git branch -r"
      "git branch -v*"
      "git branch --all"
      "git branch --list*"
      "git branch --show-current"
      "git branch --verbose*"
      "git rev-parse*"
      "git ls-files*"
      "git blame*"
      "nix eval*"
      "nix flake metadata*"
    ] (_: "allow");
  reviewerBash =
    plannerBash
    // lib.genAttrs [
      "nix flake check --no-build*"
      "nix eval*"
      "npm test*"
      "npm run test*"
      "pnpm test*"
      "pnpm run test*"
      "yarn test*"
      "yarn run test*"
      "bun test*"
      "bun run test*"
      "pytest*"
      "ruff check*"
      "mypy*"
      "uv run pytest*"
      "uv run ruff check*"
      "uv run mypy*"
      "cargo test*"
      "cargo check*"
      "cargo clippy*"
      "go test*"
      "go vet*"
    ] (_: "allow");
in
rec {
  inherit
    allMcpToolsDisabled
    allMcpToolsEnabled
    builderBash
    githubReadTools
    mcpToolAccess
    plannerBash
    reviewerBash
    serenaReadTools
    toOpenCode
    ;
  agent = {
    build.disable = true;
    plan.disable = true;
    general.disable = true;
    explore.disable = true;
    scout.disable = true;
    builder = {
      description = "Primary builder for implementing code, fixing bugs, and verifying changes";
      mode = "primary";
      model = "cursor/grok-4.6";
      prompt = builtins.readFile ./opencode/builder.md;
      tools = allMcpToolsEnabled;
      permission = {
        bash = builderBash;
        task = {
          "*" = "deny";
          planner = "allow";
          reviewer = "allow";
          researcher = "allow";
          nix-maintainer = "allow";
        };
        "github_*" = "ask";
        "github_get_*" = "allow";
        "github_issue_read" = "allow";
        "github_list_*" = "allow";
        "github_pull_request_read" = "allow";
        "github_search_*" = "allow";
        "playwright_*" = "ask";
      };
    };
    planner = {
      description = "Explores requirements and writes durable implementation handoffs under docs/agent-handoffs without modifying product code";
      mode = "all";
      model = "cursor/claude-opus-5";
      prompt = builtins.readFile ./opencode/planner.md;
      tools =
        (mcpToolAccess true [
          "context7"
          "exa"
          "nix"
          "sequential-thinking"
        ])
        // githubReadTools;
      permission = {
        edit = {
          "*" = "deny";
          "docs/agent-handoffs/**" = "allow";
        };
        bash = plannerBash;
        task = {
          "*" = "deny";
          researcher = "allow";
          reviewer = "allow";
        };
        todowrite = "deny";
        webfetch = "allow";
        websearch = "allow";
      };
    };
    reviewer = {
      description = "Performs adversarial, read-only code and diff reviews";
      mode = "all";
      model = "cursor/grok-4.6";
      prompt = builtins.readFile ./opencode/reviewer.md;
      tools =
        (mcpToolAccess true [
          "context7"
          "sequential-thinking"
          "playwright"
        ])
        // serenaReadTools;
      permission = {
        edit = "deny";
        bash = reviewerBash;
        task = "deny";
        todowrite = "deny";
        webfetch = "allow";
        websearch = "allow";
        "playwright_*" = "ask";
      };
    };
    researcher = {
      description = "Searches official documentation and upstream examples without mutating files";
      mode = "all";
      model = "google/antigravity-gemini-3.7-flash";
      prompt = builtins.readFile ./opencode/researcher.md;
      tools =
        (mcpToolAccess true [
          "context7"
          "exa"
          "nix"
        ])
        // githubReadTools;
      permission = {
        edit = "deny";
        bash = "deny";
        task = "deny";
        todowrite = "deny";
        webfetch = "allow";
        websearch = "allow";
      };
    };
    nix-maintainer = {
      description = "Specialist maintainer for this multi-host nix-darwin + Home Manager flake";
      mode = "all";
      model = "google/antigravity-gemini-3.7-flash";
      prompt = builtins.readFile ./opencode/nix-maintainer.md;
      tools =
        (mcpToolAccess true [
          "context7"
          "exa"
          "nix"
        ])
        // serenaReadTools;
      permission = {
        bash = builderBash;
        task = "deny";
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
}

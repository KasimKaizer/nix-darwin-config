{
  pkgs,
  config,
  hostname,
  ...
}:
let
  flake = "${config.home.homeDirectory}/.config/nix-darwin-config";
  flakeExpr = "(builtins.getFlake \"${flake}\")";
  darwinOpts = "${flakeExpr}.darwinConfigurations.${hostname}.options";
in
{
  # Helix-only tooling. Language servers shared with Zed (gopls, nixd, ruff, …)
  # live in zed.nix; this module only adds what Helix needs on top.
  home.packages = with pkgs; [
    typescript-go
    vscode-langservers-extracted
    nodejs
    prettier
    marksman
    taplo
    dockerfile-language-server
    dockerfmt
  ];

  programs.helix = {
    enable = true;
    package = pkgs.helix;
    settings = {
      editor = {
        gutters = [
          "diff"
          "line-numbers"
          "spacer"
          "diagnostics"
        ];
        cursorline = true;
        cursor-shape.insert = "bar";
        color-modes = true;
        true-color = true;
        lsp.display-messages = true;
        soft-wrap = {
          enable = true;
          wrap-indicator = "↪";
        };
        completion-trigger-len = 0;
        completion-replace = true;
        lsp.display-inlay-hints = true;
        file-picker = {
          hidden = false;
          git-ignore = true;
          git-global = false;
          max-depth = 4;
        };
        statusline = {
          mode = {
            normal = "NORMAL";
            select = "SELECT";
            insert = "INSERT";
          };
          left = [
            "mode"
            "file-name"
          ];
          center = [ ];
          right = [
            "diagnostics"
            "selections"
            "position"
            "file-encoding"
            "file-line-ending"
            "file-type"
            "version-control"
            "spacer"
          ];
        };
      };
      theme = "jetbrains_dark";
      keys = rec {
        normal.esc = [
          "collapse_selection"
          "normal_mode"
        ];
        insert.esc = normal.esc;
        select.esc = normal.esc;

        insert = {
          C-n = "completion";
        };

        normal = {
          X = "extend_line_above";
          V = [
            "extend_line_below"
            "select_mode"
          ];
          G = "goto_file_end";
          p = "paste_before";
          P = "paste_after";
          g.q = ":reflow";
          d = "delete_selection_noyank";
          c = "change_selection_noyank";
          space = {
            w = ":write";
            q = ":quit";
            p = ":clipboard-paste-before";
            P = ":clipboard-paste-after";
            l.f = ":format";
            l.r = ":lsp-restart";
            l.g = ":sh gh browse";
            l.m = ":sh zellij run -fc --height 100% --width 100% -x 0 -y 0 -- glow -p *.md";
            l.y = [
              ":new"
              ":insert-output lazygit"
              ":buffer-close!"
              ":redraw"
            ];
          };
        };
      };
    };

    languages = {
      language-server = {
        nixd = {
          command = "nixd";
          config.nixd = {
            nixpkgs.expr = "import ${flakeExpr}.inputs.nixpkgs { }";
            formatting.command = [ "nixfmt" ];
            options = {
              nix-darwin.expr = darwinOpts;
              home-manager.expr = "${darwinOpts}.home-manager.users.type.getSubOptions []";
            };
          };
        };

        pyrefly = {
          command = "pyrefly";
          args = [ "lsp" ];
        };

        tsgo = {
          command = "tsgo";
          args = [
            "--lsp"
            "--stdio"
          ];
          config.typescript = {
            format.enable = false;
            inlayHints.parameterNames.enabled = "none";
            inlayHints.variableTypes.enabled = true;
            inlayHints.functionLikeReturnTypes.enabled = true;
          };
        };
      };

      language = [
        {
          name = "nix";
          auto-format = true;
          formatter.command = "nixfmt";
          language-servers = [ "nixd" ];
        }
        {
          name = "bash";
          auto-format = true;
          language-servers = [ "bash-language-server" ];
          formatter.command = "shfmt";
          formatter.args = [
            "-i"
            "2"
            "-ci"
            "-bn"
          ];
        }
        {
          name = "go";
          auto-format = true;
          language-servers = [ "gopls" ];
          indent.tab-width = 4;
          indent.unit = "\t";
        }
        {
          name = "python";
          auto-format = true;
          language-servers = [
            "pyrefly"
            "ruff"
          ];
          indent.tab-width = 4;
          indent.unit = " ";
        }
        {
          name = "typescript";
          auto-format = true;
          indent.tab-width = 4;
          indent.unit = " ";
          language-servers = [
            {
              name = "tsgo";
              except-features = [ "format" ];
            }
          ];
          formatter.command = "prettier";
          formatter.args = [
            "--parser"
            "typescript"
            "--tab-width"
            "4"
          ];
        }
        {
          name = "javascript";
          auto-format = true;
          indent.tab-width = 4;
          indent.unit = " ";
          language-servers = [
            {
              name = "tsgo";
              except-features = [ "format" ];
            }
          ];
          formatter.command = "prettier";
          formatter.args = [
            "--parser"
            "babel"
            "--tab-width"
            "4"
          ];
        }
        {
          name = "jsx";
          auto-format = true;
          language-servers = [
            {
              name = "tsgo";
              except-features = [ "format" ];
            }
          ];
          formatter.command = "prettier";
          formatter.args = [
            "--parser"
            "babel"
            "--tab-width"
            "4"
          ];
        }
        {
          name = "tsx";
          auto-format = true;
          language-servers = [
            {
              name = "tsgo";
              except-features = [ "format" ];
            }
          ];
          formatter.command = "prettier";
          formatter.args = [
            "--parser"
            "typescript"
            "--tab-width"
            "4"
          ];
        }
        {
          name = "html";
          auto-format = true;
          indent.tab-width = 2;
          indent.unit = " ";
          language-servers = [ "vscode-html-language-server" ];
          formatter.command = "prettier";
          formatter.args = [
            "--parser"
            "html"
            "--tab-width"
            "2"
          ];
        }
        {
          name = "css";
          auto-format = true;
          indent.tab-width = 2;
          indent.unit = " ";
          language-servers = [ "vscode-css-language-server" ];
          formatter.command = "prettier";
          formatter.args = [
            "--parser"
            "css"
            "--tab-width"
            "2"
          ];
        }
        # Prettier formats; LSP format disabled to match Zed "auto".
        {
          name = "json";
          auto-format = true;
          indent.tab-width = 2;
          indent.unit = " ";
          file-types = [
            "json"
            "jsonc"
            "code-snippets"
            "hujson"
          ];
          language-servers = [
            {
              name = "vscode-json-language-server";
              except-features = [ "format" ];
            }
          ];
          formatter.command = "prettier";
          formatter.args = [
            "--parser"
            "json"
          ];
        }
        {
          name = "markdown";
          language-servers = [ "marksman" ];
        }
        {
          name = "toml";
          auto-format = true;
          language-servers = [ "taplo" ];
          indent.tab-width = 2;
          indent.unit = " ";
        }
        {
          name = "dockerfile";
          auto-format = true;
          language-servers = [ "docker-langserver" ];
          formatter.command = "dockerfmt";
          indent.tab-width = 4;
          indent.unit = " ";
        }
      ];
    };
  };
}

{ pkgs
, config
, ...
}: {
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
        # lsp.code-lens.enabled = true;
        # lsp.code-lens.style = "default";
        soft-wrap =
          {
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
          left = [ "mode" "file-name" ];
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
        normal.esc = [ "collapse_selection" "normal_mode" ];
        insert.esc = normal.esc;
        select.esc = normal.esc;

        insert = {
          C-n = "completion";
        };

        normal = {
          X = "extend_line_above";
          V = [ "extend_line_below" "select_mode" ];
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
            l.y = [ ":new" ":insert-output lazygit" ":buffer-close!" ":redraw" ];

          };
        };
      };
    };

    languages.language = [
      {
        name = "nix";
        auto-format = true;
        formatter = { command = "nixpkgs-fmt"; };
        language-servers = [ "nil" ];
      }
      {
        name = "bash";
        language-servers = [ "bash-language-server" ];
      }
      {
        name = "markdown";
        language-servers = [ "marksman" "ltex-ls" ];
      }
      {
        name = "go";
        formatter = { command = "goimports"; };
        language-servers = [ "gopls" "golangci-lint-lsp" "ltex-ls" ];
        auto-format = true;
      }
      {
        name = "rust";
        language-servers = [ "rust-analyzer" ];
      }
      {
        name = "zig";
        language-servers = [ "zls" ];
      }
      {
        name = "lua";
        auto-format = true;
      }
      {
        name = "vhs";
        auto-format = true;
        file-types = [ "tape" ];
        language-servers = [ "vhs-language-server" ];
      }
      {
        name = "html";
        indent.tab-width = 2;
        indent.unit = " ";
        auto-format = false;
        formatter.command = "prettier";
        formatter.args = [ "--parser" "html" "--tab-width" "2" ];
      }
      {
        name = "css";
        indent.tab-width = 4;
        indent.unit = " ";
        formatter.command = "prettier";
        formatter.args = [ "--parser" "css" "--tab-width" "2" ];
        language-servers = [ "css-languageserver" ];
      }
      {
        name = "typescript";
        indent.tab-width = 4;
        indent.unit = " ";
        auto-format = true;
        formatter.command = "prettier";
        formatter.args = [ "--parser" "typescript" "--tab-width" "4" ];
        language-servers = [ "typescript-language-server" ];
      }
      {
        name = "fennel";
        auto-format = true;
        comment-token = ";;";
        file-types = [ "fnl" ];
        formatter.args = [ "-" ];
        formatter.command = "fnlfmt";
        grammar = "fennel";
        indent.tab-width = 2;
        indent.unit = "  ";
        injection-regex = "(fennel|fnl)";
        language-servers = [ "fennel-language-server" ];
        roots = [ ".git" ];
        scope = "source.fnl";
      }
      {
        name = "svg";
        scope = "";
        roots = [ ];
        file-types = [ "svg" ];
        formatter.command = "svgo";
        formatter.args = [ "--pretty" "-" ];
      }
    ];
  };

}

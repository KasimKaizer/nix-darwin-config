{ pkgs, ... }:
{
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
      theme = "onedark_pro";
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

    # Builtin onedark with One Dark Pro background greys, matching Zed's
    # one-dark-pro extension and the Ghostty "one-dark-pro" theme.
    themes.onedark_pro = {
      inherits = "onedark";
      palette = {
        black = "#23272e";
        light-black = "#2c313c";
        linenr = "#495162";
      };
    };
  };
}

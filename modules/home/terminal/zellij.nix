{
  pkgs,
  config,
  lib,
  timezone,
  ...
}:
let
  zjstatus = "${config.xdg.configHome}/zellij/plugins/zjstatus.wasm";
in
{
  home.shellAliases = {
    zj = "zellij";
    za = "zellij a";
    zk = "zellij ka -y && zellij da -y";
    zjt = "zellij action rename-tab";
    zjs = "zellij action rename-session";
  };

  # Keep Ghostty-only autostart. HM's enableZshIntegration would start Zellij in
  # every interactive shell (Terminal.app, IDE terminals, etc.).
  programs.zsh.initContent = lib.mkOrder 2000 ''
    if [[ -z "$ZELLIJ" && ( "$TERM" == "xterm-ghostty" || "$TERM_PROGRAM" == "ghostty" ) ]]; then
      export ZELLIJ_AUTO_ATTACH=true
      eval "$(zellij setup --generate-auto-start zsh)"
    fi
  '';

  xdg.configFile."zellij/plugins/zjstatus.wasm".source = pkgs.zellijPlugins.zjstatus;

  programs.zellij = {
    enable = true;

    settings = {
      simplified_ui = false;
      default_layout = "default";
      pane_frames = false;
      show_startup_tips = false;
      show_release_notes = false;
      theme = "one-half-dark";

      copy_command = "pbcopy";
      copy_on_select = true;

      session_serialization = true;
      serialize_pane_viewport = true;
      scrollback_lines_to_serialize = 10000;

      on_force_close = "detach";
      scrollback_editor = "hx";
    };

    # Keybinds stay as raw KDL — toKDL still struggles with repeated `bind` nodes.
    extraConfig = ''
      plugins {
        zjstatus location="file:${zjstatus}"
      }

      // Ctrl q → tmux-style prefix mode.
      // clear-defaults strips Zellij's built-in Ctrl chords so they don't fight Helix/apps.
      // Super/Alt binds restore the modern macOS + Ghostty muscle memory.
      keybinds clear-defaults=true {
        normal {
          bind "Ctrl q" { SwitchToMode "tmux"; }

          // --- macOS / Ghostty muscle memory (Cmd = Super) ---
          bind "Super t" { NewTab; }
          bind "Super n" { NewPane; }
          bind "Super w" { CloseTab; }
          bind "Super Shift [" { GoToPreviousTab; }
          bind "Super Shift ]" { GoToNextTab; }
          bind "Super Alt Left" { GoToPreviousTab; }
          bind "Super Alt Right" { GoToNextTab; }

          bind "Alt f" { ToggleFloatingPanes; }
          bind "Alt n" { NewPane; }
          bind "Alt i" { MoveTab "Left"; }
          bind "Alt o" { MoveTab "Right"; }
          bind "Alt h" "Alt Left" { MoveFocusOrTab "Left"; }
          bind "Alt l" "Alt Right" { MoveFocusOrTab "Right"; }
          bind "Alt j" "Alt Down" { MoveFocus "Down"; }
          bind "Alt k" "Alt Up" { MoveFocus "Up"; }
          bind "Alt =" "Alt +" { Resize "Increase"; }
          bind "Alt -" { Resize "Decrease"; }
        }

        tmux {
          bind "Esc" { SwitchToMode "Normal"; }
          bind "Ctrl u" { CloseFocus; SwitchToMode "Normal"; }
          bind "Ctrl z" { ToggleFocusFullscreen; SwitchToMode "Normal"; }
          bind "Ctrl d" { Detach; }
          bind "Ctrl s" { ToggleActiveSyncTab; SwitchToMode "Normal"; }

          bind "Ctrl h" { MoveFocus "Left"; SwitchToMode "Normal"; }
          bind "Ctrl l" { MoveFocus "Right"; SwitchToMode "Normal"; }
          bind "Ctrl j" { MoveFocus "Down"; SwitchToMode "Normal"; }
          bind "Ctrl k" { MoveFocus "Up"; SwitchToMode "Normal"; }

          bind "Ctrl y" { NewPane "Down"; SwitchToMode "Normal"; }
          bind "Ctrl n" { NewPane "Right"; SwitchToMode "Normal"; }
          bind "Ctrl e" { NewPane "stacked"; SwitchToMode "Normal"; }
          bind "Ctrl f" { ToggleFloatingPanes; SwitchToMode "Normal"; }

          bind "Ctrl c" { NewTab; SwitchToMode "Normal"; }
          bind "Ctrl o" { GoToNextTab; SwitchToMode "Normal"; }
          bind "Ctrl p" { GoToPreviousTab; SwitchToMode "Normal"; }

          bind "Ctrl [" { SwitchToMode "Scroll"; }
          bind "Ctrl w" {
            LaunchOrFocusPlugin "session-manager" {
              floating true
              move_to_focused_tab true
            };
            SwitchToMode "Normal"
          }
          bind "Ctrl ," {
            LaunchOrFocusPlugin "configuration" {
              floating true
              move_to_focused_tab true
            };
            SwitchToMode "Normal"
          }
        }

        scroll {
          bind "Esc" "Ctrl c" { ScrollToBottom; SwitchToMode "Normal"; }
          bind "e" { EditScrollback; SwitchToMode "Normal"; }
          bind "j" "Down" { ScrollDown; }
          bind "k" "Up" { ScrollUp; }
          bind "Ctrl f" "PageDown" "l" { PageScrollDown; }
          bind "Ctrl b" "PageUp" "h" { PageScrollUp; }
          bind "d" { HalfPageScrollDown; }
          bind "u" { HalfPageScrollUp; }
        }
      }
    '';

    layouts.default = ''
      layout {
        default_tab_template {
          pane size=1 borderless=true {
            plugin location="zjstatus" {
              format_left   "{mode} #[fg=#89B4FA,bold]{session}"
              format_center "{tabs}"
              format_right  "{command_git_branch} {command_battery} {datetime}"
              format_space  ""

              mode_normal        "#[bg=blue] "
              mode_tmux          "#[bg=#ffc387] "

              tab_normal         "#[fg=#6C7086] {name} "
              tab_active         "#[fg=#9399B2,bold,italic] {name} "

              command_git_branch_command     "git rev-parse --abbrev-ref HEAD"
              command_git_branch_format      "#[fg=blue] {stdout} "
              command_git_branch_interval    "10"
              command_git_branch_rendermode  "static"

              command_battery_command    "bash -c \"pmset -g batt | grep -Eo '[0-9]+%' | head -1\""
              command_battery_format     "#[fg=#6C7086] {stdout} "
              command_battery_interval   "30"
              command_battery_rendermode "static"

              datetime          "#[fg=#6C7086,bold] {format} "
              datetime_format   "%a, %d %b %H:%M"
              datetime_timezone "${timezone}"
            }
          }
          children
        }
      }
    '';
  };
}

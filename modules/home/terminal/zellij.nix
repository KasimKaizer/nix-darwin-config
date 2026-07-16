{
  pkgs,
  config,
  lib,
  timezone,
  ...
}:
let
  zjstatus = "${config.xdg.configHome}/zellij/plugins/zjstatus.wasm";
  # Nuclear wipe: CLI delete is unreliable for the session you're attached to
  # and for some resurrectable leftovers — clear metadata + runtime too.
  zk = pkgs.writeShellScriptBin "zk" ''
    set -euo pipefail
    unset ZELLIJ ZELLIJ_SESSION_NAME ZELLIJ_PANE_ID || true

    zellij kill-all-sessions -y 2>/dev/null || true
    zellij delete-all-sessions -y -f 2>/dev/null || true

    cache="${config.home.homeDirectory}/Library/Caches/org.Zellij-Contributors.Zellij"
    rm -rf "$cache/contract_version_1/session_info"
    mkdir -p "$cache/contract_version_1/session_info"

    runtime_root="''${TMPDIR:-/tmp}/zellij-$(id -u)"
    rm -rf "$runtime_root/contract_version_1"

    pkill -x zellij 2>/dev/null || true
    echo "all zellij sessions wiped"
  '';

  # Status-bar metrics for zjstatus (zellij). Prints an icon + value.
  # Usage: zmetrics <ram|cpu|bat>
  #
  # RAM matches Activity Monitor "Memory Used" (app + wired + compressed),
  # not top's PhysMem which counts file cache as used and looks ~always full.
  # CPU uses process %cpu / ncpu (same basis as Activity Monitor), avoiding
  # top -l1's noisy first sample.
  zmetrics = pkgs.writeShellScriptBin "zmetrics" ''
    case "$1" in
      ram)
        printf ' '
        page_size="$(pagesize)"
        total="$(sysctl -n hw.memsize)"
        vm_stat | awk -v ps="$page_size" -v tot="$total" '
          /Pages wired down/              { wired=$NF }
          /Pages occupied by compressor/  { comp=$NF }
          /^Anonymous pages/              { anon=$NF }
          END {
            gsub(/\./, "", wired); gsub(/\./, "", comp); gsub(/\./, "", anon)
            printf "%d%%", (wired + comp + anon) * ps / tot * 100
          }
        '
        ;;
      cpu)
        printf ' '
        ncpu="$(sysctl -n hw.ncpu)"
        ps -A -o %cpu= | awk -v n="$ncpu" '{ s += $1 } END { printf "%d%%", (n > 0 ? s / n : 0) }'
        ;;
      bat)
        printf ' '
        pmset -g batt | grep -Eo '[0-9]+%' | head -n1
        ;;
    esac
  '';

  # nixpkgs still ships 0.23; 0.24 adds {focused_pane_cwd} for git-in-active-pane.
  zjstatusWasm = pkgs.fetchurl {
    url = "https://github.com/dj95/zjstatus/releases/download/v0.24.0/zjstatus.wasm";
    sha256 = "16v6ascpyl7na6lp3v98haggp9lwsg6r1rlv40zcyqpd3p7dxkhw";
  };
in
{
  home.packages = [
    zk
    zmetrics
  ];

  home.shellAliases = {
    zj = "zellij";
    za = "zellij a";
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

  xdg.configFile."zellij/plugins/zjstatus.wasm".source = zjstatusWasm;

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
          bind "Super 1" { GoToTab 1; }
          bind "Super 2" { GoToTab 2; }
          bind "Super 3" { GoToTab 3; }
          bind "Super 4" { GoToTab 4; }
          bind "Super 5" { GoToTab 5; }
          bind "Super 6" { GoToTab 6; }
          bind "Super 7" { GoToTab 7; }
          bind "Super 8" { GoToTab 8; }
          bind "Super 9" { GoToTab 9; }

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
          bind "Ctrl o" { GoToPreviousTab; SwitchToMode "Normal"; }
          bind "Ctrl p" { GoToNextTab; SwitchToMode "Normal"; }

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
              format_left   "{mode} #[fg=#89B4FA,bold]{session} {command_git_branch}"
              format_center "{tabs}"
              format_right  "{command_battery} {command_ram} {command_cpu} {datetime}"
              format_space  ""

              // When the bar is too wide, drop lower-priority sections before the
              // whole status line vanishes (right = metrics/datetime stay longest).
              format_hide_on_overlength "true"
              format_precedence         "lcr"

              mode_normal        "#[bg=blue] "
              mode_tmux          "#[bg=#ffc387] "

              tab_normal         "#[fg=#6C7086] {name} "
              tab_active         "#[fg=#9399B2,bold,italic] {name} "
              tab_separator      " "

              // sliding window: keep the active tab visible, hide the
              // rest behind … +N indicators instead of overflowing the status bar.
              tab_display_count         "7"
              tab_truncate_start_format "#[fg=#6C7086] … +{count} "
              tab_truncate_end_format   "#[fg=#6C7086] +{count} … "

              // Follow focused pane cwd (zjstatus >= 0.24) so branch updates on
              // tab/pane switches and cd into other repos.
              command_git_branch_command            "git rev-parse --abbrev-ref HEAD"
              command_git_branch_format             "#[fg=#6C7086,bold] {stdout} "
              command_git_branch_interval           "10"
              command_git_branch_rendermode         "static"
              command_git_branch_cwd                "{focused_pane_cwd}"
              command_git_branch_hideonemptystdout  "true"

              command_battery_command    "${zmetrics}/bin/zmetrics bat"
              command_battery_format     "#[fg=#6C7086,bold] {stdout}"
              command_battery_interval   "30"
              command_battery_rendermode "static"

              command_ram_command     "${zmetrics}/bin/zmetrics ram"
              command_ram_format      "#[fg=#6C7086,bold] {stdout}"
              command_ram_interval    "10"
              command_ram_rendermode  "static"

              command_cpu_command     "${zmetrics}/bin/zmetrics cpu"
              command_cpu_format      "#[fg=#6C7086,bold] {stdout}"
              command_cpu_interval    "10"
              command_cpu_rendermode  "static"

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

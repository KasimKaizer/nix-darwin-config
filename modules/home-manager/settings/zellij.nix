{ pkgs, ... }:
let
  layoutDir = ".config/zellij/layouts";
  PLUGIN_DIR = ".config/zellij/plugins";
in
{
  programs.zellij = { enable = true; };

  home.file = {
    "${PLUGIN_DIR}/zjstatus.wasm" = {
      source = pkgs.fetchurl {
        url = "https://github.com/dj95/zjstatus/releases/download/v0.17.0/zjstatus.wasm";
        sha256 = "sha256-IgTfSl24Eap+0zhfiwTvmdVy/dryPxfEF7LhVNVXe+U=";
      };
    };
  };

  # NOTE: the module only supports YAML config which is deprecated

  home.file.zellij = {
    target = ".config/zellij/config.kdl";
    text = ''
      simplified_ui false
      default_layout "default"
      pane_frames false
      show_startup_tips false
      keybinds clear-defaults=true {
        normal {
          bind "Ctrl q" { SwitchToMode "tmux"; }
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

          bind "Ctrl c" { NewTab; SwitchToMode "Normal"; }
          bind "Ctrl o" { GoToNextTab; SwitchToMode "Normal"; }
          bind "Ctrl p" { GoToPreviousTab; SwitchToMode "Normal"; }
        }
      }

      theme "one-half-dark"
      themes {
       dracula {
          fg 248 248 242
          bg 40 42 54
          black 0 0 0
          red 255 85 85
          green 80 250 123
          yellow 241 250 140
          blue 98 114 164
          magenta 255 121 198
          cyan 139 233 253
          white 255 255 255
          orange 255 184 108
        }
      }
    '';
  };
  home.file."${layoutDir}/default.kdl" = {
    enable = true;
    text = ''
      layout {
        default_tab_template {
            pane size=1 borderless=true {
                plugin location="file:~/${PLUGIN_DIR}/zjstatus.wasm" {
                format_left   "{mode} #[fg=#89B4FA,bold]{session}"
                format_center "{tabs} #[fg=#89B4FA,bold]"
                format_right  "{command_git_branch} {command_info} {datetime}"
                format_space  ""

                border_enabled  "false"
                border_char     "─"
                border_format   "#[fg=#6C7086]{char}"
                border_position "top"

                hide_frame_for_single_pane "false"

                mode_normal  "#[bg=blue] "
                mode_tmux    "#[bg=#ffc387] "

                tab_normal   "#[fg=#6C7086] {name} "
                tab_active   "#[fg=#9399B2,bold,italic] {name} "

                command_info_command "bash -c ~/${layoutDir}/info.sh"
                command_info_format   "#[fg=#6C7086] {stdout}"
                command_info_interval "10"
                command_info_rendermode "static"

                command_git_branch_command     "git rev-parse --abbrev-ref HEAD"
                command_git_branch_format      "#[fg=blue] {stdout} "
                command_git_branch_interval    "10"
                command_git_branch_rendermode  "static"

                datetime        "#[fg=#6C7086,bold] {format} "
                datetime_format "%A, %d %b %Y %H:%M"
                datetime_timezone "Asia/Dubai"               
               }
            }
         children
        }
      }      
    '';
  };

  home.file."${layoutDir}/info.sh" = {
    enable = true;
    text = ''
      #!/bin/bash

      # cpu=$(top -l 1 | awk '/CPU usage:/ {print 100 - $7}' | sed 's/%//')
      # ram=$(vm_stat | awk 'BEGIN {FS=":"} /free/ {free=$2} /active/ {active=$2} /inactive/ {inactive=$2} /speculative/ {speculative=$2} /wired down/ {wired=$2} /file-backed/ {file=$2} END {used=(active+inactive+speculative+wired+file)/256; total=used+free/256; printf("%3.1f%%", used/total*100)}')
      # temp=$(smctemp -c -i25 -n180 -f | awk '{print $1}')
      battery=$(pmset -g batt | grep -o '[0-9]\+%' | head -1)
      echo "  $battery"
      # echo "  $cpu%   $ram  $temp   $battery"
    '';
  };
}

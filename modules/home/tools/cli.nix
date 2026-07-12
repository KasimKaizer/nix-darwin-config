{ pkgs, ... }:
{
  home.shellAliases = {
    ls = "eza -F --icons=always";
    ll = "ls -lahrts";
    la = "eza -la --git --group-directories-first --icons";
    l = "eza -l --git --group-directories-first --icons";
    cat = "bat";
    cd = "z";
  };

  programs.readline = {
    enable = true;
    variables = {
      show-all-if-ambiguous = "on";
      completion-ignore-case = "on";
      mark-directories = "on";
      mark-symlinked-directories = "on";
      match-hidden-files = "off";
      visible-stats = "on";
      keymap = "vi";
      editing-mode = "vi-insert";
    };
  };

  programs.fastfetch.enable = true;

  programs.bat = {
    enable = true;
    config.theme = "TwoDark";
  };

  programs.fzf = {
    enable = true;
    enableZshIntegration = true;
  };

  programs.zoxide = {
    enable = true;
    enableZshIntegration = true;
  };

  programs.eza.enable = true;

  # https://wiki.nixos.org/wiki/Yazi
  programs.yazi = {
    enable = true;
    enableZshIntegration = true;
    shellWrapperName = "y";

    settings = {
      mgr = {
        ratio = [
          1
          4
          3
        ];
        sort_by = "natural";
        sort_sensitive = true;
        sort_reverse = false;
        sort_dir_first = true;
        linemode = "size";
        show_hidden = true;
        show_symlink = true;
        scrolloff = 5;
        mouse_events = [
          "click"
          "scroll"
          "drag"
        ];
      };

      preview = {
        wrap = "yes";
        tab_size = 2;
        max_width = 600;
        max_height = 900;
        image_filter = "lanczos3";
        image_quality = 90;
        ueberzug_scale = 1;
        ueberzug_offset = [
          0
          0
          0
          0
        ];
      };

      plugin.prepend_fetchers = [
        {
          id = "git";
          url = "*";
          run = "git";
          group = "git";
        }
        {
          id = "git";
          url = "*/";
          run = "git";
          group = "git";
        }
      ];
    };

    keymap.mgr.prepend_keymap = [
      {
        on = "l";
        run = "plugin smart-enter";
        desc = "Enter directory or open file";
      }
      {
        on = "<Enter>";
        run = "plugin smart-enter";
        desc = "Enter directory or open file";
      }
      {
        on = "F";
        run = "plugin smart-filter";
        desc = "Smart filter";
      }
      {
        on = "f";
        run = "plugin jump-to-char";
        desc = "Jump to char";
      }
    ];

    plugins = {
      full-border = {
        package = pkgs.yaziPlugins.full-border;
        setup = true;
      };
      git = {
        package = pkgs.yaziPlugins.git;
        setup = true;
      };
      smart-enter = pkgs.yaziPlugins.smart-enter;
      smart-filter = pkgs.yaziPlugins.smart-filter;
      jump-to-char = pkgs.yaziPlugins.jump-to-char;
    };
  };

  programs.btop = {
    enable = true;
    settings = {
      color_theme = "Default";
      theme_background = true;
      truecolor = true;
      vim_keys = false;
      rounded_corners = true;
      update_ms = 1000;
      proc_sorting = "memory";
      proc_tree = false;
      proc_mem_bytes = true;
      proc_cpu_graphs = true;
      cpu_invert_lower = true;
      show_uptime = true;
      check_temp = true;
      show_coretemp = true;
      temp_scale = "celsius";
      show_cpu_freq = true;
      clock_format = "%X";
      mem_graphs = true;
      show_swap = true;
      swap_disk = true;
      show_battery = true;
      show_battery_watts = true;
      log_level = "WARNING";
    };
  };
}

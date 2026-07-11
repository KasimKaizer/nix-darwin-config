{ ... }:
{
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

  programs.yazi = {
    enable = true;
    enableZshIntegration = true;
    shellWrapperName = "y";
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

{ ... }:
let
  ghostty_conf_dir = ".config/ghostty";
in
{
  home.file."${ghostty_conf_dir}/Config" = {
    enable = true;
    text = ''
      # Font
      font-family = JetBrainsMono Nerd Font
      font-family = JetBrainsMono Nerd Font
      font-family-bold = JetBrainsMono Nerd Font
      font-family-italic = JetBrainsMono Nerd Font
      font-family-bold-italic = JetBrainsMono Nerd Font
      font-style = Medium
      font-style-bold = Heavy
      font-style-italic = Medium Italic
      font-style-bold-italic = Heavy Italic
      font-size = 15

      # Theme
      window-theme = dark
      theme = Dark Modern
      background = #1f1f1f
      foreground = #cccccc
      selection-background = #3a3d41
      selection-foreground = #e0e0e0
      cursor-color = #ffffff
      palette = 0=#272727
      palette = 1=#f74949
      palette = 2=#2ea043
      palette = 3=#9e6a03
      palette = 4=#0078d4
      palette = 5=#d01273
      palette = 6=#1db4d6
      palette = 7=#cccccc
      palette = 8=#5d5d5d
      palette = 9=#dc5452
      palette = 10=#23d18b
      palette = 11=#f5f543
      palette = 12=#3b8eea
      palette = 13=#d670d6
      palette = 14=#29b8db
      palette = 15=#e5e5e5
      cursor-style = bar
      cursor-style-blink = false
      adjust-cursor-thickness = 1

      # misc
      confirm-close-surface = false
      mouse-hide-while-typing = true
      clipboard-read = allow
      clipboard-write = allow
      copy-on-select = false
   
      auto-update = off
    '';
  };
}

{ ... }:
# Ghostty is installed as a Homebrew cask (see modules/darwin/homebrew.nix).
# GUI apps stay on Homebrew — HM only manages ~/.config/ghostty/config.
{
  programs.ghostty = {
    enable = true;
    package = null;

    settings = {
      theme = "Dark Modern";
      window-theme = "dark";

      font-family = "JetBrainsMono Nerd Font Mono";
      font-size = 15;
      font-thicken = true;

      # Cursor — bar suits Helix/modal editing
      cursor-style = "bar";
      cursor-style-blink = false;
      adjust-cursor-thickness = 1;

      # zsh + Helix on macOS
      shell-integration = "zsh";
      window-inherit-working-directory = true;
      macos-option-as-alt = true;

      # Layout / input
      scrollbar = "never";
      window-padding-x = 8;
      window-padding-y = 8;
      mouse-hide-while-typing = true;
      copy-on-select = "clipboard";
      confirm-close-surface = false;

      clipboard-read = "allow";
      clipboard-write = "allow";
      auto-update = "off";

      # Let Zellij own these chords (see modules/home/terminal/zellij.nix Super binds).
      # Ghostty binds goto_tab on both logical (cmd+N) and physical (cmd+digit_N) keys.
      keybind = [
        "cmd+t=unbind"
        "cmd+n=unbind"
        "cmd+w=unbind"
        "cmd+alt+left=unbind"
        "cmd+alt+right=unbind"
        "cmd+shift+left_bracket=unbind"
        "cmd+shift+right_bracket=unbind"
        "cmd+1=unbind"
        "cmd+2=unbind"
        "cmd+3=unbind"
        "cmd+4=unbind"
        "cmd+5=unbind"
        "cmd+6=unbind"
        "cmd+7=unbind"
        "cmd+8=unbind"
        "cmd+9=unbind"
        "cmd+digit_1=unbind"
        "cmd+digit_2=unbind"
        "cmd+digit_3=unbind"
        "cmd+digit_4=unbind"
        "cmd+digit_5=unbind"
        "cmd+digit_6=unbind"
        "cmd+digit_7=unbind"
        "cmd+digit_8=unbind"
        "cmd+digit_9=unbind"
      ];
    };
  };
}

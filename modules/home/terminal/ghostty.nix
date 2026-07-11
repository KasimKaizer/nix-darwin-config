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
      copy-on-select = false;
      confirm-close-surface = false;

      clipboard-read = "allow";
      clipboard-write = "allow";
      auto-update = "off";
    };
  };
}

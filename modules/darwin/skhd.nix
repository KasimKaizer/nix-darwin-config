# App-launch hotkeys via skhd (nixpkgs / nix-darwin services.skhd).
# After first switch: System Settings → Privacy & Security → Accessibility → enable skhd.
{
  services.skhd = {
    enable = true;
    skhdConfig = ''
      # Open apps (⌘⌥ + letter)
      cmd + alt - t : open -a Ghostty
      cmd + alt - m : open -a Mail
      cmd + alt - f : open -a Finder
      cmd + alt - s : open -a Safari
      cmd + alt - g : open -a "Google Chrome"
      cmd + alt - l : open -a LibreWolf
      cmd + alt - e : open -a Gemini
      cmd + alt - v : open -a Passepartout
      cmd + alt - n : open -a Tailscale
      cmd + alt - a : open -a "Activity Monitor"
    '';
  };
}

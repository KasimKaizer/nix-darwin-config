{ pkgs, lib, ... }: {
  # here go the darwin preferences and config items
  programs.zsh.enable = true;
  users.users.ew.home = "/Users/ew";
  services.nix-daemon.enable = true;
  nixpkgs.hostPlatform = "aarch64-darwin";
  nix.extraOptions = ''
    experimental-features = nix-command flakes
  '';

  # do garbage collection weekly to keep disk usage low
  nix.gc = {
    automatic = lib.mkDefault true;
    options = lib.mkDefault "--delete-older-than 7d";
  };

  imports = [
    ./settings/system.nix
    ./settings/homebrew.nix
  ];
}











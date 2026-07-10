{ ... }:
{
  nixpkgs.hostPlatform = "aarch64-darwin";
  nixpkgs.config.allowUnfree = true;

  networking.hostName = "inferno";
  networking.localHostName = "inferno";
  networking.computerName = "inferno";

  time.timeZone = "Asia/Calcutta";

  system.primaryUser = "ew";
  system.stateVersion = 5;

  imports = [
    ../../modules/darwin
  ];
}

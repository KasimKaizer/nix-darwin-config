{ pkgs, lib, ... }: {
  nixpkgs.hostPlatform = "aarch64-darwin";
  nixpkgs.config.allowUnfree = true;

  networking.hostName = "inferno";
  networking.localHostName = "inferno";
  networking.computerName = "inferno";

  time.timeZone = "Asia/Kolkata";

  imports = [
    ../../modules/darwin
  ];
}

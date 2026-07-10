{
  hostname,
  username,
  system,
  timezone,
  ...
}:
{
  nixpkgs.hostPlatform = system;
  nixpkgs.config.allowUnfree = true;

  networking.hostName = hostname;
  networking.localHostName = hostname;
  networking.computerName = hostname;

  time.timeZone = timezone;

  system.primaryUser = username;
  system.stateVersion = 5;

  imports = [
    ../../modules/darwin
  ];
}

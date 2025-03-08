{ pkgs, ... }: {
  homebrew = {
    brewPrefix = "/opt/homebrew/bin";
    enable = true;
    onActivation.cleanup = "zap";
    caskArgs.no_quarantine = true;
    onActivation.autoUpdate = true;
    onActivation.upgrade = true;
    global = {
      brewfile = true;
      # lockfiles = true;
    };
    casks = [
      "exifcleaner"
      "librewolf"
      "zed@preview"
      "bluewallet"
      "vesktop"
      "iina"
      "spotify"
      "plex"
      "intellij-idea"
      "itsycal"
      "mullvadvpn"
      "grammarly-desktop"
      "arc"
      "ghostty"
      "raycast"
      "stats"
      "kindle-comic-converter"
      "calibre"
      "kindle-previewer"
    ];

    taps = [
      "zirixcz/vesktop"
    ];

    brews = [ "bitwarden-cli" ];

    masApps = {
      # TODO Feel free to add your favorite apps here.
      Xcode = 497799835;
      WhatsAppMessenge = 310633997;
      Telegram = 747648890;
      MicrosoftWord = 462054704;
      MicrosoftPowerPoint = 462062816;
      MicrosoftExcel = 462058435;
      Onedrive = 823766827;
      Bitwarden = 1352778147;
      # WireGuard = 1451685025;
    };

    # extraConfig = ''
    # '';
  };
}

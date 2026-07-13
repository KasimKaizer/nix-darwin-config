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
      "utm"
    ];

    taps = [
      "zirixcz/vesktop"
    ];

    brews = [ "bitwarden-cli" ];

    masApps = {
      # TODO Feel free to add your favorite apps here.
      Xcode = 497799835;
      WhatsApp = 310633997;
      Telegram = 747648890;
      MicrosoftWord = 462054704;
      MicrosoftPowerPoint = 462062816;
      MicrosoftExcel = 462058435;
      Onedrive = 823766827;
      Bitwarden = 1352778147;
      PiPifier = 1160374471;
      TaperMonkey = 6738342400;
      Noir = 1592917505;
      SponsorBlock = 1573461917;
      DeArrow = 6451469297;
      RaycastCompanion = 6738274497;
      CookieEditor = 6446215341;
      AdGuardForSafari = 1440147259;
      Bluewallet = 1376878040;
    };

    # extraConfig = ''
    # '';
  };
}

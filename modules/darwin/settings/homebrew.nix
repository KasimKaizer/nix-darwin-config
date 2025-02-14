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
      # "font-jetbrains-mono"
      "vesktop"
      # "font-jetbrains-mono-nerd-font"
      "iina"
      "spotify"
      "plex"
      "intellij-idea"
      # "mullvadvpn@beta"
      "itsycal"
      "grammarly-desktop"
      "megasync"
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

    brews = [ ];

    masApps = {
      # TODO Feel free to add your favorite apps here.
      Xcode = 497799835;
      WhatsAppMessenge = 310633997;
      Telegram = 747648890;
      MicrosoftWord = 462054704;
      MicrosoftPowerPoint = 462062816;
      MicrosoftExcel = 462058435;
      Bitwarden = 1352778147;
      WireGuard = 1451685025;
    };

    # extraConfig = ''
    # '';
  };
}

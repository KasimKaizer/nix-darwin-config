{ pkgs, ... }: {
  homebrew = {
    prefix = "/opt/homebrew";
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
      "zed"
      "iina"
      "plex"
      "intellij-idea"
      "itsycal"
      "mullvad-vpn"
      "grammarly-desktop"
      "google-chrome"
      "chatgpt"
      "ghostty"
      "kindle-comic-converter"
      "calibre"
      "kindle-previewer"
      "utm"
      "android-platform-tools"
      "freedom"
      "lulu"
      "halloy"
      "copilot-cli"
    ];

    taps = [
    ];

    brews = [ "bitwarden-cli" ];

    masApps = {
      Xcode = 497799835;
      WhatsApp = 310633997;
      Telegram = 747648890;
      MicrosoftWord = 462054704;
      # MicrosoftPowerPoint = 462062816;
      # MicrosoftExcel = 462058435;
      Onedrive = 823766827;
      Bitwarden = 1352778147;
      TaperMonkey = 6738342400;
      Noir = 1592917505;
      SponsorBlock = 1573461917;
      DeArrow = 6451469297;
      CookieEditor = 6446215341;
      # AdGuardForSafari = 1440147259;
      Bluewallet = 1376878040;
      TheUnarchiver = 425424353;
      FolderQuickLook = 6753110395;
      WBlock = 6746388723;
    };

    # extraConfig = ''
    # '';
  };
}

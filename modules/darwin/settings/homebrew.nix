{ pkgs, ... }: {
  homebrew = {
    prefix = "/opt/homebrew";
    enable = true;
    onActivation.cleanup = "zap";
    caskArgs.no_quarantine = true;
    onActivation.autoUpdate = false;
    onActivation.upgrade = true;
    global = {
      brewfile = true;
      # lockfiles = true;
    };
    casks = [
      "android-platform-tools"
      "antigravity-cli"
      "calibre"
      "chatgpt"
      "copilot-cli"
      "cursor-cli"
      "exifcleaner"
      "freedom"
      "ghostty"
      "google-chrome"
      "google-gemini"
      "iina"
      "intellij-idea"
      "itsycal"
      "kindle-comic-converter"
      "kindle-previewer"
      "librewolf"
      "lulu"
      "plex"
      "spotify"
      "superhuman"
      "utm"
      "zed"
    ];

    taps = [
      "homebrew/cask"
      "homebrew/core"
      "homebrew/bundle"
    ];

    brews = [ "mas" ];

    masApps = {
      AmazonKindle = 302584613;
      Bitwarden = 1352778147;
      Bluewallet = 1376878040;
      CookieEditor = 6446215341;
      DeArrow = 6451469297;
      FocusForYoutube = 1514703160;
      FolderQuickLook = 6753110395;
      MicrosoftExcel = 462058435;
      MicrosoftPowerPoint = 462062816;
      MicrosoftWord = 462054704;
      Noir = 1592917505;
      Onedrive = 823766827;
      Passepartout = 1433648537;
      SponsorBlock = 1573461917;
      Tailscale = 1475387142;
      TaperMonkey = 6738342400;
      Telegram = 747648890;
      TheUnarchiver = 425424353;
      WBlock = 6746388723;
      WhatsApp = 310633997;
      Xcode = 497799835;
    };

    # extraConfig = ''
    # '';
  };
}

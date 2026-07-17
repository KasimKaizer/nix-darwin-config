{
  lib,
  homeDirectory,
  ...
}:
# All configuration options are documented here:
#   https://nix-darwin.github.io/nix-darwin/manual/index.html
#
# Additional macOS defaults coverage:
#   https://github.com/yannbertrand/macos-defaults
let
  dockItems = import ./defaults/dock-items.nix { inherit homeDirectory; };

  loginItems = [
    {
      name = "Freedom";
      path = "/Applications/Freedom.app";
    }
    {
      name = "Itsycal";
      path = "/Applications/Itsycal.app";
    }
    {
      name = "LuLu";
      path = "/Applications/LuLu.app";
    }
  ];
in
{
  system.defaults = {
    NSGlobalDomain = {
      AppleIconAppearanceTheme = "RegularAutomatic";
      AppleInterfaceStyle = "Dark";
      AppleKeyboardUIMode = 3;
      AppleMeasurementUnits = "Centimeters";
      AppleMetricUnits = 1;
      ApplePressAndHoldEnabled = false;
      AppleSpacesSwitchOnActivate = true;
      AppleTemperatureUnit = "Celsius";
      AppleWindowTabbingMode = "always";
      InitialKeyRepeat = 15;
      KeyRepeat = 3;
      NSAutomaticCapitalizationEnabled = true;
      NSAutomaticDashSubstitutionEnabled = true;
      NSAutomaticInlinePredictionEnabled = true;
      NSAutomaticPeriodSubstitutionEnabled = false;
      NSAutomaticQuoteSubstitutionEnabled = false;
      NSAutomaticSpellingCorrectionEnabled = true;
      NSDocumentSaveNewDocumentsToCloud = true;
      NSNavPanelExpandedStateForSaveMode = true;
      NSNavPanelExpandedStateForSaveMode2 = true;
      "com.apple.sound.beep.feedback" = 0;
      "com.apple.swipescrolldirection" = true;
    };

    dock = {
      autohide = true;
      expose-group-apps = true;
      orientation = "bottom";
      persistent-apps = dockItems.persistentApps;
      persistent-others = dockItems.persistentOthers;
      show-recents = false;
      showAppExposeGestureEnabled = true;
      showDesktopGestureEnabled = true;
      showLaunchpadGestureEnabled = true;
      showMissionControlGestureEnabled = true;
      tilesize = 57;
    };

    controlcenter = {
      AirDrop = false;
      BatteryShowPercentage = true;
      Bluetooth = true;
      Display = false;
      FocusModes = false;
      NowPlaying = true;
      Sound = false;
    };

    finder = {
      AppleShowAllExtensions = true;
      AppleShowAllFiles = true;
      FXDefaultSearchScope = "SCcf";
      FXEnableExtensionChangeWarning = false;
      FXPreferredViewStyle = "icnv";
      FXRemoveOldTrashItems = true;
      NewWindowTarget = "Recents";
      QuitMenuItem = true;
      ShowExternalHardDrivesOnDesktop = true;
      ShowHardDrivesOnDesktop = false;
      ShowMountedServersOnDesktop = true;
      ShowPathbar = true;
      ShowRemovableMediaOnDesktop = true;
      ShowStatusBar = true;
      _FXShowPosixPathInTitle = true;
      _FXSortFoldersFirst = true;
    };

    hitoolbox = {
      AppleFnUsageType = "Change Input Source";
    };

    loginwindow = {
      GuestEnabled = false;
      SHOWFULLNAME = true;
    };

    menuExtraClock = {
      FlashDateSeparators = false;
      IsAnalog = false;
      ShowAMPM = true;
      ShowDate = 2;
      ShowDayOfWeek = false;
      ShowSeconds = false;
    };

    screencapture = {
      location = "${homeDirectory}/Pictures/Screenshots";
      type = "png";
    };

    screensaver = {
      askForPassword = true;
      askForPasswordDelay = 0;
    };

    SoftwareUpdate = {
      AutomaticallyInstallMacOSUpdates = true;
    };

    spaces.spans-displays = false;

    trackpad = {
      Clicking = true;
      DragLock = false;
      TrackpadFourFingerHorizSwipeGesture = 2;
      TrackpadFourFingerPinchGesture = 2;
      TrackpadFourFingerVertSwipeGesture = 2;
      TrackpadMomentumScroll = true;
      TrackpadPinch = true;
      TrackpadRightClick = true;
      TrackpadRotate = true;
      TrackpadThreeFingerDrag = true;
      TrackpadThreeFingerHorizSwipeGesture = 0;
      TrackpadThreeFingerTapGesture = 2;
      TrackpadThreeFingerVertSwipeGesture = 0;
      TrackpadTwoFingerDoubleTapGesture = true;
      TrackpadTwoFingerFromRightEdgeSwipeGesture = 3;
    };

    # Window tiling (Sequoia+).
    #   Fn+Ctrl+←/→/↑/↓  tile to half
    #   Fn+Ctrl+F          fill screen
    #   Fn+Ctrl+C          center
    #   Fn+Ctrl+R          restore previous size
    #   Fn+Ctrl+Shift+arrows  arrange two windows
    WindowManager = {
      AppWindowGroupingBehavior = true;
      AutoHide = false;
      EnableStandardClickToShowDesktop = false;
      EnableTiledWindowMargins = false;
      EnableTilingByEdgeDrag = true;
      EnableTilingOptionAccelerator = true;
      EnableTopTilingByEdgeDrag = true;
      GloballyEnabled = false;
      HideDesktop = false;
      StageManagerHideWidgets = false;
      StandardHideDesktopIcons = false;
      StandardHideWidgets = false;
    };

    CustomUserPreferences = {
      NSGlobalDomain = {
        AppleFirstWeekday = {
          gregorian = 2;
        };
        AppleLanguages = [ "en-US" ];
        AppleLocale = "en_US";
        AppleMiniaturizeOnDoubleClick = false;
        NSAllowContinuousSpellChecking = true;
        WebKitDeveloperExtras = true;
      };
      "com.80pct.FreedomPlatform" = import ./defaults/freedom.nix;
      "com.apple.AdLib" = {
        allowApplePersonalizedAdvertising = false;
      };
      "com.apple.ImageCapture".disableHotPlug = true;
      "com.apple.Safari.SandboxBroker" = {
        ShowDevelopMenu = true;
      };
      "com.apple.desktopservices" = {
        DSDontWriteNetworkStores = true;
        DSDontWriteUSBStores = true;
      };
      "com.apple.screencapture" = {
        captureDelay = 5;
        showsClicks = true;
        style = "window";
        video = 1;
      };
      "com.mowglii.ItsycalApp" = import ./defaults/itsycal.nix;
    };
  };

  launchd.user.agents = lib.listToAttrs (
    map (item: {
      name = "login-item-${item.name}";
      value.serviceConfig = {
        KeepAlive = false;
        ProcessType = "Interactive";
        ProgramArguments = [
          "/usr/bin/open"
          "-a"
          item.path
        ];
        RunAtLoad = true;
      };
    }) loginItems
  );
}

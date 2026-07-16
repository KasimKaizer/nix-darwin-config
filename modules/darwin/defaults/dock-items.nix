{ homeDirectory }:
{
  persistentApps = [
    # System
    "/System/Applications/App Store.app"

    # Communication
    "/System/Applications/Mail.app"
    "/Applications/WhatsApp.app"

    # Sync & networking
    "${homeDirectory}/Applications/OneDrive.app"
    "/Applications/Passepartout.app"
    "/Applications/Tailscale.app"

    # Media
    "/System/Applications/Music.app"
    "/Applications/Infuse.app"

    # Editors & terminal
    "/Applications/Ghostty.app"
    "/Applications/Zed.app"
    "/Applications/Visual Studio Code.app"

    # Browsers
    "/System/Volumes/Preboot/Cryptexes/App/System/Applications/Safari.app"
    "/Applications/Google Chrome.app"
    "/Applications/LibreWolf.app"
  ];

  persistentOthers = [
    { folder = "${homeDirectory}/Downloads"; }
  ];
}

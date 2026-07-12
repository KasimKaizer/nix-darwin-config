{
  config,
  pkgs,
  lib,
  ...
}:
# VS Code is installed as a Homebrew cask (see modules/darwin/homebrew.nix).
# Only its config (and a baseline extension list) is managed here.
#
# Design: the repo holds the PERMANENT baseline, but
# ~/Library/Application Support/Code/User must stay a set of normal, writable
# files so VS Code can rewrite them and so settings can be tweaked on the fly
# while experimenting. So instead of symlinking read-only store files
# (programs.vscode / home.file), every `nixswitch` COPIES the settings baseline
# into place, overwriting any ad-hoc experiments. Anything you want to keep goes
# into this repo.
#
# Extensions: Microsoft Marketplace IDs in ./vscode/extensions.txt are ensured
# installed on every switch via `code --install-extension`. Hand-installed
# extras are left alone; removing an ID from the list does not uninstall it.
# Install failures are non-fatal so a flaky network cannot abort nixswitch.
let
  userDir = "${config.home.homeDirectory}/Library/Application Support/Code/User";
  # Homebrew cask binary (see `brew info --cask visual-studio-code`).
  codeBin = "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code";

  subst =
    lib.replaceStrings
      [ "@NIXFMT@" "@SHFMT@" ]
      [
        "${pkgs.nixfmt}/bin/nixfmt"
        "${pkgs.shfmt}/bin/shfmt"
      ];
  settingsFile = pkgs.writeText "vscode-settings.json" (
    subst (builtins.readFile ./vscode/settings.json)
  );
  extensionsFile = ./vscode/extensions.txt;
in
{
  home.packages = [ pkgs.live-server ];

  home.activation.vscodeConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    userDir="${userDir}"
    code="${codeBin}"
    ${pkgs.coreutils}/bin/mkdir -p "$userDir"

    # Overwrite the settings baseline, keep it writable.
    ${pkgs.coreutils}/bin/install -m 0644 ${settingsFile} "$userDir/settings.json"

    # Ensure baseline extensions are installed (idempotent; does not uninstall).
    # NODE_OPTIONS silences Electron/Node DEP0169 url.parse() noise from `code`.
    if [ ! -x "$code" ]; then
      echo "vscode: $code not found; skipping extension install (is the Homebrew cask installed?)" >&2
    else
      export NODE_OPTIONS="''${NODE_OPTIONS:+$NODE_OPTIONS }--no-deprecation"
      installed="$("$code" --list-extensions 2>/dev/null | ${pkgs.coreutils}/bin/tr '[:upper:]' '[:lower:]' || true)"
      while IFS= read -r ext || [ -n "$ext" ]; do
        # Skip blanks and #-comments (empty bash case patterns break Nix indented strings).
        [ -z "$ext" ] && continue
        case "$ext" in \#*) continue ;; esac
        ext_lc="$(printf '%s' "$ext" | ${pkgs.coreutils}/bin/tr '[:upper:]' '[:lower:]')"
        if printf '%s\n' "$installed" | ${pkgs.gnugrep}/bin/grep -qx "$ext_lc"; then
          continue
        fi
        echo "vscode: installing extension $ext"
        if ! "$code" --install-extension "$ext" >/dev/null 2>&1; then
          echo "vscode: failed to install $ext (will retry on next nixswitch)" >&2
        fi
      done < ${extensionsFile}
    fi
  '';
}

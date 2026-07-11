{
  config,
  pkgs,
  lib,
  ...
}:
# Zed is installed as a Homebrew cask (see modules/darwin/homebrew.nix). Only its
# config is managed here.
#
# Design: the repo holds the PERMANENT baseline, but
# ~/.config/zed must stay a set of normal, writable files so Zed can rewrite them
# and so settings can be tweaked on the fly while experimenting. So instead of
# symlinking read-only store files (home.file / xdg.configFile), every `nixswitch`
# COPIES the baseline into place, overwriting any ad-hoc experiments. Anything you
# want to keep goes into this repo.
#
# settings.json contains API keys, so it is stored here with @...@ placeholders
# and the real values are decrypted from the sops vault at activation time (never
# written to the Nix store).
let
  zedDir = "${config.home.homeDirectory}/.config/zed";
  secretsFile = ../../../secrets/secrets.yaml;

  # Non-secret files. @ZED_DIR@ is expanded now (build time); no secrets involved.
  subst = lib.replaceStrings [ "@ZED_DIR@" ] [ zedDir ];

  tasksFile = pkgs.writeText "zed-tasks.json" (subst (builtins.readFile ./zed/tasks.json));
  toggleFile = pkgs.writeTextFile {
    name = "zed-toggle-disable-ai.py";
    executable = true;
    text = subst (builtins.readFile ./zed/toggle_disable_ai.py);
  };
  keymapFile = ./zed/keymap.json;

  # settings.json baseline still holds the @ZED_*@ secret placeholders; these are
  # filled in at activation time, so this store file is safe (no secrets in it).
  settingsTmpl = pkgs.writeText "zed-settings.json.tmpl" (builtins.readFile ./zed/settings.json);

  sops = "${pkgs.sops}/bin/sops";
  sed = "${pkgs.gnused}/bin/sed";
  extract =
    key:
    ''SOPS_AGE_KEY_FILE="$ageKey" ${sops} decrypt --extract '["${key}"]' ${secretsFile} 2>/dev/null || true'';
in
{
  home.activation.zedConfig = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    zedDir="${zedDir}"
    ageKey="${config.sops.age.keyFile}"
    ${pkgs.coreutils}/bin/mkdir -p "$zedDir"

    # Non-secret configs: overwrite the baseline, keep them writable.
    ${pkgs.coreutils}/bin/install -m 0644 ${keymapFile} "$zedDir/keymap.json"
    ${pkgs.coreutils}/bin/install -m 0644 ${tasksFile} "$zedDir/tasks.json"
    ${pkgs.coreutils}/bin/install -m 0755 ${toggleFile} "$zedDir/toggle_disable_ai.py"

    # settings.json: inject API keys decrypted from the sops vault.
    if [ -r "$ageKey" ]; then
      exa="$(${extract "zed_exa_api_key"})"
      ctx="$(${extract "zed_context7_api_key"})"
      ghp="$(${extract "zed_github_pat"})"
      sshUser="$(${extract "ssh_box_user"})"
    else
      echo "sops-nix: age key not found at $ageKey; writing Zed settings with blank secrets" >&2
      exa=""; ctx=""; ghp=""; sshUser=""
    fi
    ${sed} \
      -e "s|@ZED_EXA_API_KEY@|$exa|g" \
      -e "s|@ZED_CONTEXT7_API_KEY@|$ctx|g" \
      -e "s|@ZED_GITHUB_PAT@|$ghp|g" \
      -e "s|@ZED_SSH_BOX_USER@|$sshUser|g" \
      ${settingsTmpl} > "$zedDir/settings.json"
    ${pkgs.coreutils}/bin/chmod 0644 "$zedDir/settings.json"
  '';
}

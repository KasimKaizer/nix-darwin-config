{
  config,
  pkgs,
  inputs,
  ...
}:
{
  imports = [ inputs.sops-nix.homeManagerModules.sops ];

  # The age private key must already exist at this path. Restore it from a
  # password manager on a fresh machine — do NOT let sops-nix mint a new one,
  # or it won't be able to decrypt the committed secrets.
  sops.age.keyFile = "${config.home.homeDirectory}/.config/sops/age/keys.txt";
  sops.age.generateKey = false;
  sops.defaultSopsFile = ../../../secrets/secrets.yaml;

  sops.secrets = {
    aoc_session = { };
    copilot_api_key = { };

    # NOTE: rclone rewrites this file when it refreshes the OAuth token. As a
    # sops-managed symlink that refresh won't survive a rebuild; re-run the
    # sops edit if the token is rotated.
    rclone_conf.path = "${config.home.homeDirectory}/.config/rclone/rclone.conf";
  };

  # Single env file holding every SECRET environment variable, sourced by zsh
  # (see shell/zsh.nix). Only secrets belong here — non-secret env vars live in
  # home.sessionVariables. Add new secret env vars as more export lines.
  sops.templates."secret-env".content = ''
    export AOC_SESSION="${config.sops.placeholder.aoc_session}"
    export COPILOT_API_KEY="${config.sops.placeholder.copilot_api_key}"
  '';

  home.packages = with pkgs; [
    sops
    age
  ];
}

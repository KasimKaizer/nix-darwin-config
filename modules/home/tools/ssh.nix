{ config, ... }:
{
  # SSH private key, kept encrypted at rest in secrets/secrets.yaml and
  # materialized to ~/.ssh/id_ed25519 (0600) at activation. On a fresh machine
  # the key is restored purely from sops + the age key — nothing plaintext.
  sops.secrets."ssh_id_ed25519" = {
    path = "${config.home.homeDirectory}/.ssh/id_ed25519";
    mode = "0600";
  };

  # HostName and User for the `box` host are secret, so the whole ~/.ssh/config
  # is rendered from a sops template (placeholders substituted at activation)
  # rather than written to the world-readable nix store via programs.ssh.
  sops.secrets."ssh_box_hostname" = { };
  sops.secrets."ssh_box_user" = { };

  sops.templates."ssh-config" = {
    path = "${config.home.homeDirectory}/.ssh/config";
    mode = "0600";
    content = ''
      Host box
        HostName ${config.sops.placeholder."ssh_box_hostname"}
        User ${config.sops.placeholder."ssh_box_user"}
        Port 22
        IdentityFile ${config.home.homeDirectory}/.ssh/id_ed25519
        ServerAliveInterval 60
    '';
  };
}

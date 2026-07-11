{
  config,
  pkgs,
  ...
}:
{
  sops.secrets.exercism_token = { };

  sops.templates."exercism-user.json" = {
    path = "${config.home.homeDirectory}/.config/exercism/user.json";
    mode = "0600";
    content = ''
      {
        "apibaseurl": "https://api.exercism.org/v1",
        "token": "${config.sops.placeholder.exercism_token}",
        "workspace": "${config.home.homeDirectory}/Developer/Exercism"
      }
    '';
  };

  home.packages = [ pkgs.exercism ];
}

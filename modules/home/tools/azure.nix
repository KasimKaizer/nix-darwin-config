{ pkgs, ... }:
{
  home = {
    packages = [ pkgs.azure-cli ];

    # This is Azure CLI's standard config location.
    file.".azure/config".text = ''
      [core]
      collect_telemetry = no
      only_show_errors = no
      output = json

      [extension]
      use_dynamic_install = no
    '';
  };
}

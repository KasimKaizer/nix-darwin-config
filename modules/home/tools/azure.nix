{
  config,
  pkgs,
  ...
}:
{
  home = {
    packages = [ pkgs.azure-cli ];

    sessionVariables = {
      AZURE_CONFIG_DIR = "${config.xdg.configHome}/azure";
      AZURE_CORE_COLLECT_TELEMETRY = "no";
      AZURE_CORE_ONLY_SHOW_ERRORS = "no";
      AZURE_CORE_OUTPUT = "json";
      AZURE_EXTENSION_USE_DYNAMIC_INSTALL = "no";
    };
  };
}

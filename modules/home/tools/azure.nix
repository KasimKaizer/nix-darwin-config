{
  config,
  lib,
  pkgs,
  ...
}:
let
  # Fabric 3.2.3 cannot use Invoke 3: https://github.com/fabric/fabric/issues/2376
  # Keep this compatibility pin local to Azure CLI until nixpkgs fixes the pairing.
  # Fabric and Paramiko must share one Invoke version in its private Python scope.
  azurePkgs = pkgs.extend (
    _: previous: {
      pythonPackagesExtensions = previous.pythonPackagesExtensions ++ [
        (_: pythonPrevious: {
          invoke = pythonPrevious.invoke.overridePythonAttrs (
            previousAttrs:
            let
              version = "2.2.1";
            in
            {
              inherit version;
              src = pkgs.fetchPypi {
                inherit (previousAttrs) pname;
                inherit version;
                hash = "sha256-UVv0m0pIkyt5sCRZA0jaIvOcSULf+ZGtH7i4uuob5wc=";
              };
            }
          );
        })
      ];
    }
  );
in
{
  home = {
    packages = lib.lists.singleton azurePkgs.azure-cli;

    sessionVariables = {
      AZURE_CONFIG_DIR = "${config.xdg.configHome}/azure";
      AZURE_CORE_COLLECT_TELEMETRY = "no";
      AZURE_CORE_ONLY_SHOW_ERRORS = "no";
      AZURE_CORE_OUTPUT = "json";
      AZURE_EXTENSION_USE_DYNAMIC_INSTALL = "no";
    };
  };
}

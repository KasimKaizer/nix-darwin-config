{ config, pkgs, ... }:
let
  myNumber = builtins.replaceStrings [ "\n" ] [ "" ] (builtins.readFile "/Users/ew/.secrets/whatsapp_number");
in
{
  programs.openclaw = {
    enable = true;
    llm = {
      provider = "gemini";
      apiKeyPath = "/Users/ew/.secrets/model_key";
    };
    settings = {
      channels = {
        whatsapp = {
          dmPolicy = "allowlist";
          allowFrom = [ myNumber ];
        };
      };
    };
  };
}

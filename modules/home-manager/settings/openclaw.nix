{ config, lib, pkgs, ... }:

let
  myNumber = builtins.replaceStrings [ "\n" ] [ "" ] (builtins.readFile "/Users/ew/.secrets/whatsapp_number");
in
{
  programs.openclaw = {
    config = {
      agents = {
        defaults = {
          # Route traffic through your Copilot Pro subscription
          model.primary = "github-copilot/claude-opus-4.6";
        };
      };

      gateway = {
        mode = "local";
      };

      channels.whatsapp = {
        allowFrom = [ myNumber ];
      };
    };

    instances.default = {
      enable = true;
      stateDir = "/Users/ew/.openclaw";
      workspaceDir = "/Users/ew/.openclaw/workspace";
      launchd.enable = true;
    };
  };
}

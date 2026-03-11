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
      plugins.slots.memory = "memory-lancedb";
      plugins.entries.whatsapp.enabled = true;
    };

    instances.default = {
      enable = true;
      stateDir = "/Users/ew/.openclaw";
      workspaceDir = "/Users/ew/.openclaw/workspace";
      launchd.enable = true;

      # Nix will automatically fetch, pin, and build these from GitHub
      plugins = [
        { source = "github:openclaw/nix-steipete-tools?dir=tools/peekaboo"; }
        { source = "github:openclaw/nix-steipete-tools?dir=tools/summarize"; }
        { source = "github:openclaw/nix-steipete-tools?dir=tools/imsg"; }

        {
          source = "github:knostic/openclaw-shield";
          config = {
            settings = {
              enforce_read_only = true;
              require_approval_for_exec = true;
            };
          };
        }

        { source = "github:lekt9/openclaw-foundry"; }
      ];
    };
  };
}

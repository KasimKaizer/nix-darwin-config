{ config, lib, pkgs, ... }:

let
  secretsDir = "/Users/ew/.secrets";
  myNumber = builtins.replaceStrings [ "\n" ] [ "" ] (builtins.readFile "${secretsDir}/whatsapp_number");
in
{
  programs.openclaw = {
    documents = ../openclaw-documents;

    instances.default = {
      enable = true;
      stateDir = "/Users/ew/.openclaw";
      workspaceDir = "/Users/ew/.openclaw/workspace";
      launchd.enable = true;
      config = {
        gateway = {
          mode = "local";
        };

        agents.defaults.model = {
          primary = "github-copilot/claude-opus-4.6";
        };

        channels.whatsapp = {
          allowFrom = [ myNumber ];
        };

        tools = {
          alsoAllow = [ "lobster" "llm_task" "exec" "reactions" ];
          exec.applyPatch.enabled = true;
        };

        plugins.slots.memory = "memory-lancedb";
        plugins.entries.whatsapp.enabled = true;
      };

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

  home.file.".openclaw/openclaw.json" = {
    force = true;
  };

  # Inject secrets into the launchd user domain so the openclaw service
  # can read them. launchctl setenv sets env vars that new launchd
  # services inherit.
  home.activation.openclawSecrets = lib.hm.dag.entryAfter [ "writeBoundary" ] ''
    # Ensure nix-managed binaries are visible to launchd services
    /bin/launchctl setenv PATH "/run/current-system/sw/bin:/etc/profiles/per-user/ew/bin:/usr/bin:/bin:/usr/sbin:/sbin"
    if [ -f "${secretsDir}/gateway-token" ]; then
      GW_TOKEN="$(/bin/cat "${secretsDir}/gateway-token")"
      /bin/launchctl setenv OPENCLAW_GATEWAY_TOKEN "$GW_TOKEN"
      # Patch gateway.auth.token into openclaw.json so the CLI can authenticate
      OCJSON="$HOME/.openclaw/openclaw.json"
      if [ -f "$OCJSON" ]; then
        ${pkgs.jq}/bin/jq --arg tok "$GW_TOKEN" '.gateway.auth.token = $tok' "$OCJSON" > "$OCJSON.tmp" \
          && /bin/mv "$OCJSON.tmp" "$OCJSON"
      fi
    fi
  '';
}

{
  homeDirectory,
  lib,
  mcpServers,
  pkgs,
}:
let
  # Serena runs with its caller's filesystem scope, so exposing it through
  # the host gateway lets a sandboxed agent read/write/exec on the host.
  # It stays off the gateway and runs inside the container instead, where
  # even its write/exec tools are confined to mounted paths.
  gatewayServers = lib.filterAttrs (name: _: name != "serena") mcpServers;

  toDockerSbxMcp =
    name: server:
    if server.transport == "http" then
      {
        request = {
          Name = name;
          URL = server.url;
        };
        spec = {
          Name = name;
          Type = "remote";
          URL = server.url;
          RemoteTransport = "streamable-http";
        };
      }
    else
      {
        request = {
          Name = name;
          Command = server.command;
          Args = server.args;
        };
        spec = {
          Name = name;
          Type = "local";
          Command = [ server.command ] ++ server.args;
          ResolvedCommand = server.command;
        };
      };

  dockerSbxMcpFiles = lib.mapAttrs' (
    name: server:
    lib.nameValuePair
      "Library/Application Support/com.docker.sandboxes/sandboxes/sandboxd/mcp/servers/${name}.json"
      {
        force = true;
        text = builtins.toJSON (toDockerSbxMcp name server);
      }
  ) gatewayServers;

  sbxOpencode = import ./opencode/sbx-opencode.nix {
    inherit
      lib
      pkgs
      homeDirectory
      gatewayServers
      ;
    hooksPlugin = ./opencode/hooks;
  };

  # Any `sbx` command starts sandboxd. This turns it off again: stop every
  # sandbox the daemon still knows, then the daemon itself.
  sbxOff = pkgs.writeShellScriptBin "sbx-off" ''
    PATH="${
      lib.makeBinPath [
        pkgs.docker-sbx
        pkgs.coreutils
      ]
    }:$PATH"

    status="$(sbx daemon status 2>/dev/null || true)"
    case "$status" in
      *"Status: running"*) ;;
      *)
        echo "sbx daemon is already stopped"
        exit 0
        ;;
    esac

    names="$(sbx ls -q 2>/dev/null || true)"
    if [ -n "$names" ]; then
      printf '%s\n' "$names" | while IFS= read -r name; do
        [ -n "$name" ] || continue
        sbx stop "$name" || true
      done
    fi

    sbx daemon stop
  '';
in
{
  home.packages = [
    pkgs.docker-sbx
    sbxOpencode
    sbxOff
  ];

  home.file = dockerSbxMcpFiles;

  home.activation.sbxMcpConfigDirectories = lib.hm.dag.entryBefore [ "checkLinkTargets" ] ''
    $DRY_RUN_CMD ${pkgs.coreutils}/bin/mkdir -p \
      "${homeDirectory}/Library/Application Support/com.docker.sandboxes/sandboxes/sandboxd/mcp/servers"
  '';
}

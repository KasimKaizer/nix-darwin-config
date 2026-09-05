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
in
{
  home.packages = [
    pkgs.docker-sbx
    sbxOpencode
  ];

  home.file = dockerSbxMcpFiles;

  home.activation.sbxMcpConfigDirectories = lib.hm.dag.entryBefore [ "checkLinkTargets" ] ''
    $DRY_RUN_CMD ${pkgs.coreutils}/bin/mkdir -p \
      "${homeDirectory}/Library/Application Support/com.docker.sandboxes/sandboxes/sandboxd/mcp/servers"
  '';
}

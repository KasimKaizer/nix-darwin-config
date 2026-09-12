{
  config,
  inputs,
  lib,
  pkgs,
  homeDirectory,
  mcpServers,
  toOmp,
}:
let
  # No grep_app: omp's native github tool covers public-repo search.
  ompMcpAllowlist = [
    "context7"
    "nix"
    "codegraph"
  ];
  ompMcpServers = lib.filterAttrs (name: _: builtins.elem name ompMcpAllowlist) mcpServers;
  ompPackage = inputs.omp.packages.${pkgs.stdenv.hostPlatform.system}.default;
  # Darwin pi_natives is gzip-embedded; the loader extracts it to
  # ~/.omp/natives with absolute /nix/store LC_LOAD_DYLIB. Upstream only
  # records libopus in nix-support, so GC of libiconv makes dlopen fail.
  # DYLD_FALLBACK_LIBRARY_PATH restores basename lookup without shadowing
  # other dylibs. Do not wrap EXA_API_KEY (store leak).
  ompHostPackage =
    if pkgs.stdenv.hostPlatform.isDarwin then
      pkgs.symlinkJoin {
        name = "${ompPackage.pname}-wrapped";
        paths = [ ompPackage ];
        nativeBuildInputs = [ pkgs.makeBinaryWrapper ];
        postBuild = ''
          rm -f "$out/bin/omp"
          makeWrapper "${ompPackage}/bin/omp" "$out/bin/omp" \
            --prefix DYLD_FALLBACK_LIBRARY_PATH : "${
              lib.makeLibraryPath [
                pkgs.libiconv
                pkgs.libopus
              ]
            }"
        '';
      }
    else
      ompPackage;
in
{
  imports = [ inputs.omp.homeManagerModules.default ];

  programs.omp.enable = true;
  programs.omp.package = ompHostPackage;

  programs.omp.settings = {
    # LOAD-BEARING empty: user-level Cursor/Codex/OpenCode/Gemini/Claude/GitHub MCP roots do not load.
    enabledProviders = [ ];
    # Keyed Exa is native web_search, not an Exa MCP: omp skips it for
    # Gemini/Claude/Codex search unless it is first in webSearchOrder and
    # EXA_API_KEY is set (see omp-env template below).
    providers.webSearchOrder = [ "exa" ];
    # LOAD-BEARING: project-level MCP roots do not load.
    mcp.enableProjectConfig = false;
    # Host roles mirror the OpenCode mapping. Authenticate with `/login cursor`
    # and Antigravity after switch (OAuth, not env). No API keys in config.
    modelRoles = {
      default = "cursor/cursor-grok-4.6";
      plan = "cursor/cursor-grok-4.6";
      advisor = "cursor/claude-opus-5-thinking-xhigh";
      slow = "cursor/claude-opus-5-thinking-xhigh";
      smol = "google-antigravity/gemini-3.8-flash";
      task = "google-antigravity/gemini-3.8-flash";
      tiny = "google-antigravity/gemini-3.8-flash";
    };
    # Defence-in-depth discovery lock. Do NOT add `cursor` (it is both a
    # discovery source and the model provider for Grok/Opus) and do NOT add
    # `agents` (that is how ~/.agents/skills loads). Keep `native` and `agents-md`.
    disabledProviders = [
      "claude"
      "codex"
      "gemini"
      "github"
      "opencode"
      "windsurf"
      "cline"
      "vscode"
      "mcp-json"
    ];
  };

  sops.templates."omp-mcp.json" = {
    path = "${homeDirectory}/.omp/agent/mcp.json";
    mode = "0600";
    content = builtins.toJSON {
      "$schema" =
        "https://raw.githubusercontent.com/can1357/oh-my-pi/main/packages/coding-agent/src/config/mcp-schema.json";
      mcpServers = lib.mapAttrs toOmp ompMcpServers;
    };
  };

  # Keyed Exa only: reuse the existing vault key (declared in zed.nix).
  # Do NOT wrap the omp package with the key (that would leak into the store).
  sops.templates."omp-env" = {
    path = "${homeDirectory}/.omp/agent/.env";
    mode = "0600";
    content = "EXA_API_KEY=${config.sops.placeholder.zed_exa_api_key}\n";
  };
}

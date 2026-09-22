{
  config,
  lib,
  pkgs,
  flakeDir,
  ...
}:
let
  version = "0.3.48";
  feynmanHome = "${config.xdg.configHome}/.feynman";
  feynmanRuntime = pkgs.stdenvNoCC.mkDerivation {
    pname = "feynman";
    inherit version;

    src = pkgs.fetchurl {
      url = "https://github.com/Companion-Inc/feynman/releases/download/v${version}/feynman-${version}-darwin-arm64.tar.gz";
      hash = "sha256-3YsrHokiKnvIJRil1CRGnzeYENdS2IuYeg9Okz6K1gs=";
    };

    dontUnpack = true;

    installPhase = ''
      runHook preInstall
      mkdir -p "$out/libexec" "$out/bin"
      tar -xzf "$src" --strip-components=1 -C "$out/libexec"
      ln -s "$out/libexec/feynman" "$out/bin/feynman"
      runHook postInstall
    '';
  };

  feynman = pkgs.writeShellScriptBin "feynman" ''
    set -eu
    export FEYNMAN_HOME="${config.xdg.configHome}"
    . "${config.sops.templates."feynman-env".path}"

    runtime="${feynmanHome}/runtime/${version}"
    if [ ! -x "$runtime/feynman" ]; then
      ${pkgs.coreutils}/bin/mkdir -p "$runtime"
      ${pkgs.coreutils}/bin/cp -R "${feynmanRuntime}/libexec/." "$runtime"
      ${pkgs.coreutils}/bin/chmod -R u+w "$runtime"
    fi

    exec "$runtime/feynman" "$@"
  '';

  feynmanUpdate = pkgs.writeShellApplication {
    name = "feynman-update";
    runtimeInputs = with pkgs; [
      curl
      git
      gnugrep
      gawk
      jq
      nix
      perl
    ];
    text = ''
      set -eu

      config="${flakeDir}/modules/home/agents/feynman.nix"
      if ! git -C "${flakeDir}" diff --quiet -- "$config"; then
        echo "Refusing to overwrite uncommitted changes in $config." >&2
        exit 1
      fi

      version="$(
        curl -fsSL https://api.github.com/repos/Companion-Inc/feynman/releases/latest |
          jq -er '.tag_name | select(test("^v[0-9]+(\\.[0-9]+)*$")) | ltrimstr("v")'
      )"
      asset="feynman-$version-darwin-arm64.tar.gz"
      checksum="$(
        curl -fsSL "https://github.com/Companion-Inc/feynman/releases/download/v$version/SHA256SUMS" |
          awk -v asset="$asset" '$2 == asset { print $1 }'
      )"

      if ! printf '%s' "$checksum" | grep -Eq '^[0-9a-f]{64}$'; then
        echo "Missing or invalid checksum for $asset." >&2
        exit 1
      fi

      hash="$(nix hash convert --hash-algo sha256 --to sri "$checksum")"
      perl -0pi -e 's/version = "[^"]+";/version = "'"$version"'";/; s/hash = "sha256-[^"]+";/hash = "'"$hash"'";/' "$config"
      git -C "${flakeDir}" diff --check -- "$config"
      git -C "${flakeDir}" diff -- "$config"
    '';
  };
in
{
  sops.secrets = {
    feynman_hindsight_api_token = { };
    feynman_parallel_api_key = { };
  };

  sops.templates."feynman-env" = {
    path = "${feynmanHome}/env";
    mode = "0600";
    content = ''
      export EXA_API_KEY="${config.sops.placeholder.zed_exa_api_key}"
      export HINDSIGHT_API_TOKEN="${config.sops.placeholder.feynman_hindsight_api_token}"
      export PARALLEL_API_KEY="${config.sops.placeholder.feynman_parallel_api_key}"
    '';
  };

  home.packages = [
    feynman
    feynmanUpdate
  ];

  xdg.configFile = {
    # pi-web-access resolves $NAME references from the Feynman-only wrapper.
    ".feynman/web-search.json".text = builtins.toJSON {
      provider = "auto";
      searchProvider = "auto";
      exaApiKey = "$EXA_API_KEY";
      parallelApiKey = "$PARALLEL_API_KEY";
      allowBrowserCookies = true;
    };

    ".feynman/agent/extensions/antigravity.ts".text = ''
      import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
      import cortexKitPiAntigravityAuth from "${feynmanHome}/npm-global/lib/node_modules/@cortexkit/pi-antigravity-auth/dist/index.js";

      const subagentSchema = {
        type: "object",
        properties: {
          agent: { type: "string", description: "Agent to invoke" },
          task: { type: "string", description: "Task instructions" },
          action: { type: "string", description: "Optional management action" },
        },
        required: [ "agent", "task" ],
      };

      export default function (pi: ExtensionAPI) {
        const registerProvider = pi.registerProvider.bind(pi);

        pi.registerProvider = (id: string, provider: any) => {
          if (id === "google-antigravity" && typeof provider?.streamSimple === "function") {
            const streamSimple = provider.streamSimple;
            provider.streamSimple = (model: any, context: any, options: any) =>
              streamSimple(
                model,
                {
                  ...context,
                  tools: context.tools?.map((tool: any) =>
                    tool.name === "subagent" ? { ...tool, parameters: subagentSchema } : tool,
                  ),
                },
                options,
              );
          }

          return registerProvider(id, provider);
        };

        cortexKitPiAntigravityAuth(pi);
      }
    '';
  };

  home.activation.feynmanConfigDir = lib.hm.dag.entryBefore [ "sops-nix" ] ''
    $DRY_RUN_CMD ${pkgs.coreutils}/bin/mkdir -p "${feynmanHome}"
  '';
}

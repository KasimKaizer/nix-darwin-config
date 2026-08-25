{
  config,
  inputs,
  lib,
  pkgs,
  system,
  ...
}:
let
  claudeCodeProxy = inputs.claude-code-proxy.packages.${system}.default;
  cursorCli = pkgs.cursor-cli;

  claudeViaProxy = pkgs.writeShellApplication {
    name = "claude";
    runtimeInputs = [
      pkgs.claude-code
      pkgs.curl
    ];
    text = ''
      if ! curl --fail --silent --max-time 1 http://127.0.0.1:18765/healthz >/dev/null; then
        printf '%s\n' 'claude-code-proxy is not running; run nixswitch or inspect ~/Library/Logs/claude-code-proxy.err.log.' >&2
        exit 1
      fi

      profile="''${CLAUDE_PROXY_PROFILE:-codex}"
      case "$profile" in
        codex)
          default_model="gpt-5.6-terra[1m]"
          default_small_model="gpt-5.6-luna[1m]"
          export CLAUDE_CODE_AUTO_COMPACT_WINDOW=272000
          ;;
        grok)
          default_model="cursor:grok-4.6"
          default_small_model="cursor:composer-2.5-fast"
          ;;
        kimi)
          default_model="cursor:kimi-k3"
          default_small_model="cursor:composer-2.5-fast"
          ;;
        *)
          printf 'Unknown Claude proxy profile: %s\n' "$profile" >&2
          exit 2
          ;;
      esac

      export CLAUDE_CONFIG_DIR="${config.xdg.configHome}/claude-code/$profile"
      export ANTHROPIC_BASE_URL="http://127.0.0.1:18765"
      export ANTHROPIC_AUTH_TOKEN="unused"
      export ANTHROPIC_MODEL="''${ANTHROPIC_MODEL:-$default_model}"
      export ANTHROPIC_SMALL_FAST_MODEL="''${ANTHROPIC_SMALL_FAST_MODEL:-$default_small_model}"
      export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
      export CLAUDE_CODE_DISABLE_NONSTREAMING_FALLBACK=1

      exec ${lib.getExe pkgs.claude-code} "$@"
    '';
  };

  profileLauncher =
    profile:
    pkgs.writeShellApplication {
      name = "claude-${profile}";
      text = ''
        export CLAUDE_PROXY_PROFILE="${profile}"
        exec ${lib.getExe claudeViaProxy} "$@"
      '';
    };
in
{
  home.packages = [
    claudeCodeProxy
    cursorCli
    claudeViaProxy
    (profileLauncher "codex")
    (profileLauncher "grok")
    (profileLauncher "kimi")
  ];

  # The proxy's Cursor provider needs this generated schema bundle. Provider
  # credentials stay in the macOS Keychain, not in this declarative config.
  xdg.configFile."claude-code-proxy/config.json".text = builtins.toJSON {
    bindAddress = "127.0.0.1";
    port = 18765;
    cursor.agentBundle = "${cursorCli}/share/cursor-agent/index.js";
  };

  launchd.agents.claude-code-proxy = {
    enable = true;
    config = {
      ProgramArguments = [
        (lib.getExe claudeCodeProxy)
        "serve"
        "--no-monitor"
      ];
      EnvironmentVariables.PATH = "${lib.makeBinPath [ cursorCli ]}:/usr/bin:/bin:/usr/sbin:/sbin";
      ProcessType = "Standard";
      RunAtLoad = true;
      KeepAlive = true;
      StandardErrorPath = "${config.home.homeDirectory}/Library/Logs/claude-code-proxy.err.log";
      StandardOutPath = "${config.home.homeDirectory}/Library/Logs/claude-code-proxy.log";
    };
  };
}

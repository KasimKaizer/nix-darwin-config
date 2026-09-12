# Shared blocks live in ../sbx-lib.nix.
{
  lib,
  pkgs,
  homeDirectory,
  hooksPlugin,
  gatewayServers,
  sbxLib,
}:
let
  staticMcpList = lib.concatStringsSep "," (builtins.attrNames gatewayServers);

  # Serena pin mirrors agents.nix. uv launch stays inside the container.
  serenaContainerCmd = builtins.toJSON [
    "uv"
    "tool"
    "run"
    "--from"
    "git+https://github.com/oraios/serena@7fcbca7e62555ec2287ddb2f083caee805848ea6"
    "serena"
    "start-mcp-server"
    "--project-from-cwd"
    "--enable-web-dashboard"
    "false"
    "--open-web-dashboard"
    "false"
  ];
in
pkgs.writeShellScriptBin "sbx-opencode" ''
  PATH="${sbxLib.binPath}:$PATH"

  ${sbxLib.workspace "oc"}

  ${sbxLib.stopOnExit}

  CONFIG_FILE="${homeDirectory}/.config/opencode/opencode.jsonc"
  SERENA_CMD='${serenaContainerCmd}'
  ENV_ARGS=()
  if [ -f "$CONFIG_FILE" ]; then
    # Host OpenRouter keys and MCP remotes stay off the container. Gateway
    # already exposes grep.app as searchGitHub — do not add a duplicate
    # grep_app remote. Host tools maps list grep_app_*, so every agent
    # must enable mcp-gateway_* and serena_*. Skip injection if jq fails
    # so a partial parse cannot leak secrets.
    if FILTERED_CONFIG="$(jq --argjson serena_cmd "$SERENA_CMD" '
      .provider.openrouter.options.apiKey = "proxy-managed"
      | .mcp = {
          "mcp-gateway": {type: "remote", url: "http://mcp-gateway.docker.internal/mcp", enabled: true, headers: {Authorization: "Bearer proxy-managed"}},
          serena: {type: "local", command: $serena_cmd, enabled: true}
        }
      | .tools["mcp-gateway_*"] = true
      | .tools["serena_*"] = true
      | (.agent // {}) |= with_entries(
          .value |= (
            if type == "object" then
              .tools["mcp-gateway_*"] = true
              | .tools["serena_*"] = true
            else . end
          )
        )
      | .experimental.mcp_timeout = 120000
    ' "$CONFIG_FILE")"; then
      ENV_ARGS+=(-e "OPENCODE_CONFIG_CONTENT=$FILTERED_CONFIG")
    fi
  fi

  ${sbxLib.containerEnv}
  ENV_ARGS+=(-e "OPENROUTER_API_KEY=proxy-managed")
  ENV_ARGS+=(-e "GEMINI_API_KEY=proxy-managed")

  ${sbxLib.skillsCache}

  AUTH_CACHE="${homeDirectory}/.cache/sbx/auth"
  mkdir -p "$AUTH_CACHE"
  # Cursor Run is HTTP/2 Connect-RPC, so proxy sentinels cannot replace
  # tokens: copy only host .cursor. Google stays a sentinel. Drop leftovers
  # first so a prior staging cannot leak through virtiofs.
  rm -f "$AUTH_CACHE/auth.json" "$AUTH_CACHE/antigravity.json" "$AUTH_CACHE/antigravity-accounts.json"
  HOST_AUTH="${homeDirectory}/.local/share/opencode/auth.json"
  if ! jq -n --slurpfile host "$HOST_AUTH" '
    {
      google: {
        type: "oauth",
        access: "proxy-managed-google-token",
        refresh: "dummy",
        expires: 9999999999999
      }
    }
    + (
      if ($host | length) > 0 and ($host[0] | type == "object") and ($host[0].cursor | type == "object") then
        {cursor: $host[0].cursor}
      else
        {}
      end
    )
  ' > "$AUTH_CACHE/auth.json" 2>/dev/null; then
    jq -n '{
      google: {
        type: "oauth",
        access: "proxy-managed-google-token",
        refresh: "dummy",
        expires: 9999999999999
      }
    }' > "$AUTH_CACHE/auth.json"
  fi
  chmod 644 "$AUTH_CACHE/auth.json"
  jq -n '{
    version: 4,
    accounts: [
      {
        email: "proxy-managed@example.invalid",
        refreshToken: "proxy-managed",
        addedAt: 1,
        lastUsed: 1,
        enabled: true,
        cachedQuota: {
          gemini: {
            remainingFraction: 1,
            resetTime: "2099-12-31T23:59:59Z",
            modelCount: 1
          }
        }
      }
    ],
    activeIndex: 0,
    activeIndexByFamily: { claude: 0, gemini: 0 }
  }' > "$AUTH_CACHE/antigravity-accounts.json"
  chmod 644 "$AUTH_CACHE/antigravity-accounts.json"
  if [ -f "${homeDirectory}/.config/opencode/tui.json" ]; then
    cp -L "${homeDirectory}/.config/opencode/tui.json" "$AUTH_CACHE/tui.json"
    chmod 644 "$AUTH_CACHE/tui.json"
  fi
  if [ -f "${homeDirectory}/.config/opencode/tui-preferences.jsonc" ]; then
    cp -L "${homeDirectory}/.config/opencode/tui-preferences.jsonc" "$AUTH_CACHE/tui-preferences.jsonc"
    chmod 644 "$AUTH_CACHE/tui-preferences.jsonc"
  fi

  ${sbxLib.ensureSharedDir}

  ${sbxLib.caches}

  # Snapshot plugins; a shared bind sees host opencode mutate the cache
  # (stale/partial views, silent plugin load failures). -a keeps .bin
  # symlinks; -L would dereference them.
  PLUGIN_CACHE="${homeDirectory}/.cache/sbx/opencode-packages"
  for pkg in cursor-opencode-provider @cortexkit; do
    if [ -d "${homeDirectory}/.cache/opencode/packages/$pkg" ]; then
      mkdir -p "$PLUGIN_CACHE/$pkg"
      rsync -a --delete "${homeDirectory}/.cache/opencode/packages/$pkg/" "$PLUGIN_CACHE/$pkg/"
    fi
  done

  if ! sbx inspect "$SANDBOX_NAME" >/dev/null 2>&1; then
    CREATE_FLAGS=(--name "$SANDBOX_NAME" --static-mcp "${staticMcpList}" "''${ENV_ARGS[@]}")
    if [ "$1" = "--clone" ]; then
      CREATE_FLAGS=(--clone "''${CREATE_FLAGS[@]}")
    fi
    if [ "$1" = "acp" ]; then
      sbx create "''${CREATE_FLAGS[@]}" opencode "$WORKSPACE_DIR" "${hooksPlugin}:ro" >&2
    else
      sbx create "''${CREATE_FLAGS[@]}" opencode "$WORKSPACE_DIR" "${hooksPlugin}:ro"
    fi
  fi

  sbx exec "$SANDBOX_NAME" true >/dev/null 2>&1 || true

  ${sbxLib.bindMount}

  # Staged 0644 copies: host 0600 files are unreadable by UID 1000, and
  # single-file binds go stale on the plugin's atomic rewrites.
  if [ -f "$AUTH_CACHE/antigravity-accounts.json" ]; then
    bind_mount "$AUTH_CACHE/antigravity-accounts.json:/home/agent/.config/opencode/antigravity-accounts.json"
  fi
  if [ -f "$AUTH_CACHE/tui.json" ]; then
    bind_mount "$AUTH_CACHE/tui.json:/home/agent/.config/opencode/tui.json"
  fi
  if [ -f "$AUTH_CACHE/tui-preferences.jsonc" ]; then
    bind_mount "$AUTH_CACHE/tui-preferences.jsonc:/home/agent/.config/opencode/tui-preferences.jsonc"
  fi
  if [ -f "$AUTH_CACHE/auth.json" ]; then
    bind_mount "$AUTH_CACHE/auth.json:/home/agent/.local/share/opencode/auth.json"
  fi

  if [ -d "${homeDirectory}/.config/opencode/node_modules" ]; then
    bind_mount "${homeDirectory}/.config/opencode/node_modules:/home/agent/.config/opencode/node_modules"
  fi
  if [ -d "$PLUGIN_CACHE" ]; then
    bind_mount "$PLUGIN_CACHE:/home/agent/.cache/opencode/packages"
  fi
  if [ -d "$SKILLS_CACHE" ]; then
    bind_mount "$SKILLS_CACHE:/home/agent/.config/opencode/skills:ro"
    bind_mount "$SKILLS_CACHE:/home/agent/.agents/skills:ro"
  fi
  bind_mount "$UV_CACHE:/home/agent/.cache/uv"
  bind_mount "$NPM_GLOBAL:/home/agent/.npm-global"

  ${sbxLib.toolchainMounts}

  ${sbxLib.nixInstall}

  if [ "$1" = "acp" ]; then
    sbx exec -i "''${ENV_ARGS[@]}" "$SANDBOX_NAME" -- opencode acp "''${@:2}"
  elif [ "$1" = "--clone" ]; then
    if [ $# -gt 1 ]; then
      sbx run --name "$SANDBOX_NAME" "''${ENV_ARGS[@]}" opencode -- "''${@:2}"
    else
      sbx run --name "$SANDBOX_NAME" "''${ENV_ARGS[@]}" opencode
    fi
  else
    if [ $# -gt 0 ]; then
      sbx run --name "$SANDBOX_NAME" "''${ENV_ARGS[@]}" opencode -- "$@"
    else
      sbx run --name "$SANDBOX_NAME" "''${ENV_ARGS[@]}" opencode
    fi
  fi
''

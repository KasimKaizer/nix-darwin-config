# noqa: SIZE_OK — one sequential sandbox launcher; splitting would add
# pass-through files with a single caller.
{
  lib,
  pkgs,
  homeDirectory,
  hooksPlugin,
  gatewayServers,
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
  PATH="${
    lib.makeBinPath [
      pkgs.git
      pkgs.coreutils
      pkgs.docker-sbx
      pkgs.rsync
      pkgs.jq
    ]
  }:$PATH"

  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    WORKSPACE_DIR="$(git rev-parse --show-toplevel)"
  else
    WORKSPACE_DIR="$(pwd -P)"
  fi

  RAW_NAME="$(basename "$WORKSPACE_DIR")"
  DIR_BASENAME="$(printf '%s' "$RAW_NAME" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed 's/^-*//;s/-*$//' | cut -c 1-25)"
  DIR_HASH="$(printf '%s' "$WORKSPACE_DIR" | sha256sum | cut -c 1-8)"
  SANDBOX_NAME="oc-''${DIR_BASENAME:-default}-''${DIR_HASH}"

  # Do not `exec` the agent: EXIT must run so the nerdbox VM does not linger.
  # Leave sandboxd up only if some other sandbox is still running.
  stop_on_exit() {
    trap - EXIT
    sbx stop "$SANDBOX_NAME" >/dev/null 2>&1 || true
    if sbx ls --json 2>/dev/null | jq -e --arg name "$SANDBOX_NAME" '
      [.sandboxes[]?
        | select((.name // "") != $name)
        | select((.status // .state // "") | ascii_downcase == "running")]
      | length > 0
    ' >/dev/null; then
      return 0
    fi
    sbx daemon stop >/dev/null 2>&1 || true
  }
  trap stop_on_exit EXIT

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
      | .provider.inferx.options.apiKey = "proxy-managed"
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

  # Keep image bins (opencode under npm-global/bin) on PATH.
  ENV_ARGS+=(-e "PATH=/nix/var/nix/profiles/default/bin:/home/agent/go/bin:/home/agent/.cargo/bin:/home/agent/.npm-global/bin:/home/agent/.local/bin:/usr/local/share/npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
  # uv defaults to hardlinking, which fails under bulk load on the virtiofs
  # bind mount (ENOENT linking into builds-v0). Copy mode keeps the shared
  # cache working from every sandbox.
  ENV_ARGS+=(-e "UV_LINK_MODE=copy")
  # Redirect global npm installs into the persisted cache below. Never mount
  # over /usr/local/share/npm-global: the image's own opencode binary lives there.
  ENV_ARGS+=(-e "NPM_CONFIG_PREFIX=/home/agent/.npm-global")
  ENV_ARGS+=(-e "OPENROUTER_API_KEY=proxy-managed")
  ENV_ARGS+=(-e "INFERX_API_KEY=proxy-managed")
  ENV_ARGS+=(-e "GEMINI_API_KEY=proxy-managed")
  # Same as the nixpkgs opencode wrapper: keep the auto-update checker (which
  # logs to stdout) off the ACP pipe.
  ENV_ARGS+=(-e "OPENCODE_DISABLE_AUTOUPDATE=true")

  SKILLS_CACHE="${homeDirectory}/.cache/sbx/skills"
  if [ -d "${homeDirectory}/.agents/skills" ]; then
    mkdir -p "$SKILLS_CACHE"
    rsync -aL --delete "${homeDirectory}/.agents/skills/" "$SKILLS_CACHE/"
  fi

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

  UV_CACHE="${homeDirectory}/.cache/sbx/uv"
  mkdir -p "$UV_CACHE"
  # virtiofs: container UID 1000 is "other" on host-owned files. Caches
  # need write, unlike 0644 auth copies which only need read.
  chmod -R a+rwX "$UV_CACHE" 2>/dev/null || true

  # Persist npm -g LSPs across sandboxes. mkdir lib: npm ENOENT on a bare prefix.
  NPM_GLOBAL="${homeDirectory}/.cache/sbx/npm-global"
  mkdir -p "$NPM_GLOBAL/bin" "$NPM_GLOBAL/lib"
  chmod -R a+rwX "$NPM_GLOBAL" 2>/dev/null || true

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

  # stdin belongs to the ACP client (or the TUI user): every setup-time sbx
  # call takes </dev/null so setup can never swallow client bytes. `sbx exec`
  # without -i demonstrably drains stdin, which used to eat Zed's `initialize`.
  if ! sbx inspect "$SANDBOX_NAME" >/dev/null 2>&1; then
    CREATE_FLAGS=(--name "$SANDBOX_NAME" --static-mcp "${staticMcpList}" "''${ENV_ARGS[@]}")
    if [ "$1" = "--clone" ]; then
      CREATE_FLAGS=(--clone "''${CREATE_FLAGS[@]}")
    fi
    if [ "$1" = "acp" ]; then
      sbx create "''${CREATE_FLAGS[@]}" opencode "$WORKSPACE_DIR" "${hooksPlugin}:ro" </dev/null >&2
    else
      sbx create "''${CREATE_FLAGS[@]}" opencode "$WORKSPACE_DIR" "${hooksPlugin}:ro" </dev/null
    fi
  fi

  # Mounts require a running sandbox (409 Conflict otherwise). The idle
  # auto-stop means it is stopped more often than not; exec auto-starts it.
  sbx exec "$SANDBOX_NAME" true </dev/null >/dev/null 2>&1 || true

  bind_mount() {
    spec="$1"
    i=0
    while [ "$i" -lt 3 ]; do
      if sbx mount "$SANDBOX_NAME" "$spec" >/dev/null 2>&1; then
        return 0
      fi
      sbx exec "$SANDBOX_NAME" true </dev/null >/dev/null 2>&1 || true
      i=$((i + 1))
    done
    echo "sbx-opencode: WARNING: mount failed after retries: $spec" >&2
    return 1
  }

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

  TOOLCHAIN_BASE="${homeDirectory}/.cache/sbx/toolchains"
  mkdir -p "$TOOLCHAIN_BASE"
  chmod a+rwX "$TOOLCHAIN_BASE" 2>/dev/null || true

  if [ -f "$WORKSPACE_DIR/go.mod" ] || [ -n "$(find "$WORKSPACE_DIR" -maxdepth 2 -name '*.go' -print -quit 2>/dev/null)" ]; then
    mkdir -p "$TOOLCHAIN_BASE/go"
    chmod -R a+rwX "$TOOLCHAIN_BASE/go" 2>/dev/null || true
    bind_mount "$TOOLCHAIN_BASE/go:/home/agent/go"
  fi

  if [ -f "$WORKSPACE_DIR/Cargo.toml" ]; then
    mkdir -p "$TOOLCHAIN_BASE/cargo" "$TOOLCHAIN_BASE/rustup"
    chmod -R a+rwX "$TOOLCHAIN_BASE/cargo" "$TOOLCHAIN_BASE/rustup" 2>/dev/null || true
    bind_mount "$TOOLCHAIN_BASE/cargo:/home/agent/.cargo"
    bind_mount "$TOOLCHAIN_BASE/rustup:/home/agent/.rustup"
  fi

  # Python: UV_CACHE covers uv/uvx; no pip cache.

  if [ -f "$WORKSPACE_DIR/package.json" ]; then
    mkdir -p "$TOOLCHAIN_BASE/npm"
    chmod -R a+rwX "$TOOLCHAIN_BASE/npm" 2>/dev/null || true
    bind_mount "$TOOLCHAIN_BASE/npm:/home/agent/.npm"
  fi

  if [ -f "$WORKSPACE_DIR/pom.xml" ] || [ -f "$WORKSPACE_DIR/build.gradle" ] || [ -f "$WORKSPACE_DIR/build.gradle.kts" ]; then
    mkdir -p "$TOOLCHAIN_BASE/gradle" "$TOOLCHAIN_BASE/m2"
    chmod -R a+rwX "$TOOLCHAIN_BASE/gradle" "$TOOLCHAIN_BASE/m2" 2>/dev/null || true
    bind_mount "$TOOLCHAIN_BASE/gradle:/home/agent/.gradle"
    bind_mount "$TOOLCHAIN_BASE/m2:/home/agent/.m2"
  fi

  # ACP (Zed) must answer `initialize` on stdout fast. A synchronous
  # Determinate Nix install blocks the handshake for minutes with zero
  # output, so Zed shows loading forever and eventually SIGKILLs us (137).
  # Background it in acp mode; keep it synchronous for interactive use.
  if [ -f "$WORKSPACE_DIR/flake.nix" ] || [ -f "$WORKSPACE_DIR/default.nix" ]; then
    if ! sbx exec "$SANDBOX_NAME" test -f /nix/var/nix/profiles/default/bin/nix </dev/null >/dev/null 2>&1; then
      if [ "$1" = "acp" ]; then
        echo "sbx-opencode: Nix not present in sandbox; bootstrapping in background, nixd appears shortly..." >&2
        sbx exec -u root "$SANDBOX_NAME" sh -c '
          curl -fsSL https://install.determinate.systems/nix | sh -s -- install linux --no-confirm --init none >/dev/null 2>&1 || true
          /nix/var/nix/profiles/default/bin/nix profile add --extra-experimental-features "nix-command flakes" nixpkgs#nixd >/dev/null 2>&1 || true
          chown -R agent:agent /nix/var/nix >/dev/null 2>&1 || true
        ' >/dev/null 2>&1 </dev/null || true &
      else
        sbx exec -u root "$SANDBOX_NAME" sh -c '
          curl -fsSL https://install.determinate.systems/nix | sh -s -- install linux --no-confirm --init none >/dev/null 2>&1 || true
          /nix/var/nix/profiles/default/bin/nix profile add --extra-experimental-features "nix-command flakes" nixpkgs#nixd >/dev/null 2>&1 || true
          chown -R agent:agent /nix/var/nix >/dev/null 2>&1 || true
        ' >/dev/null 2>&1 || true
      fi
    fi
  fi

  if [ "$1" = "acp" ]; then
    echo "sbx-opencode: starting opencode acp in $SANDBOX_NAME..." >&2
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

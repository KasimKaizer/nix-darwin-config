{
  lib,
  pkgs,
  homeDirectory,
  hooksPlugin,
  gatewayServers,
}:
let
  staticMcpList = lib.concatStringsSep "," (builtins.attrNames gatewayServers);

  # Serena revision mirrors agents.nix (host). In-container launch via uv,
  # confined strictly to the container workspace and mounted paths.
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

  CONFIG_FILE="${homeDirectory}/.config/opencode/opencode.jsonc"
  SERENA_CMD='${serenaContainerCmd}'
  ENV_ARGS=()
  if [ -f "$CONFIG_FILE" ]; then
    # Strip host-local servers (Mach-O paths can't spawn in Linux), retain mcp-gateway,
    # add in-container serena, and set mcp_timeout to allow uv to fetch on first run.
    FILTERED_CONFIG="$(jq --argjson serena_cmd "$SERENA_CMD" '
      del(.mcp[]? | select(.type == "local"))
      | .mcp["mcp-gateway"] = {type: "remote", url: "http://mcp-gateway.docker.internal/mcp", enabled: true, headers: {Authorization: "Bearer proxy-managed"}}
      | .mcp.serena = {type: "local", command: $serena_cmd, enabled: true}
      | .experimental.mcp_timeout = 120000
    ' "$CONFIG_FILE")"
    ENV_ARGS+=(-e "OPENCODE_CONFIG_CONTENT=$FILTERED_CONFIG")
  fi

  # Ensure container PATH includes toolchain binaries without dropping
  # image-provided bins (opencode itself lives under npm-global/bin).
  ENV_ARGS+=(-e "PATH=/nix/var/nix/profiles/default/bin:/home/agent/go/bin:/home/agent/.cargo/bin:/home/agent/.npm-global/bin:/home/agent/.local/bin:/usr/local/share/npm-global/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin")
  # uv defaults to hardlinking, which fails under bulk load on the virtiofs
  # bind mount (ENOENT linking into builds-v0). Copy mode keeps the shared
  # cache working from every sandbox.
  ENV_ARGS+=(-e "UV_LINK_MODE=copy")
  # Redirect global npm installs into the persisted cache below. Never mount
  # over /usr/local/share/npm-global: the image's own opencode binary lives there.
  ENV_ARGS+=(-e "NPM_CONFIG_PREFIX=/home/agent/.npm-global")

  SKILLS_CACHE="${homeDirectory}/.cache/sbx/skills"
  if [ -d "${homeDirectory}/.agents/skills" ]; then
    mkdir -p "$SKILLS_CACHE"
    rsync -aL --delete "${homeDirectory}/.agents/skills/" "$SKILLS_CACHE/"
  fi

  AUTH_CACHE="${homeDirectory}/.cache/sbx/auth"
  if [ -f "${homeDirectory}/.config/opencode/antigravity-accounts.json" ]; then
    mkdir -p "$AUTH_CACHE"
    cp "${homeDirectory}/.config/opencode/antigravity"*.json "$AUTH_CACHE/"
    chmod 644 "$AUTH_CACHE"/*.json
  fi
  if [ -f "${homeDirectory}/.config/opencode/tui.json" ]; then
    mkdir -p "$AUTH_CACHE"
    cp -L "${homeDirectory}/.config/opencode/tui.json" "$AUTH_CACHE/tui.json"
    chmod 644 "$AUTH_CACHE/tui.json"
  fi
  if [ -f "${homeDirectory}/.config/opencode/tui-preferences.jsonc" ]; then
    mkdir -p "$AUTH_CACHE"
    cp -L "${homeDirectory}/.config/opencode/tui-preferences.jsonc" "$AUTH_CACHE/tui-preferences.jsonc"
    chmod 644 "$AUTH_CACHE/tui-preferences.jsonc"
  fi
  # opencode-native google OAuth (written by `opencode auth login`). The
  # sandbox needs it: without auth.json the provider has no credential and
  # every antigravity call fails with "API key not valid". Stage google only.
  if jq -e '.google' "${homeDirectory}/.local/share/opencode/auth.json" >/dev/null 2>&1; then
    mkdir -p "$AUTH_CACHE"
    jq '{google}' "${homeDirectory}/.local/share/opencode/auth.json" > "$AUTH_CACHE/auth.json"
    chmod 644 "$AUTH_CACHE/auth.json"
  fi

  UV_CACHE="${homeDirectory}/.cache/sbx/uv"
  mkdir -p "$UV_CACHE"

  # User-owned npm prefix. Persisting it keeps plain `npm i -g
  # <language-server>` (bash-language-server, pyright,
  # vscode-langservers-extracted, typescript-language-server, ...) across
  # sandboxes; opencode resolves LSP binaries from PATH. The lib dir must
  # pre-exist: npm errors ENOENT on a bare prefix.
  NPM_GLOBAL="${homeDirectory}/.cache/sbx/npm-global"
  mkdir -p "$NPM_GLOBAL/bin" "$NPM_GLOBAL/lib"

  # Snapshot (never bind-mount) the pinned plugin packages. Host opencode
  # mutates ~/.cache/opencode/packages concurrently, and containers observe
  # stale or partial views through the shared mount: plugins silently stop
  # loading (missing models, API key errors). Plain -a keeps .bin symlinks
  # intact; -L would dereference them into breakage.
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

  # Mounts require a running sandbox (409 Conflict otherwise). The idle
  # auto-stop means it is stopped more often than not; exec auto-starts it.
  sbx exec "$SANDBOX_NAME" true >/dev/null 2>&1 || true

  bind_mount() {
    sbx mount "$SANDBOX_NAME" "$1" >/dev/null 2>&1 || true
  }

  # Staged 0644 copies: host 0600 files are unreadable by container UID 1000,
  # and single-file bind mounts go stale on the plugin's atomic rewrites.
  if [ -f "$AUTH_CACHE/antigravity.json" ]; then
    bind_mount "$AUTH_CACHE/antigravity.json:/home/agent/.config/opencode/antigravity.json"
  fi
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

  if [ -d "${homeDirectory}/.gemini" ]; then
    bind_mount "${homeDirectory}/.gemini:/home/agent/.gemini"
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

  # Language toolchain caches: auto-detected per workspace and mounted persistently
  TOOLCHAIN_BASE="${homeDirectory}/.cache/sbx/toolchains"

  # Go (go.mod or Go source files present)
  if [ -f "$WORKSPACE_DIR/go.mod" ] || [ -n "$(find "$WORKSPACE_DIR" -maxdepth 2 -name '*.go' -print -quit 2>/dev/null)" ]; then
    mkdir -p "$TOOLCHAIN_BASE/go"
    bind_mount "$TOOLCHAIN_BASE/go:/home/agent/go"
  fi

  # Rust (Cargo.toml present)
  if [ -f "$WORKSPACE_DIR/Cargo.toml" ]; then
    mkdir -p "$TOOLCHAIN_BASE/cargo" "$TOOLCHAIN_BASE/rustup"
    bind_mount "$TOOLCHAIN_BASE/cargo:/home/agent/.cargo"
    bind_mount "$TOOLCHAIN_BASE/rustup:/home/agent/.rustup"
  fi

  # Python uses uv for everything (UV_CACHE above covers downloads and
  # `uvx` runs), so no pip cache mount is needed.

  # Node / TypeScript (package.json present)
  if [ -f "$WORKSPACE_DIR/package.json" ]; then
    mkdir -p "$TOOLCHAIN_BASE/npm"
    bind_mount "$TOOLCHAIN_BASE/npm:/home/agent/.npm"
  fi

  # Java / Kotlin (Gradle or Maven present)
  if [ -f "$WORKSPACE_DIR/pom.xml" ] || [ -f "$WORKSPACE_DIR/build.gradle" ] || [ -f "$WORKSPACE_DIR/build.gradle.kts" ]; then
    mkdir -p "$TOOLCHAIN_BASE/gradle" "$TOOLCHAIN_BASE/m2"
    bind_mount "$TOOLCHAIN_BASE/gradle:/home/agent/.gradle"
    bind_mount "$TOOLCHAIN_BASE/m2:/home/agent/.m2"
  fi

  # Nix (flake.nix or default.nix present)
  if [ -f "$WORKSPACE_DIR/flake.nix" ] || [ -f "$WORKSPACE_DIR/default.nix" ]; then
    if ! sbx exec "$SANDBOX_NAME" test -f /nix/var/nix/profiles/default/bin/nix >/dev/null 2>&1; then
      sbx exec -u root "$SANDBOX_NAME" sh -c '
        curl -fsSL https://install.determinate.systems/nix | sh -s -- install linux --no-confirm --init none >/dev/null 2>&1 || true
        /nix/var/nix/profiles/default/bin/nix profile add --extra-experimental-features "nix-command flakes" nixpkgs#nixd >/dev/null 2>&1 || true
        chown -R agent:agent /nix/var/nix >/dev/null 2>&1 || true
      ' >/dev/null 2>&1 || true
    fi
  fi

  if [ "$1" = "acp" ]; then
    exec sbx exec -i "''${ENV_ARGS[@]}" "$SANDBOX_NAME" -- opencode acp "''${@:2}"
  elif [ "$1" = "--clone" ]; then
    if [ $# -gt 1 ]; then
      exec sbx run --name "$SANDBOX_NAME" "''${ENV_ARGS[@]}" opencode -- "''${@:2}"
    else
      exec sbx run --name "$SANDBOX_NAME" "''${ENV_ARGS[@]}" opencode
    fi
  else
    if [ $# -gt 0 ]; then
      exec sbx run --name "$SANDBOX_NAME" "''${ENV_ARGS[@]}" opencode -- "$@"
    else
      exec sbx run --name "$SANDBOX_NAME" "''${ENV_ARGS[@]}" opencode
    fi
  fi
''

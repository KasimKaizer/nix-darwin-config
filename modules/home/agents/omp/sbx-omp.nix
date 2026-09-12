{
  pkgs,
  homeDirectory,
  sbxLib,
  kitDir,
}:
let
  # Darwin host binaries cannot run inside the linux shell-docker sandbox, so
  # the gateway only serves these two stdio servers. context7 is copied from
  # the host mcp.json below instead.
  staticMcpList = "nix,codegraph";
in
pkgs.writeShellScriptBin "sbx-omp" ''
  PATH="${sbxLib.binPath}:$PATH"

  ${sbxLib.workspace "omp"}

  ${sbxLib.stopOnExit}

  # The sandbox is created as the built-in `shell` agent, so omp is never on
  # the entrypoint PATH; the kit installs it at this literal path.
  OMP_BIN="/home/agent/.local/bin/omp"
  ENV_ARGS=()

  # `--clone` and `acp` are wrapper modes, not omp arguments. Consuming them
  # here leaves "$@" holding exactly what omp should receive.
  MODE=""
  case "''${1:-}" in
    --clone | acp)
      MODE="$1"
      shift
      ;;
  esac

  # Cursor Run is HTTP/2 Connect-RPC, so a proxy sentinel cannot stand in for
  # the token. Re-read it each launch; nothing else from that file leaves the
  # host.
  HOST_AUTH="${homeDirectory}/.local/share/opencode/auth.json"
  CURSOR_ACCESS_TOKEN="$(jq -r '.cursor.access // empty' "$HOST_AUTH" 2>/dev/null || true)"
  if [ -n "$CURSOR_ACCESS_TOKEN" ]; then
    ENV_ARGS+=(-e "CURSOR_ACCESS_TOKEN=$CURSOR_ACCESS_TOKEN")
  fi

  if [ -n "''${EXA_API_KEY:-}" ]; then
    ENV_ARGS+=(-e "EXA_API_KEY=$EXA_API_KEY")
  fi

  ${sbxLib.containerEnv}
  ENV_ARGS+=(-e "UV_TOOL_BIN_DIR=/home/agent/.npm-global/bin")
  # Shims and venvs must share one mount. The default UV_TOOL_DIR is
  # container-local, which leaves a warm npm-global holding dangling
  # pyright/ruff launchers that `command -v` then treats as installed.
  ENV_ARGS+=(-e "UV_TOOL_DIR=/home/agent/.npm-global/uv-tools")

  ${sbxLib.skillsCache}

  ${sbxLib.ensureSharedDir}

  # Per-sandbox, and never a bind of the host agent dir: a shared directory
  # would mix agent.db across repos and a host bind would leak its credentials.
  OMP_AUTH="${homeDirectory}/.cache/sbx/omp-auth/$SANDBOX_NAME"
  mkdir -p "$OMP_AUTH"
  # On virtiofs container UID 1000 is "other", so omp needs the directory
  # itself writable to create agent.db and rename temps into place. Not -R:
  # the staged files below set their own narrower modes.
  chmod a+rwx "$OMP_AUTH"
  # The whole directory is bound, not the individual files: omp rewrites
  # config.yml by atomic rename, which leaves a single-file bind stale.
  cat > "$OMP_AUTH/config.yml" <<'EOF'
  enabledProviders: []
  mcp:
    enableProjectConfig: false
  providers:
    webSearchOrder: [exa]
  disabledProviders:
    - claude
    - codex
    - gemini
    - github
    - opencode
    - windsurf
    - cline
    - vscode
    - mcp-json
  EOF
  chmod a+rw "$OMP_AUTH/config.yml"
  # Restaged every launch so a rotated key cannot linger, which a create-time
  # `-e` value would because sbx bakes it into the sandbox spec. Never copy the
  # whole host .env: EXA_API_KEY is the only key the sandbox needs.
  rm -f "$OMP_AUTH/.env"
  if [ -n "''${EXA_API_KEY:-}" ]; then
    printf 'EXA_API_KEY=%s\n' "$EXA_API_KEY" > "$OMP_AUTH/.env"
    chmod a+rw "$OMP_AUTH/.env"
  elif [ -f "${homeDirectory}/.omp/agent/.env" ]; then
    grep -E '^EXA_API_KEY=' "${homeDirectory}/.omp/agent/.env" > "$OMP_AUTH/.env" || true
    chmod a+rw "$OMP_AUTH/.env"
  fi
  # context7 is copied as a direct http server because the gateway's remote
  # spec would drop its bearer header; nix and codegraph arrive via
  # --static-mcp on the gateway. No Serena, no code-search MCP.
  HOST_MCP="${homeDirectory}/.omp/agent/mcp.json"
  # A missing or malformed host file would fail --slurpfile and take the whole
  # program with it. /dev/null slurps as [], which the filter already handles
  # as "no context7" — so the fallback needs no second copy of the filter.
  if ! jq -e . "$HOST_MCP" >/dev/null 2>&1; then
    HOST_MCP=/dev/null
  fi
  jq -n --slurpfile host "$HOST_MCP" '
    {
      mcpServers: (
        (
          if ($host | length) > 0
            and ($host[0] | type == "object")
            and ($host[0].mcpServers | type == "object")
            and ($host[0].mcpServers.context7 | type == "object") then
            {context7: $host[0].mcpServers.context7}
          else
            {}
          end
        )
        + {
          "mcp-gateway": {
            type: "http",
            url: "http://mcp-gateway.docker.internal/mcp",
            headers: {Authorization: "Bearer proxy-managed"}
          }
        }
      )
    }
  ' > "$OMP_AUTH/mcp.json"
  chmod a+rw "$OMP_AUTH/mcp.json"

  ${sbxLib.caches}
  ensure_shared_dir "$NPM_GLOBAL/uv-tools"

  # sbx v0.39 reads the first positional as a built-in agent, so a store kit
  # path there is rejected as unknown. The kit rides along as the `--kit`
  # mixin, which is what installs omp into the image; the agent is `shell`.
  if ! sbx inspect "$SANDBOX_NAME" >/dev/null 2>&1; then
    CREATE_FLAGS=(--name "$SANDBOX_NAME" --static-mcp "${staticMcpList}" --kit "${kitDir}" "''${ENV_ARGS[@]}")
    if [ "$MODE" = "--clone" ]; then
      CREATE_FLAGS=(--clone "''${CREATE_FLAGS[@]}")
    fi
    # ACP speaks JSON-RPC on stdout, so create chatter must stay off it.
    if [ "$MODE" = "acp" ]; then
      sbx create "''${CREATE_FLAGS[@]}" shell "$WORKSPACE_DIR" >&2 || exit 1
    else
      sbx create "''${CREATE_FLAGS[@]}" shell "$WORKSPACE_DIR" || exit 1
    fi
  fi

  sbx exec "$SANDBOX_NAME" true >/dev/null 2>&1 || true

  ${sbxLib.bindMount}

  bind_mount "$OMP_AUTH:/home/agent/.omp/agent"
  # omp's `agents` provider reads ~/.agents/skills, so this bind is the whole
  # story; a second copy inside the agent dir loses to name-based dedup.
  if [ -d "$SKILLS_CACHE" ]; then
    bind_mount "$SKILLS_CACHE:/home/agent/.agents/skills:ro"
  fi
  bind_mount "$UV_CACHE:/home/agent/.cache/uv"
  bind_mount "$NPM_GLOBAL:/home/agent/.npm-global"

  ${sbxLib.toolchainMounts}

  ${sbxLib.nixInstall}

  # One exec for all of it: the round trip into the VM costs more than the
  # checks themselves. Every step is skip-if-present, so a warm shared cache
  # does no work, and a missing LSP degrades omp rather than breaking it.
  # typescript is a peer of typescript-language-server.
  SETUP_STEPS=('command -v typescript-language-server >/dev/null 2>&1 || npm i -g typescript-language-server typescript vscode-langservers-extracted bash-language-server @tailwindcss/language-server dockerfile-language-server-nodejs >/dev/null 2>&1 || true')
  if [ -n "$GO_PROJECT" ]; then
    SETUP_STEPS+=('command -v gopls >/dev/null 2>&1 || GOPATH=/home/agent/go go install golang.org/x/tools/gopls@latest >/dev/null 2>&1 || true')
  fi
  if [ -f "$WORKSPACE_DIR/pyproject.toml" ] || [ -f "$WORKSPACE_DIR/requirements.txt" ] || [ -f "$WORKSPACE_DIR/setup.py" ] || [ -f "$WORKSPACE_DIR/setup.cfg" ] || [ -f "$WORKSPACE_DIR/Pipfile" ]; then
    SETUP_STEPS+=('command -v pyright-langserver >/dev/null 2>&1 || uv tool install pyright >/dev/null 2>&1 || true')
    SETUP_STEPS+=('command -v ruff >/dev/null 2>&1 || uv tool install ruff >/dev/null 2>&1 || true')
  fi
  sbx exec "''${ENV_ARGS[@]}" "$SANDBOX_NAME" -- sh -c "$(printf '%s\n' "''${SETUP_STEPS[@]}")" >/dev/null 2>&1 || true

  # Always exec omp: `sbx run --name` would attach the `shell` agent instead.
  if [ "$MODE" = "acp" ]; then
    sbx exec -i "''${ENV_ARGS[@]}" "$SANDBOX_NAME" -- "$OMP_BIN" acp "$@"
  elif [ $# -gt 0 ]; then
    sbx exec "''${ENV_ARGS[@]}" "$SANDBOX_NAME" -- "$OMP_BIN" "$@"
  else
    sbx exec -it "''${ENV_ARGS[@]}" "$SANDBOX_NAME" -- "$OMP_BIN"
  fi
''

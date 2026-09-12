# Shell fragments shared by the sbx-* launchers (sbx-opencode, sbx-omp).
# Each attribute is a block of shell text, not a standalone script: they assume
# the order the launchers compose them in — `workspace` defines SANDBOX_NAME,
# `bindMount` and `ensureSharedDir` define the helpers `toolchainMounts` calls,
# and `containerEnv` appends to an ENV_ARGS array the launcher already declared.
{
  lib,
  pkgs,
  homeDirectory,
}:
let
  # Nix profile first, then the per-language mounts, then the image's own bins.
  containerPath = builtins.concatStringsSep ":" [
    "/nix/var/nix/profiles/default/bin"
    "/home/agent/go/bin"
    "/home/agent/.cargo/bin"
    "/home/agent/.npm-global/bin"
    "/home/agent/.local/bin"
    "/usr/local/share/npm-global/bin"
    "/usr/local/sbin"
    "/usr/local/bin"
    "/usr/sbin"
    "/usr/bin"
    "/sbin"
    "/bin"
  ];
in
{
  inherit containerPath;

  binPath = lib.makeBinPath [
    pkgs.git
    pkgs.coreutils
    pkgs.docker-sbx
    pkgs.rsync
    pkgs.jq
  ];

  # WORKSPACE_DIR plus a stable SANDBOX_NAME of "<prefix>-<dirname>-<pathhash>".
  # The hash keeps two checkouts with the same basename apart.
  workspace = prefix: ''
    if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      WORKSPACE_DIR="$(git rev-parse --show-toplevel)"
    else
      WORKSPACE_DIR="$(pwd -P)"
    fi

    RAW_NAME="$(basename "$WORKSPACE_DIR")"
    DIR_BASENAME="$(printf '%s' "$RAW_NAME" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9' '-' | sed 's/^-*//;s/-*$//' | cut -c 1-25)"
    DIR_HASH="$(printf '%s' "$WORKSPACE_DIR" | sha256sum | cut -c 1-8)"
    SANDBOX_NAME="${prefix}-''${DIR_BASENAME:-default}-''${DIR_HASH}"
  '';

  stopOnExit = ''
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
  '';

  # Mounts require a running sandbox (409 Conflict otherwise), and the idle
  # auto-stop means it is stopped more often than not; exec auto-starts it.
  bindMount = ''
    bind_mount() {
      spec="$1"
      i=0
      while [ "$i" -lt 3 ]; do
        if sbx mount "$SANDBOX_NAME" "$spec" >/dev/null 2>&1; then
          return 0
        fi
        sbx exec "$SANDBOX_NAME" true >/dev/null 2>&1 || true
        i=$((i + 1))
      done
    }
  '';

  # On virtiofs container UID 1000 is "other" on host-owned files, so the
  # shared caches must be world-writable. Only the first sweep matters —
  # everything written later is created by the container and already owned by
  # 1000 — and on a warm cache it is expensive (~50k files under .cache/sbx/uv
  # cost ~3.5s per launch). The marker lives inside the directory it describes
  # so deleting a cache re-arms the sweep.
  ensureSharedDir = ''
    ensure_shared_dir() {
      for dir in "$@"; do
        mkdir -p "$dir"
        if [ ! -e "$dir/.sbx-perms" ]; then
          chmod -R a+rwX "$dir" 2>/dev/null || true
          : > "$dir/.sbx-perms" 2>/dev/null || true
        fi
      done
    }
  '';

  containerEnv = ''
    ENV_ARGS+=(-e "PATH=${containerPath}")
    # uv defaults to hardlinking, which fails under bulk load on the virtiofs
    # bind mount (ENOENT linking into builds-v0). Copy mode keeps the shared
    # cache working from every sandbox.
    ENV_ARGS+=(-e "UV_LINK_MODE=copy")
    # Redirect global npm installs into the persisted cache below. Never mount
    # over /usr/local/share/npm-global: the image's own tooling lives there.
    ENV_ARGS+=(-e "NPM_CONFIG_PREFIX=/home/agent/.npm-global")
  '';

  caches = ''
    UV_CACHE="${homeDirectory}/.cache/sbx/uv"
    # mkdir lib: npm ENOENT on a bare prefix.
    NPM_GLOBAL="${homeDirectory}/.cache/sbx/npm-global"
    ensure_shared_dir "$UV_CACHE" "$NPM_GLOBAL" "$NPM_GLOBAL/bin" "$NPM_GLOBAL/lib"
  '';

  # Snapshot rather than bind: a shared bind lets a host agent mutate the tree
  # mid-session (stale views, silent skill load failures).
  skillsCache = ''
    SKILLS_CACHE="${homeDirectory}/.cache/sbx/skills"
    if [ -d "${homeDirectory}/.agents/skills" ]; then
      mkdir -p "$SKILLS_CACHE"
      rsync -aL --delete "${homeDirectory}/.agents/skills/" "$SKILLS_CACHE/"
    fi
  '';

  # Shared with the other launcher via one `~/.cache/sbx/toolchains` tree, so a
  # warm Go/Rust/npm cache carries across agents. Also sets GO_PROJECT, which
  # gates both the mount and any gopls install.
  toolchainMounts = ''
    TOOLCHAIN_BASE="${homeDirectory}/.cache/sbx/toolchains"
    ensure_shared_dir "$TOOLCHAIN_BASE"

    GO_PROJECT=""
    if [ -f "$WORKSPACE_DIR/go.mod" ] || [ -n "$(find "$WORKSPACE_DIR" -maxdepth 2 -name '*.go' -print -quit 2>/dev/null)" ]; then
      GO_PROJECT=1
    fi

    if [ -n "$GO_PROJECT" ]; then
      ensure_shared_dir "$TOOLCHAIN_BASE/go"
      bind_mount "$TOOLCHAIN_BASE/go:/home/agent/go"
    fi

    if [ -f "$WORKSPACE_DIR/Cargo.toml" ]; then
      ensure_shared_dir "$TOOLCHAIN_BASE/cargo" "$TOOLCHAIN_BASE/rustup"
      bind_mount "$TOOLCHAIN_BASE/cargo:/home/agent/.cargo"
      bind_mount "$TOOLCHAIN_BASE/rustup:/home/agent/.rustup"
    fi

    # Python: UV_CACHE covers uv/uvx; no pip cache.

    if [ -f "$WORKSPACE_DIR/package.json" ]; then
      ensure_shared_dir "$TOOLCHAIN_BASE/npm"
      bind_mount "$TOOLCHAIN_BASE/npm:/home/agent/.npm"
    fi

    if [ -f "$WORKSPACE_DIR/pom.xml" ] || [ -f "$WORKSPACE_DIR/build.gradle" ] || [ -f "$WORKSPACE_DIR/build.gradle.kts" ]; then
      ensure_shared_dir "$TOOLCHAIN_BASE/gradle" "$TOOLCHAIN_BASE/m2"
      bind_mount "$TOOLCHAIN_BASE/gradle:/home/agent/.gradle"
      bind_mount "$TOOLCHAIN_BASE/m2:/home/agent/.m2"
    fi
  '';

  # Rust and Nix are not in the shell-docker image. Failure is swallowed: a
  # missing nixd degrades LSP, it does not break the session.
  nixInstall = ''
    if [ -f "$WORKSPACE_DIR/flake.nix" ] || [ -f "$WORKSPACE_DIR/default.nix" ]; then
      if ! sbx exec "$SANDBOX_NAME" test -f /nix/var/nix/profiles/default/bin/nix >/dev/null 2>&1; then
        sbx exec -u root "$SANDBOX_NAME" sh -c '
          curl -fsSL https://install.determinate.systems/nix | sh -s -- install linux --no-confirm --init none >/dev/null 2>&1 || true
          /nix/var/nix/profiles/default/bin/nix profile add --extra-experimental-features "nix-command flakes" nixpkgs#nixd >/dev/null 2>&1 || true
          chown -R agent:agent /nix/var/nix >/dev/null 2>&1 || true
        ' >/dev/null 2>&1 || true
      fi
    fi
  '';
}

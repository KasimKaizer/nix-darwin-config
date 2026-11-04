{
  config,
  lib,
  pkgs,
  flakeDir,
  homeDirectory,
  ...
}:
let
  # The app and its server remain manually installed. These helpers use the
  # matching CLI that Rex puts on PATH, rather than installing another copy.
  workflow = pkgs.writeShellApplication {
    name = "rex-workflow";
    runtimeInputs = with pkgs; [
      coreutils
      findutils
      fzf
      git
      helix
      jq
    ];
    text = /* bash */ ''
      if [[ -n "''${REX_BIN_DIR:-}" ]]; then
        export PATH="$REX_BIN_DIR:$PATH"
      fi

      pick() {
        local selection status
        selection=$(fzf --read0 --prompt="$1> " --height=100% --reverse) || {
          status=$?
          case "$status" in 1|130) return 0 ;; *) return "$status" ;; esac
        }
        [[ -n "$selection" ]] || return 0
        rex --autostart=false 'do' project_open \
          --args "$(jq --null-input --compact-output --arg path "$selection" '{path: $path}')"
      }

      case "''${1:-}" in
        projects)
          {
            printf '%s\0' ${lib.escapeShellArg flakeDir}
            while IFS= read -r root; do
              [[ -d "$root" ]] || continue
              find "$root" -mindepth 1 -maxdepth 1 -type d -print0
            done < ${lib.escapeShellArg "${config.xdg.configHome}/rex/project-roots"}
          } | sort --zero-terminated --unique | pick project
          ;;
        worktrees)
          git rev-parse --show-toplevel > /dev/null
          git worktree list --porcelain -z | {
            while IFS= read -r -d "" record; do
              case "$record" in
                'worktree '*)
                  path="''${record#worktree }"
                  [[ -d "$path" ]] && printf '%s\0' "$path"
                  ;;
              esac
            done
          } | pick worktree
          ;;
        scrollback)
          umask 077
          capture=$(mktemp -t rex-scrollback.XXXXXXXX)
          trap 'rm -f -- "$capture"' EXIT
          rex --autostart=false capture --session "$2" --block "$3" \
            --trim --unwrap > "$capture"
          hx "$capture"
          ;;
        resume-opencode)
          # Choose an exact conversation; --continue could pick another agent's.
          sessions=$(opencode session list --format json)
          selected=$(jq --raw-output '.[] | [.id, (.title // .id), .directory] | @tsv' <<< "$sessions" |
            fzf --delimiter=$'\t' --with-nth=2.. --prompt='resume OpenCode> ' --reverse) || {
              status=$?
              case "$status" in 1|130) exit 0 ;; *) exit "$status" ;; esac
            }
          [[ -n "$selected" ]] || exit 0
          exec opencode --session "''${selected%%$'\t'*}"
          ;;
        *)
          echo 'Usage: rex-workflow projects|worktrees|scrollback SESSION BLOCK|resume-opencode' >&2
          exit 2
          ;;
      esac
    '';
  };
in
{
  # Run after the Nix/oh-my-zsh PATH setup, without affecting other terminals.
  programs.zsh.initContent = lib.mkOrder 2100 /* zsh */ ''
    if [[ -n "$REX_BIN_DIR" ]]; then
      export PATH="$REX_BIN_DIR:$PATH"
    fi
  '';

  home.packages = lib.lists.singleton workflow;

  xdg.configFile."rex/project-roots".text = lib.concatLines [
    "${homeDirectory}/Developer/projects"
    "${homeDirectory}/Developer/web-projects"
    "${homeDirectory}/Developer/IdeaProjects"
    "${homeDirectory}/Developer/Exercism"
  ];

  xdg.configFile."rex/init.lua".text = /* lua */ ''
    -- Native Rex shortcuts stay intact. Extra workflows are also in the palette.
    local workflow = ${builtins.toJSON (lib.getExe workflow)}
    local state_dir = ${builtins.toJSON "${config.xdg.stateHome}/rex"}
    local shell = "com.superlogical.terminal.shell"
    local terminal = "com.superlogical.terminal"

    local function checked(value, err)
      if err ~= nil then error(tostring(err), 0) end
      return value
    end

    local function cwd(ctx)
      if not ctx.block_id then error("Focus a terminal first", 0) end
      local process = checked(rex.block.call(terminal, "process", { block_id = ctx.block_id }))
      local path = (process.foreground or {}).cwd or (process.child or {}).cwd
      if not path or path == "" then error("Cannot determine the terminal directory", 0) end
      return path
    end

    local function block(path, command, label)
      return { block = {
        flavor = shell,
        label = label,
        options = { cwd = path, command = command },
      } }
    end

    local function floating(ctx, command, label)
      return checked(rex.session.new_layer{
        bounds = { 0.1, 0.1, 0.8, 0.8 },
        focus = true,
        layout = block(cwd(ctx), command, label),
      })
    end

    -- Persist paths -> stable session IDs. Labels can change when agents rename
    -- their sessions, and different project roots can contain identical names.
    rex.action{
      name = "project_open",
      title = "Open Project Directory",
      category = "Workflow",
      args = { path = "string" },
      run = function(ctx, args)
        local resolved = rex.exec{ "${lib.getExe' pkgs.coreutils "realpath"}", "--canonicalize-existing", args.path }
        if not resolved or not resolved.ok then error("Project directory does not exist", 0) end
        local path = resolved.stdout:gsub("\n$", "")
        local directory = rex.exec{ "${lib.getExe' pkgs.coreutils "test"}", "-d", path }
        if not directory or not directory.ok then error("Project path is not a directory", 0) end
        local mkdir = rex.exec{ "${lib.getExe' pkgs.coreutils "mkdir"}", "--parents", "--mode=700", state_dir }
        if not mkdir or not mkdir.ok then error("Cannot create Rex workflow state directory", 0) end
        local registry_path = state_dir .. "/project-sessions.json"
        local registry = {}
        local file = io.open(registry_path, "r")
        if file then
          registry = rex.json.decode(file:read("*a"))
          file:close()
          if type(registry) ~= "table" then error("Invalid Rex project registry", 0) end
        end
        local sessions = checked(rex.call("session.list"))
        local session_id
        for _, session in ipairs(sessions.sessions or {}) do
          if session.session_id == registry[path] then session_id = session.session_id end
        end
        if not session_id then
          local created = checked(rex.call("session.create", {
            label = path:match("([^/]+)$"),
            initial_windows = { { layout = block(path) } },
          }))
          session_id = created.session_id
          registry[path] = session_id
          local temporary = registry_path .. ".tmp"
          local output = assert(io.open(temporary, "w"))
          assert(output:write(rex.json.encode(registry)))
          assert(output:close())
          assert(os.rename(temporary, registry_path))
        end
        if ctx.origin == "key" or ctx.origin == "palette" then
          -- Defer UI work until the app's action callback has returned.
          rex.client.queue("session.select", { session_id = session_id })
        else
          -- CLI callers may have no app attached. Target the originating
          -- session's apps when known, rather than switching unrelated clients.
          local apps = checked(rex.call("client.list", { kinds = { "app" }, session_id = ctx.session_id }))
          for _, app in ipairs(apps.clients or {}) do
            checked(rex.call("client.perform", {
              client_id = app.client_id,
              action = "session.select",
              args = { session_id = session_id },
              origin = ctx.origin,
            }))
          end
        end
        return { session_id = session_id, path = path }
      end,
    }

    rex.action{
      name = "project_picker", title = "Switch Project…", category = "Workflow",
      run = function(ctx) return floating(ctx, { workflow, "projects" }, "Projects") end,
    }
    rex.action{
      name = "worktree_picker", title = "Switch Git Worktree…", category = "Workflow",
      run = function(ctx) return floating(ctx, { workflow, "worktrees" }, "Worktrees") end,
    }
    rex.action{
      name = "floating_shell", title = "Open Floating Shell", category = "Workflow",
      run = function(ctx) return floating(ctx, nil, "Shell") end,
    }
    rex.action{
      name = "scrollback_viewer", title = "Inspect Scrollback in Helix", category = "Workflow",
      run = function(ctx)
        return floating(ctx, { workflow, "scrollback", ctx.session_id, ctx.block_id }, "Scrollback")
      end,
    }

    -- Starting agents is explicit; opening a project starts only a login shell.
    local layouts = {
      { "coding_layout", "Open Coding Layout", nil },
      { "codex_layout", "Open Codex and Shell", { "codex" } },
      { "opencode_layout", "Open OpenCode and Shell", { "opencode" } },
      { "resume_codex", "Resume Codex Conversation…", { "codex", "resume" } },
      { "resume_opencode", "Resume OpenCode Conversation…", { workflow, "resume-opencode" } },
    }
    for _, entry in ipairs(layouts) do
      local command = entry[3]
      local title = entry[2]
      rex.action{
        name = entry[1], title = title, category = "Workflow",
        run = function(ctx)
          local path = cwd(ctx)
          return checked(rex.session.new_window{
            window_label = title,
            layout = rex.layout.horizontal(0.7, block(path, command), block(path)),
          })
        end,
      }
    end

    rex.bind("ctrl+cmd+p", "project_picker")
    rex.bind("ctrl+cmd+w", "worktree_picker")
    rex.bind("ctrl+cmd+enter", "floating_shell")
    rex.bind("ctrl+cmd+h", "scrollback_viewer")
  '';
}

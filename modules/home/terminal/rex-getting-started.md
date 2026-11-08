<!--# Getting started with Rex-->

This guide explains the Rex trial setup in this repository: how to get working,
organize projects, run several agents, and use the configured shortcuts and tools.
Rex runs alongside Ghostty + Zellij while you evaluate it.

Start with [your first session](#your-first-session). Use the rest as a reference.

## What this setup provides

| Feature                 | What you get                                                      |
| ----------------------- | ----------------------------------------------------------------- |
| Project picker          | Choose a directory and open or return to its Rex session          |
| Worktree picker         | Choose an existing Git worktree and open or return to its session |
| Coding layouts          | Two terminals side by side, optionally starting Codex or OpenCode |
| Floating shell          | An extra terminal over the current workspace                      |
| Scrollback viewer       | A snapshot of a terminal's output, opened in Helix                |
| Conversation resume     | Pick a saved Codex or OpenCode conversation                       |
| Agent workspace control | Guidance for agents to use Rex; a SessionStart hook for Codex     |
| Native navigation       | Rex's default keys, with four additional workflow shortcuts       |

You install and update Rex manually. Appearance, glass effects, font, cursor,
sidebar, and Rex notification preferences are configured in the app. Nix manages
the Lua workflows and agent configuration described here. The existing terminal
launch shortcut still opens Ghostty.

## Your first session

### 1. Apply the repository configuration

If these changes have not been applied yet, run this yourself from an existing
terminal:

```sh
nixswitch
```

Open Rex, or open a fresh shell pane in an already running Rex. A fresh shell
picks up the new initialization and commands. Inside that Rex terminal, run:

```sh
command -v rex
command -v rex-workflow
command -v wt
rex config check
rex config reload
```

The first three commands should print executable paths. The check should report
no config errors. Reload tells the server to use the generated Lua file; Rex does
not watch it for changes. Rex supplies its own matching CLI, so you do not need
to install a second copy.

### 2. Enable app control and notifications

Open Settings with **Command+,**.

- In **Server**, enable **Remote Control**. The project/worktree pickers use it
  to ask the app to display the selected session. Agents also need it for app
  actions such as switching the displayed session.
- In **Notifications**, enable completion and needs-attention notifications.
  Allow Rex notifications in macOS when requested.
- Keep your existing glass and visual choices. To match Ghostty, choose
  **JetBrainsMono Nerd Font Mono, 15pt** under terminal typography.

For Codex, start a session and use **`/hooks`** to approve the Rex SessionStart
hook. It supplies Rex context and session-naming guidance. It does not restore
conversations after a reboot. Agent authentication remains your usual manual setup.

### 3. Open a project

1. Focus an ordinary, ready shell in Rex.
2. Press **Control+Command+P**.
3. Type part of the project's name or path.
4. Press **Enter** on the desired directory.

The picker opens the project's session, creating one with a shell in that
directory if necessary. Later selections return to the same session, including
its existing tabs and programs. **Escape** cancels the picker.

The picker lists immediate subdirectories of:

```text
~/Developer/projects
~/Developer/web-projects
~/Developer/IdeaProjects
~/Developer/Exercism
```

It also includes this Nix configuration repository. Missing roots are skipped.
It does not recursively discover every nested repository.

### 4. Open a useful layout

Press **Command+Shift+P** for the command palette and search for:

- **Open Coding Layout** — two shells, with 70% of the width on the left.
- **Open Codex and Shell** — Codex on the left, shell on the right.
- **Open OpenCode and Shell** — OpenCode on the left, shell on the right.

Each action creates a **new tab** in the current session. Both panes start in
the directory of the terminal you focused. Existing tabs are kept. In the second
pane, run tests, inspect code with `hx`, or open `lazygit`.

Choosing a project alone starts only a shell. An agent starts when you launch
one yourself or choose an agent layout.

## Sessions, tabs, panes, and conversations

| Term               | Meaning in daily use                                                    |
| ------------------ | ----------------------------------------------------------------------- |
| Rex session        | A workspace for a project or worktree                                   |
| Tab                | One terminal arrangement within that session                            |
| Pane               | An individual terminal running a shell, agent, editor, or other program |
| Floating pane      | A terminal displayed over the tab's other panes                         |
| Agent conversation | The agent's own saved chat history, separate from a Rex session         |

A `website` session might have a coding tab with Codex beside a shell, plus a
development-server tab. A `website-login-fix` session can hold another agent
working in a separate Git worktree.

The CLI calls a tab a **window** and a terminal pane a **block**. An ordinary
macOS application window is a different thing. These CLI terms appear in command
output and agent instructions.

## Shortcut reference

**Command = ⌘ · Option = ⌥ · Control = ⌃ · Shift = ⇧**

These are Rex defaults. App-recorded shortcuts can override both defaults and
Lua bindings. Check Settings or the palette for your installed build.

| Task                        | Shortcut                            |
| --------------------------- | ----------------------------------- |
| Find an action              | `⌘⇧P`                               |
| Switch session              | `⌘K`                                |
| New session                 | `⌘⇧N`                               |
| New tab                     | `⌘T`                                |
| Next / previous tab         | `Control+Tab` / `Control+Shift+Tab` |
| Go to a numbered tab        | `⌘1` through `⌘9`                   |
| Split right / below         | `⌘D` / `⌘⇧D`                        |
| Split using best fit        | `⌘Return`                           |
| Focus a pane by direction   | `⌘⌥Arrow`                           |
| Next / previous pane        | `⌘]` / `⌘[`                         |
| Zoom / restore focused pane | `⌘⇧Return`                          |
| Close pane / tab            | `⌘W` / `⌘⌥W`                        |
| Activity overview           | `⌘.`                                |
| Toggle sidebar              | `⌘/`                                |
| Settings                    | `⌘,`                                |

The four additions from this repository are:

| Configured workflow         | Shortcut   |
| --------------------------- | ---------- |
| Switch Project              | `⌃⌘P`      |
| Switch Git Worktree         | `⌃⌘T`      |
| Open Floating Shell         | `⌃⌘Return` |
| Inspect Scrollback in Helix | `⌃⌘H`      |

Layouts and resume actions are available through the palette without custom
shortcuts. Learn pane focus and zoom first: they make a busy workspace easier to
read without closing anything.

## Work with Zed, Helix, and terminal agents

### Zed beside Rex

Open a project in Zed as usual and choose the same project in Rex. Use Zed for
editing and ACP conversations; use Rex for shell commands, tests, logs, and
terminal agents. Rex does not embed Zed or turn its ACP conversations into panes.

A Zed agent and a Rex agent editing the same directory share the same working
files. Give independent coding tasks different worktrees.

### Helix in a pane

Choose **Open Coding Layout**, run `hx` in one pane, and keep a shell or agent
beside it. Rex's pane shortcuts move between terminals; Helix's navigation works
inside the editor. Use pane zoom when you want the editor to fill the tab.

### Cursor and Antigravity

Launch their TUIs in ordinary Rex shells with your normal commands. Dedicated
launch/resume actions are configured for Codex and OpenCode only. Cursor and
Antigravity can still use the Rex CLI when their tools and permissions allow it.
Their authentication, history, and resume commands remain agent-specific.

## Run several agents using worktrees

Rex separates terminals. **Git worktrees separate working files.** Agents in
different tabs of the same checkout can still overwrite each other's edits.

For independent tasks, use one worktree and Rex session per task. From a shell
in the relevant repository:

```sh
git status --short
wt list
wt switch --create login-fix
pwd
git branch --show-current
```

The creation command makes a branch and worktree, then changes the shell into it
through the configured Zsh integration. By default, Worktrunk uses the default
branch as the base. To explicitly start from your current branch instead:

```sh
wt switch --create --base @ login-fix
```

Those are alternative creation commands. Choose one, and follow any repository
rules requiring approval before creating branches or worktrees.

Creating a worktree does not create a Rex session or move every pane into the
new directory. After creating it:

1. Keep that shell focused and press **Control+Command+T**.
2. Select the new worktree's directory.
3. Choose an agent layout in its Rex session.
4. Give the agent its task.
5. Repeat for another independent task.

The Rex picker selects **existing** worktrees; it does not create or remove
them. `wt` handles that part. New worktrees may need dependency installation, and
simultaneous development servers may need different ports.

Review and integrate each task through your normal Git workflow. Check a
worktree's `git status` before considering removal. Removing a worktree and
closing a Rex session are separate operations.

## Let agents help manage Rex

A useful first request for an agent running in Rex is:

> Run `rex skill show` and use the installed version's guide. You may arrange
> tabs and panes, name the session, and switch the displayed session when that
> helps with my task.

The shared skill-routing configuration also directs agents to the guide when
working in Rex. Codex receives the SessionStart hook after you trust it.
Permissions still apply; Rex integration does not bypass them. Built-in
integrations are not identical across agent products.

Examples of useful requests:

- “Run the tests in a pane beside you and inspect the failures.”
- “Start the development server in a separate tab and verify it is ready.”
- “Open a Git diff in another tab so I can review your changes.”
- “Name this session after the project and task.”
- “Show the session for the worktree you created.”
- “Close the temporary panes you opened for this task.”

An agent can start a command in a new pane or type into an existing pane. Name
the target session, tab, or task clearly. Input sent to an existing pane goes to
whatever is running there, including an editor or agent rather than a shell.

Use **Command+.** to follow activity. Reporting depends on each program's
terminal integration; it does not automatically cover every GUI or ACP chat.
Codex is configured to emit completion and approval notifications when unfocused.
Rex and macOS must also allow them. Choose indicators, badges, and sounds in Rex.

## Use the floating shell

Focus a terminal and press **Control+Command+Return**. A floating shell opens in
that terminal's directory, over the current tab. Use it for a quick command,
`lazygit`, or looking at a file with `hx`. Finish with `exit` to close the shell.
Closing a pane also ends programs running in it.

The shortcut creates a new shell each time; it is not a reusable scratch-shell
toggle. Find float, dock, or minimize actions in the palette for existing panes.
Availability depends on the Rex build.

## Inspect scrollback in Helix

Focus the terminal whose output you want and press **Control+Command+H**. Rex
captures it and opens a snapshot in a floating Helix pane.

- Use `/` to search and `n` / `N` for the next / previous match.
- Use normal Helix movement and selection commands to inspect or copy text.
- Use `:quit` to leave, or `:quit!` to discard edits if you changed the snapshot.
- To keep a copy, use `:write path/to/saved-output.txt` before leaving.

The temporary capture is deleted when the helper exits. New output does not
appear in the snapshot. Only retained output is available. A full-screen TUI on
the alternate screen yields its current screen rather than earlier shell output.

## Resume conversations and understand recovery

### Manually resume Codex or OpenCode

1. Open the project's or worktree's Rex session.
2. Focus a shell in the appropriate directory.
3. Open the palette and choose **Resume Codex Conversation…** or
   **Resume OpenCode Conversation…**.
4. Select the saved conversation.

The action opens a new tab with the agent on the left and a shell on the right.
The helper supplies no new prompt. Check the restored conversation, then give
your next instruction.

Codex uses its native `codex resume` picker. OpenCode lists saved sessions by
title and directory, then launches `opencode --session` with the selected ID.
Pick deliberately when several agents worked in the same repository.

| Agent           | Configured resume support                                     |
| --------------- | ------------------------------------------------------------- |
| Codex           | Native saved-conversation picker                              |
| OpenCode        | Saved-session picker showing title and directory              |
| Cursor TUI      | No dedicated helper; use Cursor's supported resume flow       |
| Antigravity TUI | No dedicated helper; use Antigravity's supported resume flow  |
| Zed ACP         | Managed in Zed; these actions do not restore its ACP sessions |

### What survives an interruption

| Event                                        | Expected behavior                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Change tabs or sessions                      | Existing programs keep running                                                              |
| Close the app while its server remains alive | Programs can keep running on the server                                                     |
| Mac sleeps                                   | Local work cannot be relied on to keep progressing                                          |
| Server stops or Mac reboots                  | Programs end; supported versions restore the workspace as fresh shells in saved directories |
| Close a pane, tab, or session                | Its affected programs end; this differs from closing the client app                         |

Built-in workspace recovery saves tabs, splits, names, and directories. It does
not restart agents with conversation context. Agent history comes from the
agent's own saved conversation, selected through the resume workflow above.
Workspace recovery arrived in Preview 23; the first restart from an older server
that saved no state cannot recover that earlier workspace.

**Automatically reopening each agent's exact conversation is not configured.**
Neither is automatic prompting to continue interrupted work. After a server
restart or reboot, use the resume actions. Earlier terminal scrollback is not
recovered by this configuration.

## Useful CLI commands

Run these in a shell inside Rex. Context variables identify its session and
terminal. Replace `BLOCK_ID` and `CLIENT_ID` with actual IDs from inspection.

```sh
rex ls
rex session inspect --json
rex client ls
rex actions
```

`rex actions` lists server actions. To discover an app's actions, copy its client
ID from `rex client ls` and run `rex --client CLIENT_ID actions`.

Open a Git diff in a new tab, retaining its output after Git exits:

```sh
rex window new Review --cwd "$PWD" --keep-open -- git --no-pager diff
```

Open a shell below the current pane, or capture a known pane's retained output:

```sh
rex split --split=below --cwd "$PWD"
rex capture --block BLOCK_ID --trim --unwrap
```

Configured actions can also be called by name:

```sh
rex do coding_layout
rex do floating_shell
rex do resume_codex
rex do resume_opencode
```

Actions using the current directory need a terminal context. Use `rex --help`,
`rex window new --help`, `rex split --help`, and `rex skill show` for the installed
version's command details.

## Customize the setup permanently

| Change                                                  | Source of truth                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| Lua actions, extra keys, layouts, project roots         | [rex.nix](rex.nix)                                                   |
| Worktrunk and its shell integration                     | [tools/git.nix](../tools/git.nix)                                    |
| Codex hook and notification emission                    | [agents/codex.nix](../agents/codex.nix)                              |
| Agent guidance for Rex                                  | [shared skill routing](../agents/skills/using-agent-skills/SKILL.md) |
| Font, glass, themes, cursor, sidebar, app notifications | Rex Settings                                                         |
| App version                                             | Manual installation and Rex's update mechanism                       |

Home Manager generates `~/.config/rex/init.lua` and `rex/project-roots`. Make
permanent changes in `rex.nix`, apply with `nixswitch`, and run `rex config check`
followed by `rex config reload` inside Rex.

The directory-to-session registry lives at
`~/.local/state/rex/project-sessions.json` with this flake's current XDG settings.
It lets pickers find sessions after agents rename them. Same-named directories
get separate IDs, though their initial displayed names can match. Deleted
sessions are recreated on the next selection. Moving or renaming a project
directory changes its identity; associations are not migrated automatically.

## Troubleshooting

| Symptom                                               | Check                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `rex: command not found`                              | Open a fresh Rex shell; inspect `printf '%s\n' "$REX_BIN_DIR"` and `command -v rex`. Shell startup must preserve Rex's CLI directory |
| `rex-workflow` or `wt` is missing                     | Apply the configuration and open a fresh shell                                                                                       |
| Custom actions or keys are missing                    | Run `rex config check`, then `rex config reload`; inspect configured bindings with `rex keymap`                                      |
| A binding does something else                         | App-recorded shortcuts in Rex Settings take priority over Lua                                                                        |
| Project is missing from the picker                    | Check roots; only immediate child directories and the flake path are listed                                                          |
| Worktree picker reports no Git repository             | Focus a shell inside the intended repository                                                                                         |
| Picker cannot display the selected session            | Enable Remote Control and keep the originating app attached to the session                                                           |
| No focused terminal or directory cannot be determined | Focus a ready shell in the intended directory; wait for startup to finish, then retry                                                |
| Agent launcher cannot find its command                | Check `command -v codex` or `command -v opencode` in a fresh Rex shell                                                               |
| Agent does not know Rex                               | Ask it to run `rex skill show`; check Codex's `/hooks` approval                                                                      |
| Completion notifications are missing                  | Check the agent's support, Rex settings, and macOS permission; Codex alerts are configured for unfocused work                        |
| Saved conversation is missing                         | Check the agent's saved history and the project/worktree; Rex workspace state is not the conversation archive                        |
| Old output is absent from the viewer                  | Check the pane, retained history, alternate-screen TUI, and whether the server restarted                                             |

Use `rex config reload` for Lua changes. A server restart interrupts running
programs and is not a routine configuration-reload step.

## Try this over your first few sessions

1. Pick a project, open an agent layout, and run a command beside it. Practice
   pane focus and zoom.
2. Keep Zed beside Rex. Try the floating shell and scrollback viewer when useful.
3. Create a worktree for a second independent task, open its Rex session, and
   follow both agents in the activity view.
4. Manually resume a completed conversation. You do not need to stop the server
   or reboot to test a resume action.

## Remote work later

This configuration uses your Mac's local server. A seedbox could eventually host
a personal Rex server without root access if the host supports the executable
and permits persistent user processes. Its ability to run agents and project
tools must also be checked. It is not connected by the current config.

Local work does not automatically move to the seedbox. Revisit remote access
when you need tasks to keep running independently of your Mac.

## Further reading

Checked against this repository and Rex documentation on 2026-11-04. Rex is a
beta; the installed palette and CLI help establish what your build supports.

- [Rex documentation](https://www.superlogical.com/rex/docs)
- [Configuration and validation](https://www.superlogical.com/rex/docs/customize/config)
- [Mac actions and default shortcuts](https://www.superlogical.com/rex/docs/reference/mac-actions)
- [Agent integration](https://www.superlogical.com/rex/docs/automate/agent-skill)
- [CLI and targeting](https://www.superlogical.com/rex/docs/automate/cli)
- [Personal and other server modes](https://www.superlogical.com/rex/docs/linux/server-modes)
- [Worktrunk documentation](https://worktrunk.dev/)

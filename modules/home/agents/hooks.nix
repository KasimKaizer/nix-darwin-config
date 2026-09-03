{
  inputs,
  pkgs,
}:
let
  omoSrc = inputs.oh-my-openagent;

  # Disabled OMO hooks (56 total - 20 kept - no-sisyphus-gpt, which upstream
  # says not to disable). Files stay on disk: plugin imports are static.
  omoDisabledHooks = [
    # Session
    "session-notification"
    "auto-update-checker"
    "startup-toast"
    "codegraph-bootstrap"
    "ast-grep-sg-provision"
    "agent-usage-reminder"
    "interactive-bash-session"
    "delegate-task-retry"
    "ulw-execute"
    "prometheus-md-only"
    "no-hephaestus-non-gpt"
    "hephaestus-agents-md-injector"
    "goal"
    "legacy-plugin-toast"
    # Tool guard
    "comment-checker"
    "question-label-truncator"
    "directory-agents-injector"
    "directory-readme-injector"
    "rules-injector"
    "team-tool-gating"
    "tasks-todowrite-disabler"
    "hashline-read-enhancer"
    "todo-description-override"
    "webfetch-redirect-guard"
    "fsync-skip-warning"
    # Transform
    "claude-code-hooks"
    "keyword-detector"
    "monitor-status-injector"
    "tool-pair-validator"
    # Continuation
    "todo-continuation-enforcer"
    "background-notification"
    "atlas"
    "unstable-agent-babysitter"
    # Skill
    "category-skill-reminder"
    "auto-slash-command"
  ];

  # Full upstream tree, no deletions. Unwanted hooks stay off via disabled_hooks.
  omoHooks = pkgs.runCommand "omo-hooks" { } ''
    cp -r ${omoSrc} $out
    chmod -R u+w $out

    substituteInPlace $out/packages/omo-opencode/src/hooks/notepad-write-guard/index.ts \
      --replace-fail ".sisyphus/notepads" "docs/plans/notepads" \
      --replace-warn ".omo/notepads" "docs/plans/notepads"

    substituteInPlace $out/packages/omo-opencode/src/hooks/sisyphus-junior-notepad/constants.ts \
      --replace-fail "NOTEPAD PATH: .omo/notepads/{plan-name}/" "NOTEPAD PATH: docs/plans/notepads/{plan-name}/" \
      --replace-fail "PLAN PATH: .omo/plans/{plan-name}.md" "PLAN PATH: docs/plans/{plan-name}.md" \
      --replace-quiet ".omo/notepads" "docs/plans/notepads" \
      --replace-quiet ".omo/plans" "docs/plans"

    if grep -q "\.omo" $out/packages/omo-opencode/src/hooks/write-existing-file-guard/tool-execute-before-handler.ts; then
      substituteInPlace $out/packages/omo-opencode/src/hooks/write-existing-file-guard/tool-execute-before-handler.ts \
        --replace-warn "\.omo" "docs/plans"
    fi

    substituteInPlace $out/packages/omo-opencode/src/hooks/plan-format-validator/hook.ts \
      --replace-fail ".omo/plans/" "docs/plans/"
  '';
in
{
  inherit omoHooks omoDisabledHooks;
}

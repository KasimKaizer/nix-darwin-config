{
  inputs,
  pkgs,
}:
let
  # Core hooks, patched from .omo/.sisyphus to docs/plans
  omoHooksCore = pkgs.runCommand "omo-hooks-core" { } ''
    cp -r ${inputs.oh-my-openagent} $out
    chmod -R u+w $out
    substituteInPlace $out/packages/omo-opencode/src/hooks/notepad-write-guard/index.ts --replace-fail ".sisyphus/notepads" "docs/plans/notepads" --replace ".omo/notepads" "docs/plans/notepads"
    substituteInPlace $out/packages/omo-opencode/src/hooks/sisyphus-junior-notepad/constants.ts --replace-fail ".omo/notepads" "docs/plans/notepads" --replace-fail ".omo/plans" "docs/plans" --replace-fail "NOTEPAD PATH: .omo/notepads/{plan-name}/" "NOTEPAD PATH: docs/plans/notepads/{plan-name}/" --replace-fail "PLAN PATH: .omo/plans/{plan-name}.md" "PLAN PATH: docs/plans/{plan-name}.md"
    if grep -q "\.omo" $out/packages/omo-opencode/src/hooks/write-existing-file-guard/tool-execute-before-handler.ts; then
      substituteInPlace $out/packages/omo-opencode/src/hooks/write-existing-file-guard/tool-execute-before-handler.ts --replace "\.omo" "docs/plans"
    fi
    if grep -qr "boulder\.json" $out/packages/omo-opencode; then
      grep -rIl "boulder\.json" $out/packages/omo-opencode | xargs -I{} substituteInPlace {} --replace ".omo/boulder.json" "docs/plans/boulder.json" --replace ".omo" "docs/plans"
    fi
  '';
  # Guard hooks
  omoHooksGuard = pkgs.runCommand "omo-hooks-guard" { } ''
    cp -r ${inputs.oh-my-openagent} $out
    chmod -R u+w $out
  '';
in
{
  inherit omoHooksCore omoHooksGuard;
}

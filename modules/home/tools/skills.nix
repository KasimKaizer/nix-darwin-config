{ lib, ... }:
# Agent Skills live in the repo at `skills/`. Every directory there that
# contains SKILL.md is linked to ~/.agents/skills/<name>.
#
# Add or edit a skill under `skills/<name>/SKILL.md`, then `nixswitch`.
# Keep the folder flat: Zed only scans one level deep.
let
  skillsRoot = ../../../skills;

  skillDirs = lib.filterAttrs (
    name: type: type == "directory" && builtins.pathExists (skillsRoot + "/${name}/SKILL.md")
  ) (builtins.readDir skillsRoot);
in
{
  home.file = lib.mapAttrs' (name: _: {
    name = ".agents/skills/${name}";
    value.source = skillsRoot + "/${name}";
  }) skillDirs;
}

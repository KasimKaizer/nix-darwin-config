{ pkgs, ... }:
{
  imports = [
    ./helix/settings.nix
    ./helix/languages.nix
  ];

  # Helix-only tooling. Shared servers and formatters (gopls, tsgo, prettier,
  # markdown-oxide, …) live in zed.nix; this module only adds what Helix needs on top.
  home.packages = with pkgs; [
    vscode-langservers-extracted
    taplo
    dockerfile-language-server
    dockerfmt
  ];
}

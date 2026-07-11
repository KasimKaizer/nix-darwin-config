{
  inputs,
  username,
  system,
  ...
}:
# Installs and pins Homebrew via the nix-homebrew flake input.
# Imported from flake.nix after nix-homebrew.darwinModules.nix-homebrew.
{
  nix-homebrew = {
    enable = true;
    enableRosetta = system == "aarch64-darwin";
    user = username;
    autoMigrate = true;
    taps = {
      "homebrew/homebrew-core" = inputs.homebrew-core;
      "homebrew/homebrew-cask" = inputs.homebrew-cask;
      "homebrew/homebrew-bundle" = inputs.homebrew-bundle;
    };
    mutableTaps = false;
  };
}

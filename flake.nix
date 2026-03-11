{
  description = "Kasim's Darwin system flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

    darwin.url = "github:LnL7/nix-darwin";
    darwin.inputs.nixpkgs.follows = "nixpkgs";

    home-manager.url = "github:nix-community/home-manager/master";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";

    openclaw.url = "github:openclaw/nix-openclaw";
  };

  outputs =
    inputs @ { self
    , home-manager
    , darwin
    , nixpkgs
    , openclaw
    , ...
    }: {
      # Build darwin flake using:
      # $ darwin-rebuild build --flake .#simple
      darwinConfigurations.inferno = darwin.lib.darwinSystem {
        system = "aarch64-darwin";
        pkgs = import nixpkgs {
          system = "aarch64-darwin";
          config = {
            allowUnfree = true;
            permittedInsecurePackages = [
              "openclaw-2026.2.26"
            ];
          };
          overlays = [
            openclaw.overlays.default
          ];
        };

        modules = [
          ./modules/darwin
          home-manager.darwinModules.home-manager
          {
            home-manager = {
              useGlobalPkgs = true;
              useUserPackages = true;
              users.ew.imports = [
                openclaw.homeManagerModules.openclaw
                ./modules/home-manager
              ];
            };
          }
        ];
      };
    };
}

{
  description = "Kasim's Darwin system flake";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";

    darwin.url = "github:nix-darwin/nix-darwin";
    darwin.inputs.nixpkgs.follows = "nixpkgs";

    home-manager.url = "github:nix-community/home-manager/master";
    home-manager.inputs.nixpkgs.follows = "nixpkgs";

    sops-nix.url = "github:Mic92/sops-nix";
    sops-nix.inputs.nixpkgs.follows = "nixpkgs";

    nix-homebrew.url = "github:zhaofengli/nix-homebrew";
    homebrew-core = {
      url = "github:homebrew/homebrew-core";
      flake = false;
    };
    homebrew-cask = {
      url = "github:homebrew/homebrew-cask";
      flake = false;
    };
    homebrew-bundle = {
      url = "github:homebrew/homebrew-bundle";
      flake = false;
    };
  };

  outputs =
    inputs@{
      home-manager,
      darwin,
      nixpkgs,
      nix-homebrew,
      ...
    }:
    let
      inherit (nixpkgs) lib;

      # Single source of truth for every machine this flake manages.
      # To add a host: add an entry here and create `hosts/<hostname>/`.
      hosts = {
        inferno = {
          system = "aarch64-darwin";
          username = "ew";
          timezone = "Asia/Calcutta";
          # Optional: override clone path used by nixswitch / nixup
          # (default: /Users/<username>/.config/nix-darwin-config).
          # flakeDir = "/Users/ew/.config/nix-darwin-config";
        };
      };

      # Build a darwinSystem from a host entry. `hostname` is the attr key.
      # Optional per-host `flakeDir` overrides the default clone path used by
      # shell aliases (nixswitch / nixup).
      mkDarwin =
        hostname: host:
        let
          inherit (host) system username timezone;
          homeDirectory = "/Users/${username}";
          flakeDir = host.flakeDir or "${homeDirectory}/.config/nix-darwin-config";
        in
        darwin.lib.darwinSystem {
          specialArgs = {
            inherit
              inputs
              hostname
              username
              system
              timezone
              homeDirectory
              flakeDir
              ;
          };

          modules = [
            ./hosts/${hostname}
            nix-homebrew.darwinModules.nix-homebrew
            ./modules/darwin/nix-homebrew.nix
            home-manager.darwinModules.home-manager
            {
              home-manager = {
                useGlobalPkgs = true;
                useUserPackages = true;
                backupFileExtension = "hm-bak";
                extraSpecialArgs = {
                  inherit
                    inputs
                    hostname
                    username
                    system
                    timezone
                    homeDirectory
                    flakeDir
                    ;
                };
                users.${username}.imports = [
                  ./modules/home
                ];
              };
            }
          ];
        };
    in
    {
      formatter = lib.genAttrs (lib.unique (map (h: h.system) (builtins.attrValues hosts))) (
        system: nixpkgs.legacyPackages.${system}.nixfmt-tree
      );

      # Build a darwin flake using:
      # $ darwin-rebuild build --flake .#<hostname>
      darwinConfigurations = lib.mapAttrs mkDarwin hosts;
    };
}

{ super
, lib
, pkgs
, ...
}:
let
  inherit (pkgs) nixpkgs-fmt;
in
{
  programs.vscode = {
    enable = true;
    package = pkgs.vscodium;
    profiles.default = {
      userSettings =
        {
          "telemetry.telemetryLevel" = "off";
          # "redhat.telemetry.enabled" = false;
          "gitlens.telemetry.enabled" = false;

          # editor
          "editor.formatOnSave" = true;
          "editor.formatOnType" = true;
          "editor.linkedEditing" = true;
          "editor.wordWrap" = "off";
          "editor.fontFamily" = "Jetbrains Mono";
          "editor.fontSize" = 16;
          "editor.fontLigatures" = false;
          "editor.minimap.enabled" = false;
          "editor.semanticHighlighting.enabled" = false;
          "editor.inlineSuggest.enabled" = true;
          "editor.inlayHints.enabled" = "on";


          "files.exclude" = {
            "**/.DS_Store" = true;
            "**/.git" = true;
            "**/.ipynb_checkpoints" = true;
            "**/*.swp" = true;
            "node_modules" = true;
          };

          # workbench
          "workbench.colorTheme" = "Atom One Dark";
          "workbench.iconTheme" = "material-icon-theme";
          "workbench.sideBar.location" = "right";
          "workbench.startupEditor" = "none";
          "workbench.welcomePage.walkthroughs.openOnInstall" = false;

          # git
          "git.enableSmartCommit" = true;
          "git.confirmSync" = false;
          "git.autofetch" = true;

          # misc
          "terminal.integrated.tabs.enabled" = true;
          "window.titleBarStyle" = "custom";
          "window.zoomLevel" = 0;
          "[html]" = {
            "editor.defaultFormatter" = "esbenp.prettier-vscode";
          };

          # Nix
          "nix.formatterPath" = "${nixpkgs-fmt}/bin/nixpkgs-fmt";
          "[nix]" = {
            "editor.insertSpaces" = true;
            "editor.tabSize" = 2;
            "editor.defaultFormatter" = "jnoortheen.nix-ide";
          };

          # go
          "go.lintTool" = "golangci-lint";
          "go.inlayHints.assignVariableTypes" = true;
          "go.inlayHints.compositeLiteralFields" = true;
          "go.inlayHints.constantValues" = true;
          "go.inlayHints.parameterNames" = true;
          "go.inlayHints.rangeVariableTypes" = true;
          "go.inlayHints.compositeLiteralTypes" = true;
          "go.inlayHints.functionTypeParameters" = true;
          "go.diagnostic.vulncheck" = "Imports";
        };


      extensions = with pkgs.vscode-extensions; [
        # themes
        pkief.material-icon-theme

        # Nix
        jnoortheen.nix-ide

        # Go
        golang.go

        # Python
        # ms-python.python
        ms-toolsai.jupyter
        ms-pyright.pyright

        # Rust
        # matklad.rust-analyzer

        # Markdown
        yzhang.markdown-all-in-one

        # Misc
        eamodio.gitlens
        editorconfig.editorconfig
        esbenp.prettier-vscode
        gruntfuggly.todo-tree
        usernamehw.errorlens
        streetsidesoftware.code-spell-checker
        adpyke.codesnap
      ] ++ pkgs.vscode-utils.extensionsFromVscodeMarketplace [
        {
          # https://marketplace.visualstudio.com/items?itemName=akamud.vscode-theme-onedark
          name = "vscode-theme-onedark";
          publisher = "akamud";
          version = "2.3.0";
          sha256 = "sha256-8GGv4L4poTYjdkDwZxgNYajuEmIB5XF1mhJMxO2Ho84=";
        }
      ];
      # xdg.configFile."VSCodium/User/settings.json".source = impurity.link ./settings.json;
      # xdg.configFile."VSCodium/User/keybindings.json".source = impurity.link ./keybindings.json;
    };
  };
}

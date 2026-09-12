{
  config,
  hostname,
  ...
}:
let
  flake = "${config.home.homeDirectory}/.config/nix-darwin-config";
  flakeExpr = "(builtins.getFlake \"${flake}\")";
  darwinOpts = "${flakeExpr}.darwinConfigurations.${hostname}.options";
in
{
  programs.helix.languages = {
    language-server = {
      # Helix's built-in Bicep definition expects `bicep-langserver`, while
      # nixpkgs exposes the server application as `Bicep.LangServer`.
      bicep-langserver.command = "Bicep.LangServer";

      terraform-ls.config.experimentalFeatures.prefillRequiredFields = true;

      nixd = {
        command = "nixd";
        config.nixd = {
          nixpkgs.expr = "import ${flakeExpr}.inputs.nixpkgs { }";
          formatting.command = [ "nixfmt" ];
          options = {
            nix-darwin.expr = darwinOpts;
            home-manager.expr = "${darwinOpts}.home-manager.users.type.getSubOptions []";
          };
        };
      };

      pyrefly = {
        command = "pyrefly";
        args = [ "lsp" ];
      };

      tsgo = {
        command = "tsgo";
        args = [
          "--lsp"
          "--stdio"
        ];
        config.typescript = {
          format.enable = false;
          inlayHints.parameterNames.enabled = "none";
          inlayHints.variableTypes.enabled = true;
          inlayHints.functionLikeReturnTypes.enabled = true;
        };
      };
    };

    language = [
      {
        name = "nix";
        auto-format = true;
        formatter.command = "nixfmt";
        language-servers = [ "nixd" ];
      }
      {
        name = "bash";
        auto-format = true;
        language-servers = [ "bash-language-server" ];
        formatter.command = "shfmt";
        formatter.args = [
          "-i"
          "2"
          "-ci"
          "-bn"
        ];
      }
      {
        name = "go";
        auto-format = true;
        language-servers = [ "gopls" ];
        indent.tab-width = 4;
        indent.unit = "\t";
      }
      {
        name = "python";
        auto-format = true;
        language-servers = [
          "pyrefly"
          "ruff"
        ];
        indent.tab-width = 4;
        indent.unit = " ";
      }
      {
        name = "typescript";
        auto-format = true;
        indent.tab-width = 4;
        indent.unit = " ";
        language-servers = [
          {
            name = "tsgo";
            except-features = [ "format" ];
          }
        ];
        formatter.command = "prettier";
        formatter.args = [
          "--parser"
          "typescript"
          "--tab-width"
          "4"
        ];
      }
      {
        name = "javascript";
        auto-format = true;
        indent.tab-width = 4;
        indent.unit = " ";
        language-servers = [
          {
            name = "tsgo";
            except-features = [ "format" ];
          }
        ];
        formatter.command = "prettier";
        formatter.args = [
          "--parser"
          "babel"
          "--tab-width"
          "4"
        ];
      }
      {
        name = "jsx";
        auto-format = true;
        language-servers = [
          {
            name = "tsgo";
            except-features = [ "format" ];
          }
        ];
        formatter.command = "prettier";
        formatter.args = [
          "--parser"
          "babel"
          "--tab-width"
          "4"
        ];
      }
      {
        name = "tsx";
        auto-format = true;
        language-servers = [
          {
            name = "tsgo";
            except-features = [ "format" ];
          }
        ];
        formatter.command = "prettier";
        formatter.args = [
          "--parser"
          "typescript"
          "--tab-width"
          "4"
        ];
      }
      {
        name = "html";
        auto-format = true;
        indent.tab-width = 2;
        indent.unit = " ";
        language-servers = [ "vscode-html-language-server" ];
        formatter.command = "prettier";
        formatter.args = [
          "--parser"
          "html"
          "--tab-width"
          "2"
        ];
      }
      {
        name = "css";
        auto-format = true;
        indent.tab-width = 2;
        indent.unit = " ";
        language-servers = [ "vscode-css-language-server" ];
        formatter.command = "prettier";
        formatter.args = [
          "--parser"
          "css"
          "--tab-width"
          "2"
        ];
      }
      # Prettier formats; LSP format disabled to match Zed "auto".
      {
        name = "json";
        auto-format = true;
        indent.tab-width = 2;
        indent.unit = " ";
        file-types = [
          "json"
          "jsonc"
          "code-snippets"
          "hujson"
        ];
        language-servers = [
          {
            name = "vscode-json-language-server";
            except-features = [ "format" ];
          }
        ];
        formatter.command = "prettier";
        formatter.args = [
          "--parser"
          "json"
        ];
      }
      {
        name = "markdown";
        language-servers = [ "marksman" ];
      }
      {
        name = "toml";
        auto-format = true;
        language-servers = [ "taplo" ];
        indent.tab-width = 2;
        indent.unit = " ";
      }
      {
        name = "dockerfile";
        auto-format = true;
        language-servers = [ "docker-langserver" ];
        formatter.command = "dockerfmt";
        indent.tab-width = 4;
        indent.unit = " ";
      }
    ];
  };
}

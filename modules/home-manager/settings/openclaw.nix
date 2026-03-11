{
  programs.openclaw = {
    enable = true;
    documents = ../documents;

    config = {
      gateway = {
        mode = "local";
        auth = {
          token = if builtins.pathExists "/Users/ew/.secrets/gateway_token" 
                  then builtins.replaceStrings [ "\n" ] [ "" ] (builtins.readFile "/Users/ew/.secrets/gateway_token")
                  else "REPLACE_ME";
        };
      };

      agents = {
        defaults = {
          model = {
            primary = "github-copilot/gpt-4o";
          };
        };
      };

      channels.telegram = {
        tokenFile = "/Users/ew/.secrets/telegram_token";
        allowFrom = [ 5455614990 ];
        groups = {
          "*" = {
            requireMention = true;
          };
        };
      };
    };

    instances.default = {
      enable = true;
      launchd.enable = true;
    };
  };
}

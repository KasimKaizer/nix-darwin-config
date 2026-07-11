{ ... }:
{
  programs.git = {
    enable = true;
    settings.user = {
      name = "Kasim Kaizer";
      email = "155087257+KasimKaizer@users.noreply.github.com";
    };
    signing.format = "openpgp";
  };

  programs.gh = {
    enable = true;
    settings = {
      git_protocol = "https";
      prompt = "enabled";
      aliases.co = "pr checkout";
    };
  };

  programs.lazygit = {
    enable = true;
    settings = { };
  };
}

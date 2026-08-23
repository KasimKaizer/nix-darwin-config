{ pkgs, ... }:
# this Air's right speaker is broken
let
  muteBuiltinRightSpeaker = pkgs.stdenv.mkDerivation {
    pname = "mute-builtin-right-speaker";
    version = "1.0";
    src = ./mute-builtin-right-speaker.c;
    dontUnpack = true;
    buildPhase = ''
      runHook preBuild
      $CC -O2 -Wall -Werror -framework CoreAudio -framework CoreFoundation "$src" -o mute-builtin-right-speaker
      runHook postBuild
    '';
    installPhase = ''
      runHook preInstall
      mkdir -p "$out/bin"
      cp mute-builtin-right-speaker "$out/bin/"
      runHook postInstall
    '';
  };
in
{
  # https://nix-darwin.github.io/nix-darwin/manual/index.html#opt-system.startup.chime
  system.startup.chime = false;

  launchd.user.agents.mute-builtin-right-speaker = {
    command = "${muteBuiltinRightSpeaker}/bin/mute-builtin-right-speaker";
    serviceConfig = {
      KeepAlive = true;
      ProcessType = "Background";
      RunAtLoad = true;
    };
  };
}

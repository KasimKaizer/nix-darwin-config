# Secrets

Always: add the key in the private vault (`inputs.nix-secrets`, `sops secrets.yaml`), declare
`sops.secrets.<nixName>`, then consume it. Names in the vault must match the
Nix attr.

Run sops from the private vault repo root. The comments at the top of
`.sops.yaml` are the CLI cheat sheet (edit, extract, `sops set`,
rotate recipients). After vault edits: `git commit && git push`
in the vault repo, then in this repo `nix flake update nix-secrets && nixswitch`
(`exec zsh` if env vars changed). The encrypted vault lives in the private
vault (`inputs.nix-secrets`); `~/.config/sops/age/keys.txt` is not.

`sops.age.generateKey = false` in `tools/secrets.nix`. A missing age key must
fail the switch, not mint a new key that cannot decrypt the committed vault.

## Env var (AOC_SESSION, API keys)

`tools/secrets.nix` + `secret-env` template, sourced from `shell/zsh.nix`. Not
`home.sessionVariables` (those are world-readable in the nix store).

```nix
sops.secrets.openai_api_key = { };

sops.templates."secret-env".content = ''
  export OPENAI_API_KEY="${config.sops.placeholder.openai_api_key}"
'';
```

Append to the existing `secret-env` template; do not create a second env file.

## Whole file (SSH private key)

```nix
sops.secrets."ssh_id_ed25519" = {
  path = "${config.home.homeDirectory}/.ssh/id_ed25519";
  mode = "0600";
};
```

## Rendered config (ssh `Host box`, exercism `user.json`, Zed `settings.json`)

```nix
sops.secrets.exercism_token = { };

sops.templates."exercism-user.json" = {
  path = "${config.home.homeDirectory}/.config/exercism/user.json";
  mode = "0600";
  content = ''
    {
      "token": "${config.sops.placeholder.exercism_token}"
    }
  '';
};
```

Declare every placeholder's `sops.secrets.*` in the same module (or it will not
decrypt). SSH (`Host box` hostname/user) is this pattern in `tools/ssh.nix` —
do not use `programs.ssh`, which would write secrets into the nix store. Zed
settings live in `modules/home/editors/zed/settings.json` with `@ZED_*@` tokens
replaced in `zed.nix` from `sops.placeholder.*`.

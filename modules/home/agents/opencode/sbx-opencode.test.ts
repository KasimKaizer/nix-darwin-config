import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const src = await Bun.file(
  new URL("./sbx-opencode.nix", import.meta.url),
).text();

function extractJqProgram(after: string): string {
  const start = src.indexOf(after);
  expect(start, `missing marker: ${after}`).toBeGreaterThan(-1);
  const open = src.indexOf("'", start + after.length);
  expect(open).toBeGreaterThan(-1);
  const close = src.indexOf("'", open + 1);
  expect(close).toBeGreaterThan(open + 1);
  return src.slice(open + 1, close);
}

async function jq(
  filter: string,
  input?: unknown,
  extra: string[] = [],
): Promise<unknown> {
  const proc = Bun.spawn(["jq", "-c", ...extra, filter], {
    stdin: input === undefined ? "ignore" : "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  if (input !== undefined && proc.stdin) {
    proc.stdin.write(JSON.stringify(input));
    proc.stdin.end();
  }
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  expect(exitCode, stderr).toBe(0);
  return JSON.parse(stdout);
}

function writeJson(name: string, value: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "sbx-opencode-"));
  const path = join(dir, name);
  writeFileSync(
    path,
    typeof value === "string" ? value : JSON.stringify(value),
  );
  return path;
}

describe("sbx-opencode wrapper invariants", () => {
  it("does not bind-mount host ~/.gemini or host auth.json", () => {
    expect(src).not.toMatch(/bind_mount.*\.gemini/);
    expect(src).not.toMatch(
      /\$\{homeDirectory\}\/\.local\/share\/opencode\/auth\.json:/,
    );
  });

  it("exports sentinel provider env vars without InferX", () => {
    expect(src).toContain("OPENROUTER_API_KEY=proxy-managed");
    expect(src).not.toContain("INFERX_API_KEY");
    expect(src).not.toContain("inferx");
    expect(src).not.toContain("proxy-managed-cursor-token");
    expect(src).not.toContain("proxy-managed-google-token");
  });

  it("retries bind mounts three times and world-writes caches, not auth", () => {
    expect(src).toMatch(/while \[ "\$i" -lt 3 \]/);
    expect(src).toMatch(/chmod -R a\+rwX "\$UV_CACHE"/);
    expect(src).toMatch(/chmod -R a\+rwX "\$NPM_GLOBAL"/);
    expect(src).toContain('chmod 644 "$AUTH_CACHE/auth.json"');
    expect(src).not.toMatch(/chmod -R a\+rwX "\$AUTH_CACHE"/);
    expect(src).toContain(
      'rm -f "$AUTH_CACHE/auth.json" "$AUTH_CACHE/antigravity.json" "$AUTH_CACHE/antigravity-accounts.json"',
    );
  });

  it("pins in-container serena and skips config injection unless jq succeeds", () => {
    expect(src).toContain(
      "git+https://github.com/oraios/serena@7fcbca7e62555ec2287ddb2f083caee805848ea6",
    );
    expect(src).toContain("start-mcp-server");
    expect(src).toMatch(
      /if FILTERED_CONFIG="\$\(jq[\s\S]*OPENCODE_CONFIG_CONTENT=\$FILTERED_CONFIG"\)/,
    );
  });

  it("sanitizes injected OpenCode config", async () => {
    const filter = extractJqProgram('jq --argjson serena_cmd "$SERENA_CMD"');
    const out = (await jq(
      filter,
      {
        provider: {
          openrouter: { options: { apiKey: "sk-or-TEST" } },
        },
        mcp: {
          exa: { type: "remote", headers: { Authorization: "Bearer sk-exa" } },
          grep_app: { type: "remote", url: "https://mcp.grep.app" },
        },
        tools: { "grep_app_*": true, "exa_*": false },
        agent: {
          builder: { tools: { "grep_app_*": true } },
          plan: { disable: true },
          literal: "leave-me",
        },
        experimental: { mcp_timeout: 1 },
      },
      ["--argjson", "serena_cmd", '["uv","tool","run"]'],
    )) as {
      provider: {
        openrouter: { options: { apiKey: string } };
      };
      mcp: { serena: { command: string[] } } & Record<string, unknown>;
      tools: Record<string, boolean>;
      agent: {
        builder: { tools: Record<string, boolean> };
        plan: { tools: Record<string, boolean> };
        literal: string;
      };
      experimental: { mcp_timeout: number };
    };
    expect(out.provider.openrouter.options.apiKey).toBe("proxy-managed");
    expect(Object.keys(out.mcp).sort()).toEqual(["mcp-gateway", "serena"]);
    expect(JSON.stringify(out)).not.toContain("sk-");
    expect(out.mcp.serena.command).toEqual(["uv", "tool", "run"]);
    expect(out.tools["mcp-gateway_*"]).toBe(true);
    expect(out.tools["serena_*"]).toBe(true);
    expect(out.tools["grep_app_*"]).toBe(true);
    expect(out.agent.builder.tools["mcp-gateway_*"]).toBe(true);
    expect(out.agent.plan.tools["serena_*"]).toBe(true);
    expect(out.agent.literal).toBe("leave-me");
    expect(out.experimental.mcp_timeout).toBe(120000);
  });

  it("does not emit partial secrets when host config is malformed", async () => {
    const filter = extractJqProgram('jq --argjson serena_cmd "$SERENA_CMD"');
    const bad = writeJson(
      "bad.json",
      '{ "provider": { "openrouter": { "options": { "apiKey": "sk-or-LEAK" } } }\n',
    );
    const proc = Bun.spawn(
      ["jq", "--argjson", "serena_cmd", '["uv"]', filter, bad],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited,
    ]);
    expect(exitCode).not.toBe(0);
    expect(stdout).not.toContain("sk-or-LEAK");
  });

  it("stages host google and cursor only", async () => {
    const filter = extractJqProgram('jq -n --slurpfile host "$HOST_AUTH"');
    const host = writeJson("auth.json", {
      google: { type: "oauth", access: "ya29.REAL", refresh: "rt", expires: 1 },
      cursor: { type: "oauth", access: "eyJ.REAL", refresh: "cr", expires: 9 },
      openai: { type: "api", key: "sk-leak" },
    });
    const out = (await jq(filter, undefined, [
      "-n",
      "--slurpfile",
      "host",
      host,
    ])) as {
      google: { access: string };
      cursor: { access: string };
    };
    expect(Object.keys(out).sort()).toEqual(["cursor", "google"]);
    expect(out.google.access).toBe("ya29.REAL");
    expect(out.cursor.access).toBe("eyJ.REAL");
    expect(JSON.stringify(out)).not.toContain("sk-leak");
  });

  it("omits missing providers when host auth is empty", async () => {
    const filter = extractJqProgram('jq -n --slurpfile host "$HOST_AUTH"');

    const emptyHost = writeJson("auth.json", {
      google: { access: "ya29.REAL" },
    });
    const onlyGoogle = (await jq(filter, undefined, [
      "-n",
      "--slurpfile",
      "host",
      emptyHost,
    ])) as {
      google: { access: string };
      cursor?: unknown;
    };
    expect(onlyGoogle).toEqual({ google: { access: "ya29.REAL" } });

    const empty = writeJson("auth.json", {});
    const none = (await jq(filter, undefined, [
      "-n",
      "--slurpfile",
      "host",
      empty,
    ])) as Record<string, unknown>;
    expect(none).toEqual({});
  });

  it("answers ACP fast: nix bootstrap is backgrounded and progress stays off stdout", () => {
    expect(src).toContain(
      'bootstrapping in background, nixd appears shortly..." >&2',
    );
    expect(src).toContain("</dev/null || true &");
    expect(src).toContain(
      'echo "sbx-opencode: starting opencode acp in $SANDBOX_NAME..." >&2',
    );
  });

  it("keeps client stdin intact: setup-time sbx calls take </dev/null", () => {
    expect(src).toContain("true </dev/null >/dev/null");
    expect(src).toContain("bin/nix </dev/null >/dev/null");
    expect(src).toContain('"${hooksPlugin}:ro" </dev/null');
    expect(src).toContain("OPENCODE_DISABLE_AUTOUPDATE=true");
  });

  it("copies host antigravity accounts and config as 0644", () => {
    expect(src).toContain(
      'cp "${homeDirectory}/.config/opencode/antigravity"*.json "$AUTH_CACHE/"',
    );
    expect(src).toContain('chmod 644 "$AUTH_CACHE"/*.json');
    expect(src).toContain(
      'bind_mount "$AUTH_CACHE/antigravity.json:/home/agent/.config/opencode/antigravity.json"',
    );
    expect(src).toContain(
      'bind_mount "$AUTH_CACHE/antigravity-accounts.json:/home/agent/.config/opencode/antigravity-accounts.json"',
    );
  });

  it("preserves hooks, MCP gateway, and skills mounts", () => {
    expect(src).toContain('"${hooksPlugin}:ro"');
    expect(src).toContain("--static-mcp");
    expect(src).toContain("staticMcpList");
    expect(src).toContain(
      "$SKILLS_CACHE:/home/agent/.config/opencode/skills:ro",
    );
    expect(src).toContain("$SKILLS_CACHE:/home/agent/.agents/skills:ro");
    expect(src).toContain(
      'rsync -aL --delete "${homeDirectory}/.agents/skills/" "$SKILLS_CACHE/"',
    );
  });
});

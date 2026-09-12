import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const src = await Bun.file(new URL("./sbx-omp.nix", import.meta.url)).text();

async function jqRaw(filter: string, file: string): Promise<{ stdout: string; exitCode: number }> {
  const proc = Bun.spawn(["jq", "-r", filter, file], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { stdout, exitCode };
}

function writeJson(name: string, value: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "sbx-omp-"));
  const path = join(dir, name);
  writeFileSync(path, typeof value === "string" ? value : JSON.stringify(value));
  return path;
}

function sbxLines(): string[] {
  return src.split("\n").filter((line) => /sbx (create|run|exec)/.test(line));
}

describe("sbx-omp wrapper invariants", () => {
  // sbx v0.39 reads the first positional as a built-in agent, so a store kit
  // path there fails with `unknown agent`.
  it("creates via agent shell plus the --kit mixin, never a kit-path agent", () => {
    expect(src).toContain('${sbxLib.workspace "omp"}');
    expect(src).toContain('--kit "${kitDir}"');
    expect(src).toContain(`sbx create "''\${CREATE_FLAGS[@]}" shell "$WORKSPACE_DIR"`);
    for (const line of sbxLines()) {
      expect(line, `must not use kit path as agent: ${line}`).not.toMatch(
        /sbx create .*\$\{kitDir\}"/,
      );
    }
  });

  it("attaches by exec of omp, not sbx run --name (that would be agent shell)", () => {
    expect(src).toContain(`sbx exec -it "''\${ENV_ARGS[@]}" "$SANDBOX_NAME" -- "$OMP_BIN"`);
    expect(src).toContain(`sbx exec -i "''\${ENV_ARGS[@]}" "$SANDBOX_NAME" -- "$OMP_BIN" acp "$@"`);
    expect(src).toContain('OMP_BIN="/home/agent/.local/bin/omp"');
    for (const line of sbxLines()) {
      expect(line, `must not sbx run: ${line}`).not.toMatch(/^\s*sbx run /);
    }
  });

  it("binds a per-sandbox omp-auth directory, never the host agent dir", () => {
    expect(src).toContain('bind_mount "$OMP_AUTH:/home/agent/.omp/agent"');
    expect(src).toContain(".cache/sbx/omp-auth/$SANDBOX_NAME");
    expect(src).not.toMatch(/bind_mount "\$\{homeDirectory\}\/\.omp/);
  });

  it("world-writes the staged sandbox config without requiring 0644", () => {
    expect(src).toContain('chmod a+rw "$OMP_AUTH/config.yml"');
    expect(src).toContain('chmod a+rw "$OMP_AUTH/mcp.json"');
    expect(src).toContain('chmod a+rwx "$OMP_AUTH"');
    expect(src).not.toMatch(/chmod 644 "\$OMP_AUTH\//);
    expect(src).not.toMatch(/chmod -R a\+rwX "\$OMP_AUTH"/);
    expect(src).not.toMatch(/chmod -R a\+rwx "\$OMP_AUTH"/);
  });

  it("forwards CURSOR_ACCESS_TOKEN and does not set OpenCode proxy sentinels", () => {
    expect(src).toContain("CURSOR_ACCESS_TOKEN");
    expect(src).not.toContain("proxy-managed-cursor-token");
  });

  it("extracts only cursor.access from host OpenCode auth", async () => {
    const m = src.match(/CURSOR_ACCESS_TOKEN="\$\(jq -r '([^']+)'/);
    expect(m, "CURSOR_ACCESS_TOKEN jq filter").not.toBeNull();
    const filter = m![1];

    const host = writeJson("auth.json", {
      google: { type: "oauth", access: "ya29.REAL", refresh: "rt", expires: 1 },
      cursor: { type: "oauth", access: "eyJ.REAL", refresh: "cr", expires: 9 },
      openai: { type: "api", key: "sk-leak" },
    });
    const { stdout, exitCode } = await jqRaw(filter, host);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe("eyJ.REAL");

    const noCursor = writeJson("auth.json", { google: { access: "ya29.REAL" } });
    const empty = await jqRaw(filter, noCursor);
    expect(empty.exitCode).toBe(0);
    expect(empty.stdout.trim()).toBe("");

    const missing = await jqRaw(filter, join(tmpdir(), "no-such-auth.json"));
    expect(missing.exitCode).not.toBe(0);
    expect(missing.stdout.trim()).toBe("");
  });

  it("creates sandboxes with only nix and codegraph on --static-mcp", () => {
    expect(src).toContain('staticMcpList = "nix,codegraph"');
    expect(src).toContain('--static-mcp "${staticMcpList}"');
    expect(src).not.toContain("context7,");
    expect(src).not.toMatch(/--static-mcp[^$]*serena/);
  });

  it("stages sandbox mcp.json from host context7 plus mcp-gateway, never Serena", () => {
    expect(src).toContain("mcp-gateway.docker.internal");
    expect(src).toContain('type: "http"');
    expect(src).toContain("$host[0].mcpServers.context7");
    expect(src).toContain('HOST_MCP="${homeDirectory}/.omp/agent/mcp.json"');
    expect(src).not.toContain("serena");
    expect(src).not.toContain("start-mcp-server");
    expect(src).not.toContain("7fcbca7e62555ec2287ddb2f083caee805848ea6");
    expect(src).not.toContain("grep_app");
    expect(src).not.toContain("sk-");
  });

  // A create-time `-e` value is baked into the sandbox spec, so the staged file
  // is what makes a rotated key take effect on the very next launch.
  it("restages the sandbox .env each launch and copies only EXA_API_KEY", () => {
    expect(src).toContain(`ENV_ARGS+=(-e "EXA_API_KEY=$EXA_API_KEY")`);
    expect(src).toContain('rm -f "$OMP_AUTH/.env"');
    expect(src).toContain("^EXA_API_KEY=");
    expect(src).toContain('chmod a+rw "$OMP_AUTH/.env"');
    expect(src).not.toMatch(/cp -L "\$\{homeDirectory\}\/\.omp\/agent\/\.env"/);
    expect(src).not.toMatch(/cp .*\.omp\/agent\/\.env/);
    expect(src).not.toContain("OPENROUTER_API_KEY");
    expect(src).not.toContain("GEMINI_API_KEY");
  });

  // omp's `agents` provider reads ~/.agents/skills and dedups by name, so a
  // second staged copy inside the agent dir was invisible work every launch.
  it("puts host skills in the container exactly once", () => {
    expect(src).toContain('bind_mount "$SKILLS_CACHE:/home/agent/.agents/skills:ro"');
    expect(src).not.toContain("$SKILLS_CACHE:/home/agent/.omp/agent/skills");
    expect(src).not.toContain('mkdir -p "$OMP_AUTH/skills"');
    expect(src).not.toContain('"$OMP_AUTH/skills/"');
  });

  it("filters host mcp to context7 plus mcp-gateway via jq", async () => {
    const m = src.match(/--slurpfile host "\$HOST_MCP" '([\s\S]*?)'\s*>/);
    expect(m, "host mcp jq filter").not.toBeNull();
    const filter = m![1];

    const host = writeJson("mcp.json", {
      mcpServers: {
        context7: {
          type: "http",
          url: "https://mcp.context7.com/mcp",
          headers: { Authorization: "Bearer real-key" },
        },
        grep_app: { type: "http", url: "https://mcp.grep.app" },
        nix: { type: "stdio", command: "/nix/store/nix", args: [] },
      },
    });
    const proc = Bun.spawn(["jq", "-n", "--slurpfile", "host", host, filter], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    expect(exitCode).toBe(0);
    const staged = JSON.parse(stdout) as {
      mcpServers: Record<string, { type?: string; url?: string; headers?: Record<string, string> }>;
    };
    expect(staged.mcpServers.context7.url).toBe("https://mcp.context7.com/mcp");
    expect(staged.mcpServers.context7.headers?.Authorization).toBe("Bearer real-key");
    expect(staged.mcpServers["mcp-gateway"].type).toBe("http");
    expect(staged.mcpServers["mcp-gateway"].url).toBe("http://mcp-gateway.docker.internal/mcp");
    expect(staged.mcpServers, "no grep_app leaks through").not.toHaveProperty("grep_app");
    expect(staged.mcpServers, "only gateway stdio comes via gateway").not.toHaveProperty("nix");
    expect(staged.mcpServers, "no serena").not.toHaveProperty("serena");
  });

  // One filter serves both paths: an unusable host file is swapped for
  // /dev/null, which slurps as [] and the filter reads as "no context7". A
  // second copy of the gateway object would be free to drift from the first.
  it("yields a gateway-only mcp.json when the host file is unusable", async () => {
    expect(src).toContain('if ! jq -e . "$HOST_MCP" >/dev/null 2>&1; then');
    expect(src).toContain("HOST_MCP=/dev/null");
    expect((src.match(/mcp-gateway\.docker\.internal/g) ?? []).length, "gateway defined once").toBe(1);

    const m = src.match(/--slurpfile host "\$HOST_MCP" '([\s\S]*?)'\s*>/);
    expect(m, "host mcp jq filter").not.toBeNull();
    const proc = Bun.spawn(["jq", "-n", "--slurpfile", "host", "/dev/null", m![1]], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    expect(exitCode).toBe(0);
    const staged = JSON.parse(stdout) as { mcpServers: Record<string, { url?: string }> };
    expect(Object.keys(staged.mcpServers)).toEqual(["mcp-gateway"]);
    expect(staged.mcpServers["mcp-gateway"].url).toBe("http://mcp-gateway.docker.internal/mcp");
  });

  it("generates sandbox config.yml from scratch without cursor or modelRoles", () => {
    const start = src.indexOf('cat > "$OMP_AUTH/config.yml"');
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("\n  EOF", start);
    expect(end).toBeGreaterThan(start);
    const block = src.slice(start, end);
    expect(block).toContain("enabledProviders: []");
    expect(block).toContain("enableProjectConfig: false");
    expect(block).toContain("webSearchOrder");
    expect(block).toContain("exa");
    expect(block).toContain("- codex");
    expect(block.toLowerCase()).not.toContain("cursor");
    expect(block).not.toContain("modelRoles");
  });

  it("keeps the omp-specific uv tool env on the mounted volume", () => {
    expect(src).toContain("UV_TOOL_BIN_DIR=/home/agent/.npm-global/bin");
    expect(src).toContain("UV_TOOL_DIR=/home/agent/.npm-global/uv-tools");
    expect(src).toContain('ensure_shared_dir "$NPM_GLOBAL/uv-tools"');
  });

  // Each `sbx exec` is a round trip into the VM, so the skip-if-present checks
  // are batched into one instead of one exec per language server.
  it("installs the shared-cache LSP set in a single exec, swallowing failure", () => {
    expect(src).not.toContain("ensure_sbx_lsp");
    expect((src.match(/SETUP_STEPS=\(/g) ?? []).length).toBe(1);
    expect(src).toContain(`sh -c "$(printf '%s\\n' "''\${SETUP_STEPS[@]}")"`);
    expect(src).toContain("command -v typescript-language-server");
    expect(src).toContain("npm i -g typescript-language-server");
    expect(src).toContain("vscode-langservers-extracted");
    expect(src).toContain("bash-language-server");
    expect(src).toContain("@tailwindcss/language-server");
    expect(src).toContain("dockerfile-language-server-nodejs");
    expect(src).toContain("command -v gopls");
    expect(src).toContain("GOPATH=/home/agent/go go install");
    expect(src).toContain("command -v pyright-langserver");
    expect(src).toContain("uv tool install pyright");
    expect(src).toContain("uv tool install ruff");
  });

  it("gates the go and python installs on project triggers", () => {
    const goInstall = src.indexOf("go install golang.org/x/tools/gopls@latest");
    expect(goInstall).toBeGreaterThan(-1);
    expect(src.lastIndexOf('[ -n "$GO_PROJECT" ]', goInstall)).toBeGreaterThan(-1);
    const pyInstall = src.indexOf("uv tool install pyright");
    expect(pyInstall).toBeGreaterThan(goInstall);
    for (const f of ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg", "Pipfile"]) {
      expect(src.lastIndexOf(f, pyInstall), `python trigger ${f}`).toBeGreaterThan(goInstall);
    }
  });

  it("drops OpenCode-specific wiring", () => {
    expect(src).not.toContain("hooksPlugin");
    expect(src).not.toContain("OPENCODE_CONFIG_CONTENT");
    expect(src).not.toContain("node_modules");
    expect(src).not.toContain("PLUGIN_CACHE");
    expect(src).not.toContain("tui.json");
    expect(src).not.toContain("gatewayServers");
  });
});

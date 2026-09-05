import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import plugin, { FILE_READ_WARNING } from "./index.js";

describe("guards (hooks 1-3)", () => {
  const testDir = join(tmpdir(), `hooks-test-guards-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  const mockCtx = {
    directory: testDir,
    client: {
      tui: {
        showToast: async (opts) => {},
      },
    },
  };

  // 1. notepad-write-guard
  describe("1. notepad-write-guard", () => {
    it("blocks Write to append-only notepad paths in builder sessions", async () => {
      const hooks = await plugin.server(mockCtx, {});
      await hooks["chat.message"]({ sessionID: "s-builder-1", agent: "builder" }, {});
      const p1 = hooks["tool.execute.before"](
        { tool: "write", sessionID: "s-builder-1", callID: "c1" },
        { args: { filePath: `${testDir}/docs/plans/notepads/test/learnings.md` } }
      );
      await expect(p1).rejects.toThrow("Refused: Write to");

      const p2 = hooks["tool.execute.before"](
        { tool: "write", sessionID: "s-builder-1", callID: "c2" },
        { args: { filePath: `${testDir}/docs/plans/notepads/deep/nested/issues.md` } }
      );
      await expect(p2).rejects.toThrow("Refused: Write to");
    });

    it("permits Write to non-notepad paths", async () => {
      const hooks = await plugin.server(mockCtx, {});
      await expect(
        hooks["tool.execute.before"](
          { tool: "write", sessionID: "s1", callID: "c3" },
          { args: { filePath: `${testDir}/src/component.ts` } }
        )
      ).resolves.toBeUndefined();
    });

    it("blocks notepad writes from worker sessions too", async () => {
      const hooks = await plugin.server(mockCtx, {});
      await hooks["chat.message"]({ sessionID: "s-worker-1", agent: "worker-deep" }, {});
      const p = hooks["tool.execute.before"](
        { tool: "write", sessionID: "s-worker-1", callID: "c1" },
        { args: { filePath: `${testDir}/docs/plans/notepads/test/learnings.md` } }
      );
      await expect(p).rejects.toThrow("Refused: Write to");
    });

    it("blocks notepad writes from untracked sessions", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const p = hooks["tool.execute.before"](
        { tool: "write", sessionID: "s-unknown-1", callID: "c1" },
        { args: { filePath: `${testDir}/docs/plans/notepads/test/learnings.md` } }
      );
      await expect(p).rejects.toThrow("Refused: Write to");
    });

    it("matches the docs root through filePath, path and file_path keys", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const variants = [
        { filePath: `${testDir}/docs/plans/notepads/a/b.md` },
        { path: `${testDir}/docs/plans/notepads/a/b.md` },
        { file_path: `${testDir}/docs/plans/notepads/a/b.md` },
      ];
      let n = 0;
      for (const args of variants) {
        const p = hooks["tool.execute.before"](
          { tool: "write", sessionID: "s-roots-1", callID: `c${++n}` },
          { args }
        );
        await expect(p).rejects.toThrow("Refused: Write to");
      }
    });

    it("no longer guards legacy upstream roots", async () => {
      const hooks = await plugin.server(mockCtx, {});
      for (const fp of [".omo/notepads/foo/issues.md", ".sisyphus/notepads/a/b.md"]) {
        await expect(
          hooks["tool.execute.before"](
            { tool: "write", sessionID: "s-roots-2", callID: "c1" },
            { args: { filePath: fp } }
          )
        ).resolves.toBeUndefined();
      }
    });

    it("ignores non-write tools even on notepad paths", async () => {
      const hooks = await plugin.server(mockCtx, {});
      for (const tool of ["edit", "read", "bash"]) {
        await expect(
          hooks["tool.execute.before"](
            { tool, sessionID: "s-other-tools", callID: "c1" },
            { args: { filePath: `${testDir}/docs/plans/notepads/a/b.md`, command: "cat x" } }
          )
        ).resolves.toBeUndefined();
      }
    });

    it("allows lookalike directories that are not notepad roots", async () => {
      const hooks = await plugin.server(mockCtx, {});
      await expect(
        hooks["tool.execute.before"](
          { tool: "write", sessionID: "s-lookalike", callID: "c1" },
          { args: { filePath: `${testDir}/docs/plans/notepads-backup/a.md` } }
        )
      ).resolves.toBeUndefined();
    });

    it("documents case-sensitivity boundary (parity with upstream)", async () => {
      const hooks = await plugin.server(mockCtx, {});
      // APFS is usually case-insensitive: an uppercase path can reach the
      // same file while the pure-string matcher only sees lowercase roots.
      // Upstream behaves identically; pinned here so any change is deliberate.
      await expect(
        hooks["tool.execute.before"](
          { tool: "write", sessionID: "s-case-1", callID: "c1" },
          { args: { filePath: `${testDir}/DOCS/PLANS/NOTEPADS/a.md` } }
        )
      ).resolves.toBeUndefined();
    });
  });

  // 2. write-existing-file-guard
  describe("2. write-existing-file-guard", () => {
    it("blocks Write to existing file if not read first in session", async () => {
      const existingFile = join(testDir, "existing.txt");
      writeFileSync(existingFile, "hello");

      const hooks = await plugin.server(mockCtx, {});
      await expect(
        hooks["tool.execute.before"](
          { tool: "write", sessionID: "s-guard-1", callID: "c1" },
          { args: { filePath: existingFile } }
        )
      ).rejects.toThrow("File already exists. Use edit tool instead.");

      // Read the file first
      await hooks["tool.execute.before"](
        { tool: "read", sessionID: "s-guard-1", callID: "c2" },
        { args: { filePath: existingFile } }
      );

      // Now Write succeeds
      await expect(
        hooks["tool.execute.before"](
          { tool: "write", sessionID: "s-guard-1", callID: "c3" },
          { args: { filePath: existingFile } }
        )
      ).resolves.toBeUndefined();
    });

    it("allows overwrite flag bypass", async () => {
      const existingFile = join(testDir, "overwrite-me.txt");
      writeFileSync(existingFile, "content");
      const hooks = await plugin.server(mockCtx, {});
      await expect(
        hooks["tool.execute.before"](
          { tool: "write", sessionID: "s-guard-2", callID: "c1" },
          { args: { filePath: existingFile, overwrite: true } }
        )
      ).resolves.toBeUndefined();
    });
  });

  // 3. bash-file-read-guard
  describe("3. bash-file-read-guard", () => {
    it("appends notice when bash executes cat/head/tail on a file", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "file contents", metadata: {} };
      await hooks["tool.execute.after"](
        { tool: "bash", sessionID: "s1", callID: "c1", args: { command: "cat file.txt" } },
        out
      );
      expect(out.output).toContain("file contents");
      expect(out.output).toContain(`[Notice: ${FILE_READ_WARNING}]`);
    });

    it("does not append notice on normal bash commands", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "dir1\ndir2", metadata: {} };
      await hooks["tool.execute.after"](
        { tool: "bash", sessionID: "s1", callID: "c1", args: { command: "ls -la" } },
        out
      );
      expect(out.output).toBe("dir1\ndir2");
    });
  });
});

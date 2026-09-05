import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import plugin, {
  EDIT_ERROR_REMINDER,
  EMPTY_RESPONSE_WARNING,
  JSON_ERROR_REMINDER,
  NOTEPAD_READ_REMINDER,
} from "./index.js";

describe("recovery (hooks 4-9)", () => {
  const testDir = join(tmpdir(), `hooks-test-recovery-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  const mockCtx = {
    directory: testDir,
    client: {
      tui: {
        showToast: async (opts) => {},
      },
    },
  };

  // 4. edit-error-recovery
  describe("4. edit-error-recovery", () => {
    it("appends EDIT_ERROR_REMINDER on edit error pattern", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "Error: oldString not found in content" };
      await hooks["tool.execute.after"]({ tool: "edit", sessionID: "s1", callID: "c1" }, out);
      expect(out.output).toContain(EDIT_ERROR_REMINDER);
    });

    it("leaves successful edit outputs untouched", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "Successfully edited 4 lines." };
      await hooks["tool.execute.after"]({ tool: "edit", sessionID: "s1", callID: "c1" }, out);
      expect(out.output).not.toContain(EDIT_ERROR_REMINDER);
    });

    it("blocks edit before execution when oldString equals newString", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const p = hooks["tool.execute.before"](
        { tool: "edit", sessionID: "s1", callID: "c1" },
        { args: { filePath: `${testDir}/file.txt`, oldString: "same", newString: "same" } }
      );
      await expect(p).rejects.toThrow("No changes to apply: oldString and newString are identical.");
    });

    it("blocks edit before execution when oldString is empty", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const p = hooks["tool.execute.before"](
        { tool: "edit", sessionID: "s1", callID: "c1" },
        { args: { filePath: `${testDir}/file.txt`, oldString: "", newString: "replacement" } }
      );
      await expect(p).rejects.toThrow("oldString must not be empty.");
    });

    it("blocks edit before execution when oldString is not found in file", async () => {
      const targetFile = join(testDir, "edit-target.txt");
      writeFileSync(targetFile, "line 1\nline 2\nline 3\n");
      const hooks = await plugin.server(mockCtx, {});
      const p = hooks["tool.execute.before"](
        { tool: "edit", sessionID: "s1", callID: "c1" },
        { args: { filePath: targetFile, oldString: "non-existent text", newString: "replacement" } }
      );
      await expect(p).rejects.toThrow("Could not find oldString in the file.");
    });

    it("blocks edit before execution when multiple matches exist without replaceAll", async () => {
      const targetFile = join(testDir, "multi-match.txt");
      writeFileSync(targetFile, "duplicate line\nmiddle\nduplicate line\n");
      const hooks = await plugin.server(mockCtx, {});
      const p = hooks["tool.execute.before"](
        { tool: "edit", sessionID: "s1", callID: "c1" },
        { args: { filePath: targetFile, oldString: "duplicate line", newString: "single line" } }
      );
      await expect(p).rejects.toThrow("Found multiple exact matches for oldString.");
    });

    it("allows edit before execution when replaceAll is true even with multiple matches", async () => {
      const targetFile = join(testDir, "multi-match-allowed.txt");
      writeFileSync(targetFile, "repeat word repeat word");
      const hooks = await plugin.server(mockCtx, {});
      await expect(
        hooks["tool.execute.before"](
          { tool: "edit", sessionID: "s1", callID: "c1" },
          { args: { filePath: targetFile, oldString: "repeat", newString: "single", replaceAll: true } }
        )
      ).resolves.toBeUndefined();
    });

    it("allows edit before execution when oldString matches uniquely", async () => {
      const targetFile = join(testDir, "unique-match.txt");
      writeFileSync(targetFile, "target line to replace\nanother line\n");
      const hooks = await plugin.server(mockCtx, {});
      await expect(
        hooks["tool.execute.before"](
          { tool: "edit", sessionID: "s1", callID: "c1" },
          { args: { filePath: targetFile, oldString: "target line to replace", newString: "replaced line" } }
        )
      ).resolves.toBeUndefined();
    });
  });

  // 5. json-error-recovery
  describe("5. json-error-recovery", () => {
    it("appends JSON_ERROR_REMINDER on JSON parse error", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "Failed to parse json: Unexpected token '}'" };
      await hooks["tool.execute.after"]({ tool: "custom_mcp_tool", sessionID: "s1", callID: "c1" }, out);
      expect(out.output).toContain(JSON_ERROR_REMINDER);
    });

    it("ignores excluded tools like bash/read", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "Failed to parse json: Unexpected token '}'" };
      await hooks["tool.execute.after"]({ tool: "bash", sessionID: "s1", callID: "c1" }, out);
      expect(out.output).not.toContain(JSON_ERROR_REMINDER);
    });

    it("ignores data-namespace MCP tools (serena/exa/codegraph/nix/playwright)", async () => {
      const hooks = await plugin.server(mockCtx, {});
      for (const tool of [
        "serena_search_for_pattern",
        "serena_read_file",
        "exa_web_search_exa",
        "codegraph_codegraph_explore",
        "context7_query-docs",
        "nix_nix",
        "playwright_browser_snapshot",
        "github_search_code",
        "sequential-thinking_sequentialthinking",
        "websearch",
        "custom_websearch",
        "google_search",
        "mcp-gateway_read_file",
      ]) {
        const out = { output: "invalid json in file contents" };
        await hooks["tool.execute.after"]({ tool, sessionID: "s1", callID: "c1" }, out);
        expect(out.output).not.toContain(JSON_ERROR_REMINDER);
      }
    });

    it("ignores sandbox gateway built-in tools", async () => {
      const hooks = await plugin.server(mockCtx, {});
      for (const tool of ["mcp-exec", "code-mode", "mcp-find", "mcp-add", "mcp-config-set"]) {
        const out = { output: "invalid json in tool listing" };
        await hooks["tool.execute.after"]({ tool, sessionID: "s1", callID: "c1" }, out);
        expect(out.output).not.toContain(JSON_ERROR_REMINDER);
      }
    });

    it("is case-insensitive on tool names", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "Failed to parse json: Unexpected token '}'" };
      await hooks["tool.execute.after"]({ tool: "Serena_Read_File", sessionID: "s1", callID: "c1" }, out);
      expect(out.output).not.toContain(JSON_ERROR_REMINDER);
    });
  });

  // 6. empty-task-response-detector
  describe("6. empty-task-response-detector", () => {
    it("injects warning on empty task output", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "   " };
      await hooks["tool.execute.after"]({ tool: "task", sessionID: "s1", callID: "c1" }, out);
      expect(out.output).toBe(EMPTY_RESPONSE_WARNING);
    });

    it("preserves non-empty task output", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "Completed successfully." };
      await hooks["tool.execute.after"]({ tool: "task", sessionID: "s1", callID: "c1" }, out);
      expect(out.output).toContain("Completed successfully.");
    });

    it("treats whitespace-only task_result envelope as empty (OpenCode 1.18 wrap)", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = {
        output: '<task id="ses_abc" state="completed">\n<task_result>\n   \n</task_result>\n</task>',
      };
      await hooks["tool.execute.after"]({ tool: "task", sessionID: "s1", callID: "c1" }, out);
      expect(out.output).toBe(EMPTY_RESPONSE_WARNING);
    });

    it("warns on envelopes with no result block and no readable text", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: '<task id="ses_x" state="completed"></task>' };
      await hooks["tool.execute.after"]({ tool: "task", sessionID: "s1", callID: "c1" }, out);
      expect(out.output).toBe(EMPTY_RESPONSE_WARNING);
    });

    it("preserves envelopes and prose that carry real content", async () => {
      const hooks = await plugin.server(mockCtx, {});
      for (const text of ["<task>do X</task>", "Use <task> tags wisely"]) {
        const out = { output: text };
        await hooks["tool.execute.after"]({ tool: "task", sessionID: "s1", callID: "c1" }, out);
        expect(out.output).toContain(text);
        expect(out.output).not.toContain(EMPTY_RESPONSE_WARNING);
      }
    });

    it("preserves envelopes carrying real content", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = {
        output: '<task id="ses_abc" state="completed">\n<task_result>\nPINEAPPLE\n</task_result>\n</task>',
      };
      await hooks["tool.execute.after"]({ tool: "task", sessionID: "s1", callID: "c1" }, out);
      expect(out.output).toContain("PINEAPPLE");
      expect(out.output).not.toContain(EMPTY_RESPONSE_WARNING);
    });

    it("composes with resume-info: warning plus retry continuation, no read nudge", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = {
        output: '<task id="ses_abc" state="completed">\n<task_result>\n   \n</task_result>\n</task>',
        metadata: { taskId: "ses_abc" },
      };
      await hooks["tool.execute.after"]({ tool: "task", sessionID: "s1", callID: "c1" }, out);
      expect(out.output.startsWith("[Task Empty Response Warning]")).toBe(true);
      expect(out.output).toContain('to continue: task(task_id="ses_abc"');
      expect(out.output).not.toContain("[READ SUBAGENT NOTEPAD]");
    });
  });

  // 7. task-resume-info
  describe("7. task-resume-info", () => {
    it("appends resumption command when task has taskId", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "Finished task", metadata: { taskId: "task-abc-123" } };
      await hooks["tool.execute.after"]({ tool: "task", sessionID: "s1", callID: "c1" }, out);
      expect(out.output).toContain('to continue: task(task_id="task-abc-123"');
    });

    it("skips resumption command if already present or error", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "Error: task failed", metadata: { taskId: "task-abc-123" } };
      await hooks["tool.execute.after"]({ tool: "task", sessionID: "s1", callID: "c1" }, out);
      expect(out.output).not.toContain("to continue: task(");
    });
  });

  // 8. tool-output-truncator
  describe("8. tool-output-truncator", () => {
    it("truncates oversized grep/webfetch output", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const hugeOutput = "A".repeat(250_000);
      const out = { output: hugeOutput };
      await hooks["tool.execute.after"]({ tool: "grep", sessionID: "s1", callID: "c1" }, out);
      expect(out.output.length).toBeLessThan(210_000);
      expect(out.output).toContain("[Output truncated: omitted");
    });

    it("applies the lower webfetch ceiling", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "B".repeat(50_000) };
      await hooks["tool.execute.after"]({ tool: "webfetch", sessionID: "s1", callID: "c1" }, out);
      expect(out.output.length).toBeLessThan(45_000);
      expect(out.output).toContain("[Output truncated: omitted");
    });
  });

  // 9. task-completion notepad reminder
  describe("9. task-completion notepad reminder", () => {
    it("appends read reminder on successful task completion", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "Did the thing", metadata: {} };
      await hooks["tool.execute.after"]({ tool: "task", sessionID: "s1", callID: "c1" }, out);
      expect(out.output).toContain(NOTEPAD_READ_REMINDER);
      expect(out.output).toContain("[READ SUBAGENT NOTEPAD]");
    });

    it("skips reminder on error outputs and non-task tools", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const errOut = { output: "Error: boom", metadata: {} };
      await hooks["tool.execute.after"]({ tool: "task", sessionID: "s1", callID: "c1" }, errOut);
      expect(errOut.output).not.toContain("[READ SUBAGENT NOTEPAD]");

      const bashOut = { output: "Did the thing", metadata: {} };
      await hooks["tool.execute.after"]({ tool: "bash", sessionID: "s1", callID: "c2" }, bashOut);
      expect(bashOut.output).not.toContain("[READ SUBAGENT NOTEPAD]");
    });

    it("does not double-append when reminder already present", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: `Done\n${NOTEPAD_READ_REMINDER}`, metadata: {} };
      await hooks["tool.execute.after"]({ tool: "task", sessionID: "s1", callID: "c1" }, out);
      expect(out.output.split("[READ SUBAGENT NOTEPAD]").length).toBe(2);
    });
  });
});

import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import plugin, { NOTEPAD_DIRECTIVE } from "./index.js";

describe("session (hooks 10-12)", () => {
  const testDir = join(tmpdir(), `hooks-test-session-${Date.now()}`);
  mkdirSync(testDir, { recursive: true });

  const mockCtx = {
    directory: testDir,
    client: {
      tui: {
        showToast: async (opts) => {},
      },
    },
  };

  // 10. plan-format-validator
  describe("10. plan-format-validator", () => {
    it("warns on malformed task checkboxes in docs/plans/*.md", async () => {
      const planFile = join(testDir, "docs/plans/my-plan.md");
      mkdirSync(dirname(planFile), { recursive: true });
      writeFileSync(
        planFile,
        `## TODOs\n- [ ] Task-1: Bad format\n- [ ] 2. Good format\n`
      );

      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "Wrote plan file" };
      await hooks["tool.execute.after"](
        { tool: "write", sessionID: "s1", callID: "c1", args: { filePath: planFile } },
        out
      );
      expect(out.output).toContain("<plan-format-warning>");
    });

    it("does not stack warnings when one is already present", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "ok <plan-format-warning>old</plan-format-warning>" };
      await hooks["tool.execute.after"](
        { tool: "edit", sessionID: "s1", callID: "c2", args: { filePath: "docs/plans/x.md" } },
        out
      );
      expect(out.output).toBe("ok <plan-format-warning>old</plan-format-warning>");
    });

    it("warns on recognized sections with zero valid task rows", async () => {
      const planFile = join(testDir, "docs/plans/empty-section.md");
      mkdirSync(dirname(planFile), { recursive: true });
      writeFileSync(planFile, `## TODOs\nJust prose, no checkboxes here.\n`);

      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "Wrote plan file" };
      await hooks["tool.execute.after"](
        { tool: "write", sessionID: "s1", callID: "c1", args: { filePath: planFile } },
        out
      );
      expect(out.output).toContain("no valid task rows");
    });

    it("validates Final Verification Wave F-prefix format", async () => {
      const planFile = join(testDir, "docs/plans/wave.md");
      mkdirSync(dirname(planFile), { recursive: true });
      writeFileSync(planFile, `## Final Verification Wave\n- [ ] Final-1: bad label\n- [ ] F1. Good label\n`);

      const hooks = await plugin.server(mockCtx, {});
      const out = { output: "Wrote plan file" };
      await hooks["tool.execute.after"](
        { tool: "write", sessionID: "s1", callID: "c1", args: { filePath: planFile } },
        out
      );
      expect(out.output).toContain("<plan-format-warning>");
      expect(out.output).toContain("SKIPPED");
    });
  });

  // 11. notepad-directive
  describe("11. notepad-directive", () => {
    it("prepends NOTEPAD_DIRECTIVE to task tool prompt in builder sessions", async () => {
      const hooks = await plugin.server(mockCtx, {});
      await hooks["chat.message"]({ sessionID: "s-builder-2", agent: "builder" }, {});
      const out = { args: { prompt: "Build the feature." } };
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "s-builder-2", callID: "c1" }, out);
      expect(out.args.prompt).toContain(NOTEPAD_DIRECTIVE);
      expect(out.args.prompt).toContain("Build the feature.");
      expect(out.args.prompt).toContain("PLAN PATH:");
      expect(out.args.prompt).toContain("MUST NOT edit the plan file");
      expect(out.args.prompt).toContain("The Orchestrator (builder)");
    });

    it("skips injection for worker sessions", async () => {
      const hooks = await plugin.server(mockCtx, {});
      await hooks["chat.message"]({ sessionID: "s-worker-2", agent: "worker-deep" }, {});
      const out = { args: { prompt: "Build the feature." } };
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "s-worker-2", callID: "c1" }, out);
      expect(out.args.prompt).toBe("Build the feature.");
    });

    it("does not double-inject when directive already present", async () => {
      const hooks = await plugin.server(mockCtx, {});
      await hooks["chat.message"]({ sessionID: "s-builder-5", agent: "builder" }, {});
      const out = { args: { prompt: `${NOTEPAD_DIRECTIVE}\nDo the thing.` } };
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "s-builder-5", callID: "c1" }, out);
      expect(out.args.prompt).toBe(`${NOTEPAD_DIRECTIVE}\nDo the thing.`);
    });

    it("leaves non-task tools untouched", async () => {
      const hooks = await plugin.server(mockCtx, {});
      await hooks["chat.message"]({ sessionID: "s-builder-6", agent: "builder" }, {});
      const out = { args: { command: "ls" } };
      await hooks["tool.execute.before"]({ tool: "bash", sessionID: "s-builder-6", callID: "c1" }, out);
      expect(out.args).toEqual({ command: "ls" });
    });

    it("injects for untracked sessions (headless primary has no agent field)", async () => {
      const hooks = await plugin.server(mockCtx, {});
      await hooks["chat.message"]({ sessionID: "s-headless-3", agent: undefined }, {});
      const out = { args: { prompt: "Build the feature." } };
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "s-headless-3", callID: "c1" }, out);
      expect(out.args.prompt).toContain(NOTEPAD_DIRECTIVE);
      expect(out.args.prompt).toContain("Build the feature.");
    });
  });

  // 12. compaction-todo-preserver
  describe("12. compaction-todo-preserver", () => {
    it("snapshots todos on todowrite and clears on session.deleted", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { args: { todos: [{ id: "t1", content: "Work" }] } };
      await hooks["tool.execute.before"]({ tool: "todowrite", sessionID: "s-todo-1", callID: "c1" }, out);

      await hooks.event({
        event: { type: "session.deleted", properties: { id: "s-todo-1" } },
      });
    });

    it("appends open todos to context array during compaction, excluding completed ones", async () => {
      const hooks = await plugin.server(mockCtx, {});
      await hooks["tool.execute.before"](
        {
          tool: "todowrite",
          sessionID: "s-todos-2",
          callID: "c1",
        },
        {
          args: {
            todos: [
              { id: "t1", content: "Finish feature", status: "in_progress" },
              { id: "t2", content: "Done thing", status: "completed" },
            ],
          },
        }
      );
      const out = { context: [] };
      await hooks["experimental.session.compacting"]({ sessionID: "s-todos-2" }, out);
      expect(out.context.length).toBe(1);
      expect(out.context[0]).toContain("### Preserved open todos");
      expect(out.context[0]).toContain("- [ ] Finish feature");
      expect(out.context[0]).not.toContain("Done thing");
    });

    it("does not modify context when nothing is open", async () => {
      const hooks = await plugin.server(mockCtx, {});
      const out = { context: [] };
      await hooks["experimental.session.compacting"]({ sessionID: "s-empty-todos" }, out);
      expect(out.context.length).toBe(0);
    });
  });
});

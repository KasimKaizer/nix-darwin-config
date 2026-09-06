import { describe, expect, it } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getTaskTargetAgent, isWorkerTargetAgent } from "./guards.js";
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
      const out = { args: { subagent_type: "worker-deep", prompt: "Build the feature." } };
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
      const out = { args: { subagent_type: "worker-deep", prompt: "Build the feature." } };
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "s-worker-2", callID: "c1" }, out);
      expect(out.args.prompt).toBe("Build the feature.");
    });

    it("does not double-inject when directive already present", async () => {
      const hooks = await plugin.server(mockCtx, {});
      await hooks["chat.message"]({ sessionID: "s-builder-5", agent: "builder" }, {});
      const out = { args: { subagent_type: "worker-deep", prompt: `${NOTEPAD_DIRECTIVE}\nDo the thing.` } };
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
      const out = { args: { subagent_type: "worker-deep", prompt: "Build the feature." } };
      await hooks["tool.execute.before"]({ tool: "task", sessionID: "s-headless-3", callID: "c1" }, out);
      expect(out.args.prompt).toContain(NOTEPAD_DIRECTIVE);
      expect(out.args.prompt).toContain("Build the feature.");
    });

    describe("C6 worker-only scoping and fail-closed behavior", () => {
      it("unit tests getTaskTargetAgent extraction and fallback hierarchy", () => {
        expect(getTaskTargetAgent({ subagent_type: "worker-deep" })).toBe("worker-deep");
        expect(getTaskTargetAgent({ subagent: "worker-quick" })).toBe("worker-quick");
        expect(getTaskTargetAgent({ agent: "worker-ultra" })).toBe("worker-ultra");
        expect(getTaskTargetAgent({ subagent_type: "worker-deep", subagent: "worker-quick", agent: "worker-ultra" })).toBe("worker-deep");
        expect(getTaskTargetAgent({ subagent: "worker-quick", agent: "worker-ultra" })).toBe("worker-quick");
        expect(getTaskTargetAgent({ subagent_type: "", subagent: "worker-visual" })).toBe("worker-visual");
        expect(getTaskTargetAgent({ subagent_type: "   ", agent: "worker-ultra" })).toBe("worker-ultra");
        expect(getTaskTargetAgent({ subagent_type: "  worker-deep  " })).toBe("worker-deep");
        expect(getTaskTargetAgent({})).toBeUndefined();
        expect(getTaskTargetAgent({ subagent_type: "" })).toBeUndefined();
        expect(getTaskTargetAgent({ subagent_type: "   " })).toBeUndefined();
        expect(getTaskTargetAgent({ subagent_type: 123 })).toBeUndefined();
        expect(getTaskTargetAgent(null)).toBeUndefined();
        expect(getTaskTargetAgent(undefined)).toBeUndefined();
        expect(getTaskTargetAgent(["worker-deep"])).toBeUndefined();
      });

      it("unit tests isWorkerTargetAgent matching", () => {
        expect(isWorkerTargetAgent("worker-deep")).toBe(true);
        expect(isWorkerTargetAgent("worker-visual")).toBe(true);
        expect(isWorkerTargetAgent("worker-ultra")).toBe(true);
        expect(isWorkerTargetAgent("worker-quick")).toBe(true);
        expect(isWorkerTargetAgent("Worker-Deep")).toBe(true);
        expect(isWorkerTargetAgent("WORKER-QUICK")).toBe(true);
        expect(isWorkerTargetAgent("  worker-deep  ")).toBe(true);

        expect(isWorkerTargetAgent("researcher")).toBe(false);
        expect(isWorkerTargetAgent("reviewer")).toBe(false);
        expect(isWorkerTargetAgent("explorer")).toBe(false);
        expect(isWorkerTargetAgent("planner")).toBe(false);
        expect(isWorkerTargetAgent("advisor")).toBe(false);
        expect(isWorkerTargetAgent("worker")).toBe(false);
        expect(isWorkerTargetAgent("my-worker-deep")).toBe(false);
        expect(isWorkerTargetAgent("")).toBe(false);
        expect(isWorkerTargetAgent(undefined)).toBe(false);
        expect(isWorkerTargetAgent(null)).toBe(false);
      });

      const workerCases = [
        { label: "subagent_type: worker-deep", args: { subagent_type: "worker-deep", prompt: "Deep task." } },
        { label: "subagent_type: worker-visual", args: { subagent_type: "worker-visual", prompt: "Visual task." } },
        { label: "subagent_type: worker-ultra", args: { subagent_type: "worker-ultra", prompt: "Ultra task." } },
        { label: "subagent_type: worker-quick", args: { subagent_type: "worker-quick", prompt: "Quick task." } },
        { label: "case-insensitive: Worker-Deep", args: { subagent_type: "Worker-Deep", prompt: "Case task." } },
        { label: "trimmed whitespace:   worker-quick  ", args: { subagent_type: "  worker-quick  ", prompt: "Trim task." } },
        { label: "fallback subagent: worker-deep", args: { subagent: "worker-deep", prompt: "Fallback subagent task." } },
        { label: "fallback agent: worker-deep", args: { agent: "worker-deep", prompt: "Fallback agent task." } },
      ];

      for (const { label, args } of workerCases) {
        it(`(a) builder injects for worker target (${label})`, async () => {
          const hooks = await plugin.server(mockCtx, {});
          await hooks["chat.message"]({ sessionID: `s-w-${label}`, agent: "builder" }, {});
          const out = { args: { ...args } };
          await hooks["tool.execute.before"]({ tool: "task", sessionID: `s-w-${label}`, callID: "c1" }, out);
          expect(out.args.prompt).toContain(NOTEPAD_DIRECTIVE);
          expect(out.args.prompt).toContain(args.prompt);
        });
      }

      const nonWorkerTargets = [
        "researcher",
        "reviewer",
        "explorer",
        "planner",
        "advisor",
      ];

      for (const target of nonWorkerTargets) {
        it(`(b) builder does NOT inject for non-worker target (${target})`, async () => {
          const hooks = await plugin.server(mockCtx, {});
          await hooks["chat.message"]({ sessionID: `s-non-${target}`, agent: "builder" }, {});
          const out = { args: { subagent_type: target, prompt: `Task for ${target}` } };
          await hooks["tool.execute.before"]({ tool: "task", sessionID: `s-non-${target}`, callID: "c1" }, out);
          expect(out.args.prompt).toBe(`Task for ${target}`);
          expect(out.args.prompt).not.toContain(NOTEPAD_DIRECTIVE);
        });
      }

      for (const target of ["custom-agent", "worker"]) {
        it(`(b) full chain rejects unknown target (${target}) via task validator`, async () => {
          const hooks = await plugin.server(mockCtx, {});
          await hooks["chat.message"]({ sessionID: `s-unk-${target}`, agent: "builder" }, {});
          const out = { args: { subagent_type: target, prompt: `Task for ${target}` } };
          await expect(
            hooks["tool.execute.before"]({ tool: "task", sessionID: `s-unk-${target}`, callID: "c1" }, out)
          ).rejects.toThrow("unknown_agent");
        });
      }

      it("(c) builder does NOT inject when target agent is missing completely", async () => {
        const hooks = await plugin.server(mockCtx, {});
        await hooks["chat.message"]({ sessionID: "s-builder-missing-1", agent: "builder" }, {});
        const out = { args: { prompt: "No target specified." } };
        await hooks["tool.execute.before"]({ tool: "task", sessionID: "s-builder-missing-1", callID: "c1" }, out);
        expect(out.args.prompt).toBe("No target specified.");
        expect(out.args.prompt).not.toContain(NOTEPAD_DIRECTIVE);
      });

      it("(c) full chain rejects empty-string target via task validator", async () => {
        const hooks = await plugin.server(mockCtx, {});
        await hooks["chat.message"]({ sessionID: "s-builder-missing-2", agent: "builder" }, {});
        const out = { args: { subagent_type: "", prompt: "Empty target string." } };
        await expect(
          hooks["tool.execute.before"]({ tool: "task", sessionID: "s-builder-missing-2", callID: "c1" }, out)
        ).rejects.toThrow("empty_agent");
      });

      it("(c) full chain rejects whitespace-only target via task validator", async () => {
        const hooks = await plugin.server(mockCtx, {});
        await hooks["chat.message"]({ sessionID: "s-builder-missing-3", agent: "builder" }, {});
        const out = { args: { subagent_type: "   ", prompt: "Whitespace target string." } };
        await expect(
          hooks["tool.execute.before"]({ tool: "task", sessionID: "s-builder-missing-3", callID: "c1" }, out)
        ).rejects.toThrow("empty_agent");
      });

      it("(d) worker-deep caller session is blocked by caller gate even with worker-deep target", async () => {
        const hooks = await plugin.server(mockCtx, {});
        await hooks["chat.message"]({ sessionID: "s-worker-gate-1", agent: "worker-deep" }, {});
        const out = { args: { subagent_type: "worker-deep", prompt: "Worker delegating." } };
        await hooks["tool.execute.before"]({ tool: "task", sessionID: "s-worker-gate-1", callID: "c1" }, out);
        expect(out.args.prompt).toBe("Worker delegating.");
        expect(out.args.prompt).not.toContain(NOTEPAD_DIRECTIVE);
      });

      it("(d) other non-builder callers (e.g. explorer) are blocked by caller gate", async () => {
        const hooks = await plugin.server(mockCtx, {});
        await hooks["chat.message"]({ sessionID: "s-explorer-gate-1", agent: "explorer" }, {});
        const out = { args: { subagent_type: "worker-quick", prompt: "Explorer calling worker." } };
        await hooks["tool.execute.before"]({ tool: "task", sessionID: "s-explorer-gate-1", callID: "c1" }, out);
        expect(out.args.prompt).toBe("Explorer calling worker.");
        expect(out.args.prompt).not.toContain(NOTEPAD_DIRECTIVE);
      });

      it("(e) existing <Work_Context> prompt is untouched (idempotent)", async () => {
        const hooks = await plugin.server(mockCtx, {});
        await hooks["chat.message"]({ sessionID: "s-builder-idem-1", agent: "builder" }, {});
        const initialPrompt = "Some preamble\n<Work_Context>\nCustom context\n</Work_Context>\nSome instruction";
        const out = { args: { subagent_type: "worker-deep", prompt: initialPrompt } };
        await hooks["tool.execute.before"]({ tool: "task", sessionID: "s-builder-idem-1", callID: "c1" }, out);
        expect(out.args.prompt).toBe(initialPrompt);
      });

      it("mutates output.args in place so the server picks it up (spread-replace would be lost)", async () => {
        const hooks = await plugin.server(mockCtx, {});
        await hooks["chat.message"]({ sessionID: "s-builder-inplace-1", agent: "builder" }, {});
        // Mirrors the live server trigger: output = { args } shares the
        // tool's live args reference and item.execute(args) uses the original
        // reference, so only in-place property mutation propagates.
        const liveArgs = {
          subagent_type: "worker-deep",
          prompt: "Task with live args.",
        };
        const out = { args: liveArgs };
        await hooks["tool.execute.before"]({ tool: "task", sessionID: "s-builder-inplace-1", callID: "c1" }, out);
        expect(out.args).toBe(liveArgs);
        expect(liveArgs.prompt).toContain(NOTEPAD_DIRECTIVE);
        expect(liveArgs.prompt).toContain("Task with live args.");
      });
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

    it("falls back to ctx.client.session.todo when in-memory snapshot is missing (post-restart)", async () => {
      const mockWithClient = {
        ...mockCtx,
        client: {
          ...mockCtx.client,
          session: {
            todo: async () => ({
              data: [
                { content: "Recovered task", status: "in_progress" },
                { content: "Done task", status: "completed" },
              ],
            }),
          },
        },
      };
      const hooks = await plugin.server(mockWithClient, {});
      const out = { context: [] };
      await hooks["experimental.session.compacting"]({ sessionID: "s-persisted-client" }, out);
      expect(out.context.length).toBe(1);
      expect(out.context[0]).toContain("- [ ] Recovered task");
      expect(out.context[0]).not.toContain("Done task");
    });
  });
});

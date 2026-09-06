import { describe, expect, it } from "bun:test";
import {
  buildRetryGuidance,
  createDelegateTaskRetryHook,
  FORBIDDEN_TASK_ARGS,
  LOCAL_SUBAGENTS,
  RETRY_GUIDANCE_MARKER,
} from "./retry.js";

const VALID_LOCAL_SUBAGENTS = [
  "worker-deep",
  "worker-visual",
  "worker-ultra",
  "worker-quick",
  "planner",
  "reviewer",
  "advisor",
  "explorer",
  "researcher",
];

describe("C3 delegate-task-retry (pre-dispatch validator)", () => {
  describe("LOCAL_SUBAGENTS", () => {
    it("matches the configured local roster", () => {
      expect([...LOCAL_SUBAGENTS].sort()).toEqual([...VALID_LOCAL_SUBAGENTS].sort());
    });
  });

  describe("FORBIDDEN_TASK_ARGS", () => {
    it("forbids exactly the OMO-era params", () => {
      expect(FORBIDDEN_TASK_ARGS.map((r) => r.arg).sort()).toEqual(
        ["category", "load_skills", "run_in_background"].sort()
      );
      for (const entry of FORBIDDEN_TASK_ARGS) {
        expect(typeof entry.errorType).toBe("string");
        expect(typeof entry.fixHint).toBe("string");
      }
    });
  });

  describe("buildRetryGuidance", () => {
    it("builds guidance with marker, type, fix, and local example", () => {
      const guidance = buildRetryGuidance("unknown_agent", "bad-agent");

      expect(guidance).toContain(RETRY_GUIDANCE_MARKER);
      expect(guidance).toContain("unknown_agent");
      expect(guidance).toContain("bad-agent");
      expect(guidance).toContain('subagent_type="worker-quick"');
      expect(guidance).toContain('description="..."');
      expect(guidance).toContain('prompt="..."');
      expect(guidance).not.toContain("category=");
      expect(guidance).not.toContain("run_in_background=");
      expect(guidance).not.toContain("load_skills=");
    });

    it("names valid local subagent_types for unknown_agent", () => {
      const guidance = buildRetryGuidance("unknown_agent", "unknown-helper");

      for (const agent of VALID_LOCAL_SUBAGENTS) {
        expect(guidance).toContain(agent);
      }
    });

    it("returns default fix for unrecognized errorType", () => {
      const guidance = buildRetryGuidance("some_unrecognized_error");

      expect(guidance).toContain(RETRY_GUIDANCE_MARKER);
      expect(guidance).toContain("some_unrecognized_error");
    });
  });

  describe("createDelegateTaskRetryHook", () => {
    it("passes every roster subagent untouched without mutating args", async () => {
      const hook = createDelegateTaskRetryHook();
      for (const agent of VALID_LOCAL_SUBAGENTS) {
        const args = { subagent_type: agent, description: "d", prompt: "Do it." };
        const output = { args };
        await hook["tool.execute.before"](
          { tool: "task", sessionID: "ses_1", callID: `c-${agent}` },
          output
        );
        expect(output.args).toBe(args);
        expect(args).toEqual({ subagent_type: agent, description: "d", prompt: "Do it." });
      }
    });

    it("tolerates case and surrounding whitespace in roster names", async () => {
      const hook = createDelegateTaskRetryHook();
      for (const agent of ["Worker-Deep", "  worker-quick  ", "EXPLORER"]) {
        const output = { args: { subagent_type: agent, prompt: "Do it." } };
        await hook["tool.execute.before"](
          { tool: "task", sessionID: "ses_1", callID: "c1" },
          output
        );
        expect(output.args.subagent_type).toBe(agent);
      }
    });

    it("accepts fallback agent keys (subagent/agent)", async () => {
      const hook = createDelegateTaskRetryHook();
      for (const args of [
        { subagent: "worker-quick", prompt: "Do it." },
        { agent: "explorer", prompt: "Do it." },
      ]) {
        const output = { args: { ...args } };
        await hook["tool.execute.before"](
          { tool: "task", sessionID: "ses_1", callID: "c1" },
          output
        );
        expect(output.args).toEqual(args);
      }
    });

    it("skips non-task tools", async () => {
      const hook = createDelegateTaskRetryHook();
      const output = { args: { command: "ls" } };
      await hook["tool.execute.before"](
        { tool: "bash", sessionID: "ses_1", callID: "c1" },
        output
      );
      expect(output.args).toEqual({ command: "ls" });
    });

    it("fails open on missing, null, or array args", async () => {
      const hook = createDelegateTaskRetryHook();
      for (const args of [undefined, null, 42, "worker-quick", ["worker-quick"]]) {
        const output = { args } as unknown as { args: object };
        await hook["tool.execute.before"](
          { tool: "task", sessionID: "ses_1", callID: "c1" },
          output
        );
        expect(output.args).toBe(args);
      }
    });

    it("fails open when no agent key is present (server validates the rest)", async () => {
      const hook = createDelegateTaskRetryHook();
      const output = { args: { description: "d", prompt: "Do it." } };
      await hook["tool.execute.before"](
        { tool: "task", sessionID: "ses_1", callID: "c1" },
        output
      );
      expect(output.args).toEqual({ description: "d", prompt: "Do it." });
    });

    it("throws guidance for empty agent names", async () => {
      const hook = createDelegateTaskRetryHook();
      for (const agent of ["", "   "]) {
        const output = { args: { subagent_type: agent, prompt: "Do it." } };
        const err = await hook["tool.execute.before"](
          { tool: "task", sessionID: "ses_1", callID: "c1" },
          output
        ).then(
          () => null,
          (e: unknown) => e as Error
        );
        expect(err).not.toBeNull();
        expect(err?.message).toContain(RETRY_GUIDANCE_MARKER);
        expect(err?.message).toContain("empty_agent");
      }
    });

    it("throws guidance naming the roster for unknown agents", async () => {
      const hook = createDelegateTaskRetryHook();
      const output = { args: { subagent_type: "bad-agent", prompt: "Do it." } };
      const err = await hook["tool.execute.before"](
        { tool: "task", sessionID: "ses_1", callID: "c1" },
        output
      ).then(
        () => null,
        (e: unknown) => e as Error
      );
      expect(err).not.toBeNull();
      expect(err?.message).toContain(RETRY_GUIDANCE_MARKER);
      expect(err?.message).toContain("unknown_agent");
      expect(err?.message).toContain("bad-agent");
      for (const agent of VALID_LOCAL_SUBAGENTS) {
        expect(err?.message).toContain(agent);
      }
    });

    it("throws guidance for the primary builder agent", async () => {
      const hook = createDelegateTaskRetryHook();
      for (const agent of ["builder", "Builder", "  builder "]) {
        const output = { args: { subagent_type: agent, prompt: "Do it." } };
        const err = await hook["tool.execute.before"](
          { tool: "task", sessionID: "ses_1", callID: "c1" },
          output
        ).then(
          () => null,
          (e: unknown) => e as Error
        );
        expect(err).not.toBeNull();
        expect(err?.message).toContain(RETRY_GUIDANCE_MARKER);
        expect(err?.message).toContain("primary_agent");
      }
    });

    it("throws guidance for forbidden OMO-era params", async () => {
      const hook = createDelegateTaskRetryHook();
      for (const [arg, errorType] of [
        ["run_in_background", "forbidden_run_in_background"],
        ["load_skills", "forbidden_load_skills"],
        ["category", "forbidden_category"],
      ] as const) {
        const output = {
          args: { subagent_type: "worker-quick", prompt: "Do it.", [arg]: "x" },
        };
        const err = await hook["tool.execute.before"](
          { tool: "task", sessionID: "ses_1", callID: "c1" },
          output
        ).then(
          () => null,
          (e: unknown) => e as Error
        );
        expect(err).not.toBeNull();
        expect(err?.message).toContain(RETRY_GUIDANCE_MARKER);
        expect(err?.message).toContain(errorType);
      }
    });

    it("validates worker-caller sessions too (no session gate)", async () => {
      const hook = createDelegateTaskRetryHook();
      const output = { args: { subagent_type: "nope", prompt: "Do it." } };
      const err = await hook["tool.execute.before"](
        { tool: "task", sessionID: "ses-worker", callID: "c1" },
        output
      ).then(
        () => null,
        (e: unknown) => e as Error
      );
      expect(err?.message).toContain(RETRY_GUIDANCE_MARKER);
    });
  });
});

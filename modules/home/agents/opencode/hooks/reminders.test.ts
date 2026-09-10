import { describe, expect, it } from "bun:test";
import { recordSessionAgent } from "./guards.js";
import {
  AGENT_USAGE_REMINDER,
  AGENT_USAGE_REMINDER_MARKER,
  createAgentUsageReminderHook,
  createTaskReminderHook,
  isPlanFilePath,
  TASK_REMINDER_MARKER,
} from "./reminders.js";

describe("agent-usage-reminder (C4a)", () => {
  it("never references forbidden OMO terms in reminder copy", () => {
    const lower = AGENT_USAGE_REMINDER.toLowerCase();
    expect(lower).not.toContain("sisyphus");
    expect(lower).not.toContain("atlas");
    expect(lower).not.toContain("call_omo_agent");
    expect(lower).not.toContain("explore-as-omo");
    expect(AGENT_USAGE_REMINDER).toContain('task(subagent_type=');
    expect(AGENT_USAGE_REMINDER).toContain("3 times");
  });

  it("(a) builder grep without prior task appends reminder", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-builder-a", "builder");

    const out = { output: "matched lines in foo.txt" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-a", callID: "c1" },
      out
    );

    expect(out.output).toContain(AGENT_USAGE_REMINDER_MARKER);
    expect(out.output).toContain("matched lines in foo.txt");
    expect(out.output).toContain("Explorer: task(subagent_type=\"explorer\"");
  });

  it("(b) re-arms after task call when cap was reached", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-builder-b", "builder");

    // 3 direct grep calls trigger reminders (reminderCount = 3)
    for (let i = 1; i <= 3; i++) {
      const out = { output: `matched lines ${i}` };
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: "s-builder-b", callID: `c${i}` },
        out
      );
      expect(out.output).toContain(AGENT_USAGE_REMINDER_MARKER);
    }

    // 4th direct grep call has no reminder (cap reached)
    const out4 = { output: "matched lines 4" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-b", callID: "c4" },
      out4
    );
    expect(out4.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);
    expect(out4.output).toBe("matched lines 4");

    // Calling task resets reminderCount
    const taskOut = { output: "Subagent completed work" };
    await hook["tool.execute.after"](
      { tool: "task", sessionID: "s-builder-b", callID: "c-task" },
      taskOut
    );
    expect(taskOut.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);

    // 5th direct grep call appends reminder again
    const out5 = { output: "matched lines 5" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-b", callID: "c5" },
      out5
    );
    expect(out5.output).toContain(AGENT_USAGE_REMINDER_MARKER);
  });

  it("(c) 4th direct call in same session has no 4th reminder", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-builder-c", "builder");

    // Calls 1, 2, 3 should append reminder
    for (let i = 1; i <= 3; i++) {
      const out = { output: `result ${i}` };
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: "s-builder-c", callID: `c${i}` },
        out
      );
      expect(out.output).toContain(AGENT_USAGE_REMINDER_MARKER);
    }

    // 4th call should NOT append reminder
    const out4 = { output: "result 4" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-c", callID: "c4" },
      out4
    );
    expect(out4.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);
    expect(out4.output).toBe("result 4");

    // 5th call also should NOT append reminder
    const out5 = { output: "result 5" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-c", callID: "c5" },
      out5
    );
    expect(out5.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);
    expect(out5.output).toBe("result 5");
  });

  it("(d) explorer-tracked caller gets no reminder", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-explorer-d", "explorer");

    const out = { output: "matched pattern in baz.ts" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-explorer-d", callID: "c1" },
      out
    );
    expect(out.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);
    expect(out.output).toBe("matched pattern in baz.ts");

    // Other non-builder agents should also get none
    recordSessionAgent("s-worker-d", "worker-deep");
    const workerOut = { output: "worker grep output" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-worker-d", callID: "c2" },
      workerOut
    );
    expect(workerOut.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);

    recordSessionAgent("s-researcher-d", "researcher");
    const resOut = { output: "researcher doc results" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-researcher-d", callID: "c3" },
      resOut
    );
    expect(resOut.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);
  });

  it("(e) session.deleted resets counter and state", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-builder-e", "builder");

    // Reach MAX_REMINDERS = 3 via 3 direct grep calls
    for (let i = 1; i <= 3; i++) {
      const out = { output: `grep output ${i}` };
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: "s-builder-e", callID: `c${i}` },
        out
      );
      expect(out.output).toContain(AGENT_USAGE_REMINDER_MARKER);
    }

    // Verify 4th is silent (cap reached)
    const out4 = { output: "grep output 4" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-e", callID: "c4" },
      out4
    );
    expect(out4.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);

    // Fire session.deleted event
    await hook.event({
      event: { type: "session.deleted", properties: { id: "s-builder-e" } },
    });

    // Now 5th direct grep should append reminder again because state was deleted
    const out5 = { output: "grep output 5" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-e", callID: "c5" },
      out5
    );
    expect(out5.output).toContain(AGENT_USAGE_REMINDER_MARKER);
  });

  it("calling task resets reminderCount to 0 when previously below MAX_REMINDERS", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-builder-reset", "builder");

    // Call grep once (reminderCount = 1)
    const out1 = { output: "grep 1" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-reset", callID: "c1" },
      out1
    );
    expect(out1.output).toContain(AGENT_USAGE_REMINDER_MARKER);

    // Call task to reset reminderCount to 0
    await hook["tool.execute.after"](
      { tool: "task", sessionID: "s-builder-reset", callID: "c2" },
      { output: "subagent task done" }
    );

    // Now verify we can get 3 full reminders in this new cycle
    for (let i = 3; i <= 5; i++) {
      const out = { output: `grep ${i}` };
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: "s-builder-reset", callID: `c${i}` },
        out
      );
      expect(out.output).toContain(AGENT_USAGE_REMINDER_MARKER);
    }

    // 4th call in this cycle (6th overall) is capped
    const out6 = { output: "grep 6" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-reset", callID: "c6" },
      out6
    );
    expect(out6.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);
  });

  it("appends reminder for untracked headless sessions", async () => {
    const hook = createAgentUsageReminderHook();
    // No recordSessionAgent called for s-untracked-1
    const out = { output: "headless search output" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-untracked-1", callID: "c1" },
      out
    );
    expect(out.output).toContain(AGENT_USAGE_REMINDER_MARKER);
  });

  it("handles target tools: glob, webfetch, and prefix tools", async () => {
    recordSessionAgent("s-builder-tools", "builder");

    const tools = [
      "glob",
      "webfetch",
      "exa_web_search_exa",
      "context7_query-docs",
      "grep_app_searchgithub",
      "mcp-gateway_browser_click",
      "codegraph_explore",
    ];

    for (const tool of tools) {
      const hookInstance = createAgentUsageReminderHook();
      const out = { output: `output for ${tool}` };
      await hookInstance["tool.execute.after"](
        { tool, sessionID: `s-builder-${tool}`, callID: "c1" },
        out
      );
      expect(out.output).toContain(AGENT_USAGE_REMINDER_MARKER);
    }
  });

  it("is case-insensitive on tool names", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-builder-case", "builder");

    const out = { output: "case test" };
    await hook["tool.execute.after"](
      { tool: "GREP", sessionID: "s-builder-case", callID: "c1" },
      out
    );
    expect(out.output).toContain(AGENT_USAGE_REMINDER_MARKER);
  });

  it("ignores non-target tools like bash, read, write, edit", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-builder-non-target", "builder");

    for (const tool of ["bash", "read", "write", "edit", "todowrite"]) {
      const out = { output: "result" };
      await hook["tool.execute.after"](
        { tool, sessionID: "s-builder-non-target", callID: "c1" },
        out
      );
      expect(out.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);
      expect(out.output).toBe("result");
    }
  });

  it("ignores non-string or empty/missing output", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-builder-non-string", "builder");

    const nonStringOut = { output: 12345 };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-non-string", callID: "c1" },
      nonStringOut
    );
    expect(nonStringOut.output).toBe(12345);

    const nullOut = { output: null };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-non-string", callID: "c2" },
      nullOut
    );
    expect(nullOut.output).toBeNull();
  });

  it("does not duplicate reminder if marker is already present", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-builder-nodup", "builder");

    const out = { output: `previous output\n${AGENT_USAGE_REMINDER_MARKER}\nsome reminder` };
    const original = out.output;
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-nodup", callID: "c1" },
      out
    );
    expect(out.output).toBe(original);
  });

  it("multi-session isolation: Session A at cap (3 nags) does not affect Session B at 0 nags", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-builder-iso-A", "builder");
    recordSessionAgent("s-builder-iso-B", "builder");

    // Session A reaches cap = 3 via 3 direct grep calls
    for (let i = 1; i <= 3; i++) {
      const out = { output: `grep A ${i}` };
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: "s-builder-iso-A", callID: `c-a-${i}` },
        out
      );
      expect(out.output).toContain(AGENT_USAGE_REMINDER_MARKER);
    }

    // 4th call in Session A is silent (cap reached)
    const outA4 = { output: "grep A 4" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-iso-A", callID: "c-a-4" },
      outA4
    );
    expect(outA4.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);

    // Session B is completely independent, starts at count 0, gets reminder on direct tool
    for (let i = 1; i <= 3; i++) {
      const outB = { output: `grep B ${i}` };
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: "s-builder-iso-B", callID: `c-b-${i}` },
        outB
      );
      expect(outB.output).toContain(AGENT_USAGE_REMINDER_MARKER);
    }

    // 4th call in Session B is capped
    const outB4 = { output: "grep B 4" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-iso-B", callID: "c-b-4" },
      outB4
    );
    expect(outB4.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);
  });

  it("session.deleted purges Session A to fresh reminderCount: 0 while Session B remains unaffected", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-builder-del-A", "builder");
    recordSessionAgent("s-builder-del-B", "builder");

    // Session A reaches cap = 3
    for (let i = 1; i <= 3; i++) {
      const out = { output: `grep A ${i}` };
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: "s-builder-del-A", callID: `c-a-${i}` },
        out
      );
      expect(out.output).toContain(AGENT_USAGE_REMINDER_MARKER);
    }
    const outA4 = { output: "grep A 4" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-del-A", callID: "c-a-4" },
      outA4
    );
    expect(outA4.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);

    // Session B is at count 1
    const outB1 = { output: "grep B 1" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-del-B", callID: "c-b-1" },
      outB1
    );
    expect(outB1.output).toContain(AGENT_USAGE_REMINDER_MARKER);

    // Delete Session A
    await hook.event({
      event: { type: "session.deleted", properties: { id: "s-builder-del-A" } },
    });

    // Session A is fresh: can trigger 3 more reminders
    for (let i = 1; i <= 3; i++) {
      const outFresh = { output: `grep fresh ${i}` };
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: "s-builder-del-A", callID: `c-fresh-${i}` },
        outFresh
      );
      expect(outFresh.output).toContain(AGENT_USAGE_REMINDER_MARKER);
    }
    const outFresh4 = { output: "grep fresh 4" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-del-A", callID: "c-fresh-4" },
      outFresh4
    );
    expect(outFresh4.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);

    // Session B was untouched: currently at count 1, so count 2 and count 3 trigger reminders, count 4 capped
    const outB2 = { output: "grep B 2" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-del-B", callID: "c-b-2" },
      outB2
    );
    expect(outB2.output).toContain(AGENT_USAGE_REMINDER_MARKER);

    const outB3 = { output: "grep B 3" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-del-B", callID: "c-b-3" },
      outB3
    );
    expect(outB3.output).toContain(AGENT_USAGE_REMINDER_MARKER);

    const outB4 = { output: "grep B 4" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-del-B", callID: "c-b-4" },
      outB4
    );
    expect(outB4.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);
  });

  it("session.deleted with unknown ID or malformed payload is safe and preserves active sessions", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-builder-active", "builder");

    // Session active at count 2
    for (let i = 1; i <= 2; i++) {
      const out = { output: `grep ${i}` };
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: "s-builder-active", callID: `c-${i}` },
        out
      );
      expect(out.output).toContain(AGENT_USAGE_REMINDER_MARKER);
    }

    // Delete unknown session
    await hook.event({
      event: { type: "session.deleted", properties: { id: "non-existent-session-id" } },
    });
    // Malformed event objects
    await hook.event({
      event: { type: "session.deleted", properties: {} },
    });
    await hook.event({
      event: { type: "other.event", properties: { id: "s-builder-active" } },
    });
    await hook.event(null);
    await hook.event(undefined);

    // Active session still at count 2: 3rd call gets nag, 4th call capped
    const out3 = { output: "grep 3" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-active", callID: "c-3" },
      out3
    );
    expect(out3.output).toContain(AGENT_USAGE_REMINDER_MARKER);

    const out4 = { output: "grep 4" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-active", callID: "c-4" },
      out4
    );
    expect(out4.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);
  });

  it("session.deleted resolves sessionID from properties.id, properties.sessionID, or properties.info.id", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-prop-id", "builder");
    recordSessionAgent("s-prop-sessionid", "builder");
    recordSessionAgent("s-prop-info-id", "builder");

    // Put all 3 at cap (3 nags)
    for (const sid of ["s-prop-id", "s-prop-sessionid", "s-prop-info-id"]) {
      for (let i = 1; i <= 3; i++) {
        await hook["tool.execute.after"](
          { tool: "grep", sessionID: sid, callID: `c-${sid}-${i}` },
          { output: "grep" }
        );
      }
      const outCap = { output: "capped" };
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: sid, callID: `c-${sid}-cap` },
        outCap
      );
      expect(outCap.output).toBe("capped");
    }

    // Delete using properties.id
    await hook.event({
      event: { type: "session.deleted", properties: { id: "s-prop-id" } },
    });
    // Delete using properties.sessionID
    await hook.event({
      event: { type: "session.deleted", properties: { sessionID: "s-prop-sessionid" } },
    });
    // Delete using properties.info.id
    await hook.event({
      event: { type: "session.deleted", properties: { info: { id: "s-prop-info-id" } } },
    });

    // All 3 should be fresh again
    for (const sid of ["s-prop-id", "s-prop-sessionid", "s-prop-info-id"]) {
      const outFresh = { output: "fresh" };
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: sid, callID: `c-${sid}-fresh` },
        outFresh
      );
      expect(outFresh.output).toContain(AGENT_USAGE_REMINDER_MARKER);
    }
  });

  it("non-builder sessions never receive reminders and cannot modify builder session state", async () => {
    const hook = createAgentUsageReminderHook();
    recordSessionAgent("s-builder-main", "builder");
    recordSessionAgent("s-worker-subagent", "worker-quick");

    // Builder gets 2 nags
    for (let i = 1; i <= 2; i++) {
      const out = { output: `builder grep ${i}` };
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: "s-builder-main", callID: `c-b-${i}` },
        out
      );
      expect(out.output).toContain(AGENT_USAGE_REMINDER_MARKER);
    }

    // Non-builder worker calls grep - must NEVER receive nag
    for (let i = 1; i <= 5; i++) {
      const workerOut = { output: `worker grep ${i}` };
      await hook["tool.execute.after"](
        { tool: "grep", sessionID: "s-worker-subagent", callID: `c-w-${i}` },
        workerOut
      );
      expect(workerOut.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);
      expect(workerOut.output).toBe(`worker grep ${i}`);
    }

    // Non-builder calls task - must NOT reset builder's session state
    await hook["tool.execute.after"](
      { tool: "task", sessionID: "s-worker-subagent", callID: "c-w-task" },
      { output: "worker finished task" }
    );

    // Builder's 3rd grep is nag #3 (not reset to #1)
    const out3 = { output: "builder grep 3" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-main", callID: "c-b-3" },
      out3
    );
    expect(out3.output).toContain(AGENT_USAGE_REMINDER_MARKER);

    // Builder's 4th grep is capped
    const out4 = { output: "builder grep 4" };
    await hook["tool.execute.after"](
      { tool: "grep", sessionID: "s-builder-main", callID: "c-b-4" },
      out4
    );
    expect(out4.output).not.toContain(AGENT_USAGE_REMINDER_MARKER);
  });
});

describe("createTaskReminderHook (C4c task-reminder)", () => {
  it("(a) 9 direct bash calls silent, 10th appends reminder and resets", async () => {
    const hook = createTaskReminderHook();
    const sessionID = "session-a";

    // 9 direct bash calls remain silent
    for (let i = 1; i <= 9; i++) {
      const output = { output: `bash output ${i}` };
      await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: `c-${i}` }, output);
      expect(output.output).toBe(`bash output ${i}`);
      expect(output.output).not.toContain(TASK_REMINDER_MARKER);
    }

    // 10th call appends reminder and resets
    const out10 = { output: "bash output 10" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c-10" }, out10);
    expect(out10.output).toContain("bash output 10");
    expect(out10.output).toContain(TASK_REMINDER_MARKER);

    // 11th call (turn 1 after reset) is silent again
    const out11 = { output: "bash output 11" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c-11" }, out11);
    expect(out11.output).toBe("bash output 11");
    expect(out11.output).not.toContain(TASK_REMINDER_MARKER);

    // 8 more calls (total 9 after reset) are silent
    for (let i = 12; i <= 19; i++) {
      const output = { output: `bash output ${i}` };
      await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: `c-${i}` }, output);
      expect(output.output).not.toContain(TASK_REMINDER_MARKER);
    }

    // 20th call (10th after reset) appends reminder again
    const out20 = { output: "bash output 20" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c-20" }, out20);
    expect(out20.output).toContain(TASK_REMINDER_MARKER);
  });

  it("does NOT append reminder for empty or non-string outputs", async () => {
    const hook = createTaskReminderHook();
    const sessionID = "session-empty";

    // 9 calls to get count to 9
    for (let i = 1; i <= 9; i++) {
      const out = { output: `ok ${i}` };
      await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: `c-${i}` }, out);
    }

    // 10th call has empty string output
    const emptyOut = { output: "" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c-10" }, emptyOut);
    expect(emptyOut.output).toBe("");

    // 10th call with whitespace-only output
    const wsOut = { output: "   \n" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c-10-ws" }, wsOut);
    expect(wsOut.output).not.toContain(TASK_REMINDER_MARKER);

    // 10th call with non-string output
    const nonStrOut = { output: 12345 };
    await hook["tool.execute.after"](
      { tool: "bash", sessionID, callID: "c-10-num" },
      nonStrOut as unknown as { output: string }
    );
    expect(nonStrOut.output).toBe(12345);

    // Once a valid string output arrives at count >= 10, it fires
    const validOut = { output: "actual output" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c-11" }, validOut);
    expect(validOut.output).toContain(TASK_REMINDER_MARKER);
  });

  it("(b) todowrite/task mid-stream resets", async () => {
    const hook = createTaskReminderHook();
    const sessionID = "session-b";

    // 5 bash calls
    for (let i = 1; i <= 5; i++) {
      const out = { output: `cmd ${i}` };
      await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: `c-${i}` }, out);
      expect(out.output).not.toContain(TASK_REMINDER_MARKER);
    }

    // todowrite call resets counter
    const todoOut = { output: "todos updated" };
    await hook["tool.execute.after"]({ tool: "todowrite", sessionID, callID: "c-todo" }, todoOut);
    expect(todoOut.output).toBe("todos updated");

    // Next 9 bash calls must be silent
    for (let i = 1; i <= 9; i++) {
      const out = { output: `after-todo ${i}` };
      await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: `c-post-todo-${i}` }, out);
      expect(out.output).not.toContain(TASK_REMINDER_MARKER);
    }

    // 10th bash call after todowrite appends reminder
    const out10 = { output: "after-todo 10" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c-post-todo-10" }, out10);
    expect(out10.output).toContain(TASK_REMINDER_MARKER);

    // Test task tool reset
    // 6 bash calls
    for (let i = 1; i <= 6; i++) {
      const out = { output: `task-test ${i}` };
      await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: `c-pre-task-${i}` }, out);
      expect(out.output).not.toContain(TASK_REMINDER_MARKER);
    }

    // task call resets counter
    const taskOut = { output: "task completed" };
    await hook["tool.execute.after"]({ tool: "task", sessionID, callID: "c-task" }, taskOut);
    expect(taskOut.output).toBe("task completed");

    // 9 bash calls silent
    for (let i = 1; i <= 9; i++) {
      const out = { output: `post-task ${i}` };
      await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: `c-post-task-${i}` }, out);
      expect(out.output).not.toContain(TASK_REMINDER_MARKER);
    }

    // 10th fires
    const outPostTask10 = { output: "post-task 10" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c-post-task-10" }, outPostTask10);
    expect(outPostTask10.output).toContain(TASK_REMINDER_MARKER);
  });

  it("(c) docs/plans/foo.md edit resets", async () => {
    const hook = createTaskReminderHook();
    const sessionID = "session-c";

    // 7 bash calls
    for (let i = 1; i <= 7; i++) {
      const out = { output: `build ${i}` };
      await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: `c-${i}` }, out);
      expect(out.output).not.toContain(TASK_REMINDER_MARKER);
    }

    // edit on a NON-plan file (e.g. src/index.js) does NOT reset, counts as turn 8
    const editCodeOut = { output: "edited code", args: { filePath: "src/index.js" } };
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c-edit-code" }, editCodeOut);
    expect(editCodeOut.output).toBe("edited code");

    // turn 9
    const bash9 = { output: "build 9" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c-9" }, bash9);
    expect(bash9.output).not.toContain(TASK_REMINDER_MARKER);

    // edit on docs/plans/foo.md resets counter
    const editPlanOut = { output: "edited plan", args: { filePath: "docs/plans/foo.md" } };
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c-edit-plan" }, editPlanOut);
    expect(editPlanOut.output).toBe("edited plan");

    // 9 subsequent calls must be silent
    for (let i = 1; i <= 9; i++) {
      const out = { output: `post-plan ${i}` };
      await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: `c-post-plan-${i}` }, out);
      expect(out.output).not.toContain(TASK_REMINDER_MARKER);
    }

    // 10th call fires
    const out10 = { output: "post-plan 10" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c-post-plan-10" }, out10);
    expect(out10.output).toContain(TASK_REMINDER_MARKER);

    // Also verify write to plan file with input.args path resolution resets
    // 5 bash calls
    for (let i = 1; i <= 5; i++) {
      await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: `c-pre-write-${i}` }, { output: "cmd" });
    }
    const writePlanOut = { output: "wrote plan" };
    await hook["tool.execute.after"](
      {
        tool: "write",
        sessionID,
        callID: "c-write-plan",
        args: { path: "./docs/plans/sub/progress.md" },
      } as unknown as {
        tool: string;
        sessionID: string;
        callID: string;
        args: { path: string };
      },
      writePlanOut
    );
    // 9 subsequent calls silent
    for (let i = 1; i <= 9; i++) {
      const out = { output: `post-write ${i}` };
      await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: `c-post-write-${i}` }, out);
      expect(out.output).not.toContain(TASK_REMINDER_MARKER);
    }
    const outWrite10 = { output: "post-write 10" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c-post-write-10" }, outWrite10);
    expect(outWrite10.output).toContain(TASK_REMINDER_MARKER);
  });

  it("(d) session.deleted clears", async () => {
    const hook = createTaskReminderHook();
    const session1 = "session-d-1";
    const session2 = "session-d-2";

    // 8 calls in session 1
    for (let i = 1; i <= 8; i++) {
      await hook["tool.execute.after"]({ tool: "bash", sessionID: session1, callID: `c1-${i}` }, { output: "s1" });
    }

    // 9 calls in session 2
    for (let i = 1; i <= 9; i++) {
      await hook["tool.execute.after"]({ tool: "bash", sessionID: session2, callID: `c2-${i}` }, { output: "s2" });
    }

    // session.deleted event for session 1
    await hook.event({ event: { type: "session.deleted", properties: { id: session1 } } });

    // session 1 should now be at 0: next 9 calls are silent
    for (let i = 1; i <= 9; i++) {
      const out = { output: `s1-post-del-${i}` };
      await hook["tool.execute.after"]({ tool: "bash", sessionID: session1, callID: `c1-del-${i}` }, out);
      expect(out.output).not.toContain(TASK_REMINDER_MARKER);
    }

    // 10th call in session 1 fires
    const s1Out10 = { output: "s1-post-del-10" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID: session1, callID: "c1-del-10" }, s1Out10);
    expect(s1Out10.output).toContain(TASK_REMINDER_MARKER);

    // Meanwhile, session 2 was unaffected by session 1's deletion; its 10th call fires
    const s2Out10 = { output: "s2-turn-10" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID: session2, callID: "c2-10" }, s2Out10);
    expect(s2Out10.output).toContain(TASK_REMINDER_MARKER);
  });

  it("correctly identifies plan file paths via isPlanFilePath", () => {
    expect(isPlanFilePath("docs/plans/foo.md")).toBe(true);
    expect(isPlanFilePath("./docs/plans/foo.md")).toBe(true);
    expect(isPlanFilePath("/repo/docs/plans/foo.md")).toBe(true);
    expect(isPlanFilePath("docs/plans/sub/deep/plan.md")).toBe(true);
    expect(isPlanFilePath("docs/plans/notepads/learnings.md")).toBe(true);

    expect(isPlanFilePath("docs/plans.md")).toBe(false);
    expect(isPlanFilePath("docs/plans/foo.txt")).toBe(false);
    expect(isPlanFilePath("src/plans/foo.md")).toBe(false);
    expect(isPlanFilePath("other/docs/not-plans/foo.md")).toBe(false);
    expect(isPlanFilePath("")).toBe(false);
    expect(isPlanFilePath(undefined as unknown as string)).toBe(false);
  });
});

import { describe, expect, it } from "bun:test";
import plugin, {
  AGENT_USAGE_REMINDER,
  AGENT_USAGE_REMINDER_MARKER,
  RESEARCHER_USAGE_REMINDER,
  RESEARCHER_USAGE_REMINDER_MARKER,
  CATEGORY_SKILL_REMINDER,
  CATEGORY_SKILL_REMINDER_MARKER,
  EDIT_ERROR_REMINDER,
  EMPTY_RESPONSE_WARNING,
  FILE_READ_WARNING,
  JSON_ERROR_REMINDER,
  NOTEPAD_DIRECTIVE,
  NOTEPAD_READ_REMINDER,
  RETRY_GUIDANCE_MARKER,
  TASK_REMINDER_MARKER,
  TASK_REMINDER_MESSAGE,
  TODOWRITE_DESCRIPTION,
} from "./index.js";
import { NOTEPAD_READ_REMINDER_MARKER } from "./recovery.js";
import { pendingFailures } from "./webfetch.js";

describe("opencode-hooks plugin assembly & dispatch (batch 2)", () => {
  const mockCtx = {
    directory: "/tmp/hooks-test-assembly",
    client: {
      tui: {
        showToast: async () => {},
      },
    },
  };

  it("boots the plugin and exposes all 7 expected handlers as functions", async () => {
    const hooks = await plugin.server(mockCtx, {});
    expect(hooks["tool.definition"]).toBeFunction();
    expect(hooks["tool.execute.before"]).toBeFunction();
    expect(hooks["tool.execute.after"]).toBeFunction();
    expect(hooks["chat.message"]).toBeFunction();
    expect(hooks["experimental.chat.messages.transform"]).toBeFunction();
    expect(hooks["experimental.session.compacting"]).toBeFunction();
    expect(hooks.event).toBeFunction();
  });

  it("exports all required markers and prompt templates", () => {
    expect(EDIT_ERROR_REMINDER).toBeString();
    expect(EMPTY_RESPONSE_WARNING).toBeString();
    expect(FILE_READ_WARNING).toBeString();
    expect(JSON_ERROR_REMINDER).toBeString();
    expect(NOTEPAD_DIRECTIVE).toBeString();
    expect(NOTEPAD_READ_REMINDER).toBeString();
    expect(RETRY_GUIDANCE_MARKER).toBeString();
    expect(AGENT_USAGE_REMINDER_MARKER).toBeString();
    expect(AGENT_USAGE_REMINDER).toBeString();
    expect(RESEARCHER_USAGE_REMINDER_MARKER).toBeString();
    expect(RESEARCHER_USAGE_REMINDER).toBeString();
    expect(TASK_REMINDER_MARKER).toBeString();
    expect(TASK_REMINDER_MESSAGE).toBeString();
    expect(CATEGORY_SKILL_REMINDER_MARKER).toBeString();
    expect(CATEGORY_SKILL_REMINDER).toBeString();
    expect(TODOWRITE_DESCRIPTION).toBeString();
  });

  it("tool.definition overrides todowrite and touches nothing else", async () => {
    const hooks = await plugin.server(mockCtx, {});
    const todoOut = { description: "Original description" };
    await hooks["tool.definition"]({ toolID: "todowrite" }, todoOut);
    expect(todoOut.description).toBe(TODOWRITE_DESCRIPTION);

    const otherOut = { description: "Original other description" };
    await hooks["tool.definition"]({ toolID: "read" }, otherOut);
    expect(otherOut.description).toBe("Original other description");
  });

  it("experimental.chat.messages.transform handler executes without error", async () => {
    const hooks = await plugin.server(mockCtx, {});
    const out = { messages: [] };
    await expect(
      hooks["experimental.chat.messages.transform"]({}, out)
    ).resolves.toBeUndefined();
  });

  it("chain-order smoke test: feeds one task-empty output through full after chain and asserts single warning + no retry pile-on", async () => {
    const hooks = await plugin.server(mockCtx, {});
    const out = { output: "" };
    await hooks["tool.execute.after"](
      { tool: "task", sessionID: "s-order-smoke-1", callID: "c1" },
      out
    );

    expect(out.output).toBe(EMPTY_RESPONSE_WARNING);
    expect(out.output).not.toContain(RETRY_GUIDANCE_MARKER);
    expect(out.output).not.toContain(NOTEPAD_READ_REMINDER_MARKER);
    expect(out.output).not.toContain("\nto continue:");

    const reOut = { output: out.output };
    await hooks["tool.execute.after"](
      { tool: "task", sessionID: "s-order-smoke-1", callID: "c2" },
      reOut
    );
    expect(reOut.output).toBe(EMPTY_RESPONSE_WARNING);
    expect(reOut.output).not.toContain(RETRY_GUIDANCE_MARKER);
    expect(reOut.output).not.toContain(NOTEPAD_READ_REMINDER_MARKER);
  });

  it("truncation-masks-guidance: truncator runs last in after chain, strictly after resume-info", async () => {
    const hooks = await plugin.server(mockCtx, {});
    const executionOrder: string[] = [];

    const inputProxy = new Proxy(
      { tool: "task", sessionID: "s-chain-order", callID: "c1" },
      {
        get(target, prop, receiver) {
          if (prop === "tool") {
            const stack = new Error().stack ?? "";
            if (stack.includes("recovery.js:326")) {
              executionOrder.push("truncator");
            } else if (stack.includes("recovery.js:299")) {
              executionOrder.push("resume-info");
            }
          }
          return Reflect.get(target, prop, receiver);
        },
      }
    );

    const out = { output: "Some result from task", metadata: { taskId: "task-abc" } };
    await hooks["tool.execute.after"](inputProxy, out);

    const resumeIndex = executionOrder.indexOf("resume-info");
    const truncatorIndex = executionOrder.indexOf("truncator");

    expect(resumeIndex).toBeGreaterThan(-1);
    expect(truncatorIndex).toBeGreaterThan(-1);
    expect(truncatorIndex).toBeGreaterThan(resumeIndex);
  });

  it("session.deleted clears all maps across compaction, webfetch, and reminder hooks", async () => {
    const hooks = await plugin.server(mockCtx, {});
    const sessionID = "s-cleanup-test-42";

    await hooks["tool.execute.before"](
      { tool: "todowrite", sessionID, callID: "c-todo" },
      { args: { todos: [{ id: "t1", content: "Active task", status: "in_progress" }] } }
    );
    const compactCtx = { context: [] };
    await hooks["experimental.session.compacting"]({ sessionID }, compactCtx);
    expect(compactCtx.context.length).toBe(1);

    pendingFailures.set(`${sessionID}:c-wf`, {
      originalUrl: "https://example.com/redirect-loop",
      at: Date.now(),
    });
    expect(pendingFailures.has(`${sessionID}:c-wf`)).toBe(true);

    await hooks.event({
      event: {
        type: "session.deleted",
        properties: { id: sessionID },
      },
    });

    const postCompactCtx = { context: [] };
    await hooks["experimental.session.compacting"]({ sessionID }, postCompactCtx);
    expect(postCompactCtx.context.length).toBe(0);

    expect(pendingFailures.has(`${sessionID}:c-wf`)).toBe(false);
  });
});

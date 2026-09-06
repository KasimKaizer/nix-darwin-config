import { describe, expect, it } from "bun:test";
import { recordSessionAgent } from "./guards.js";
import {
  CATEGORY_SKILL_REMINDER,
  CATEGORY_SKILL_REMINDER_MARKER,
  createCategorySkillReminderHook,
} from "./reminders.js";

describe("category-skill-reminder + experimental transform (C4b)", () => {
  it("never references forbidden OMO terms in reminder copy", () => {
    const lower = CATEGORY_SKILL_REMINDER.toLowerCase();
    expect(lower).not.toContain("sisyphus");
    expect(lower).not.toContain("atlas");
    expect(lower).not.toContain("call_omo_agent");
    expect(lower).not.toContain("explore-as-omo");
    expect(CATEGORY_SKILL_REMINDER).toContain("task(subagent_type=");
    expect(CATEGORY_SKILL_REMINDER).toContain("<available_skills>");
    expect(CATEGORY_SKILL_REMINDER).toContain("LOAD SKILLS:");
  });

  // (a) 2 directs → transform no-op
  it("(a) 2 direct tool calls leave transform as a no-op", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-a";
    recordSessionAgent(sessionID, "builder");

    // 2 direct tool calls (edit, write)
    await hook["tool.execute.after"](
      { tool: "edit", sessionID, callID: "c1" },
      { output: "edited file" }
    );
    await hook["tool.execute.after"](
      { tool: "write", sessionID, callID: "c2" },
      { output: "wrote file" }
    );

    const originalMessages = [
      {
        info: { id: "msg-a1", sessionID, role: "user" },
        parts: [{ type: "text", text: "Please implement feature X" }],
      },
    ];
    const output = { messages: originalMessages };

    await hook["experimental.chat.messages.transform"]({}, output);

    // Messages array reference must remain identical
    expect(output.messages).toBe(originalMessages);
    // Parts array must be untouched (no reminder injected)
    expect(output.messages[0].parts.length).toBe(1);
    expect(output.messages[0].parts[0].text).toBe("Please implement feature X");
  });

  // (b) 3rd direct → next transform splices exactly one synthetic part IN PLACE (same array ref)
  it("(b) 3rd direct call triggers transform to splice exactly one synthetic reminder part in place", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-b";
    recordSessionAgent(sessionID, "builder");

    // 3 direct tool calls (bash, read, grep)
    const outAfter = { output: "result" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c1" }, outAfter);
    await hook["tool.execute.after"]({ tool: "read", sessionID, callID: "c2" }, outAfter);
    await hook["tool.execute.after"]({ tool: "grep", sessionID, callID: "c3" }, outAfter);

    // 'after' hook must NOT mutate tool output
    expect(outAfter.output).toBe("result");

    const originalTextPart = { type: "text", text: "Build the auth module" };
    const originalMessages = [
      {
        info: { id: "msg-b1", sessionID, role: "user" },
        parts: [originalTextPart],
      },
    ];
    const output = { messages: originalMessages };

    await hook["experimental.chat.messages.transform"]({}, output);

    // MUST NOT reassign output.messages (same array reference)
    expect(output.messages).toBe(originalMessages);

    // Parts must now have spliced reminder at text index
    const parts = output.messages[0].parts;
    expect(parts.length).toBe(2);

    const syntheticPart = parts[0];
    expect(syntheticPart.id).toBe("prt_category_skill_reminder_msg-b1");
    expect(syntheticPart.type).toBe("text");
    expect(syntheticPart.synthetic).toBe(true);
    expect(syntheticPart.sessionID).toBe(sessionID);
    expect(syntheticPart.messageID).toBe("msg-b1");
    expect(syntheticPart.text).toContain(CATEGORY_SKILL_REMINDER_MARKER);
    expect(syntheticPart.text).toContain("task(subagent_type=");

    // Original part preserved at index 1
    expect(parts[1]).toBe(originalTextPart);
  });

  // (c) second transform without new directs → no dup
  it("(c) second transform call without new direct tools does not duplicate reminder", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-c";
    recordSessionAgent(sessionID, "builder");

    // 3 direct tool calls (glob, edit, bash)
    await hook["tool.execute.after"]({ tool: "glob", sessionID, callID: "c1" }, { output: "files" });
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c2" }, { output: "done" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c3" }, { output: "ok" });

    const originalMessages = [
      {
        info: { id: "msg-c1", sessionID, role: "user" },
        parts: [{ type: "text", text: "Optimize database queries" }],
      },
    ];
    const output = { messages: originalMessages };

    // First transform: splices 1 reminder part
    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages[0].parts.length).toBe(2);
    expect(output.messages[0].parts[0].id).toBe("prt_category_skill_reminder_msg-c1");

    // Second transform call without intervening directs: no duplicate!
    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages).toBe(originalMessages);
    expect(output.messages[0].parts.length).toBe(2);

    // Filter parts starting with prt_category_skill_reminder_ to verify exactly 1
    const reminderParts = output.messages[0].parts.filter(
      (p) => typeof p?.id === "string" && p.id.startsWith("prt_category_skill_reminder_")
    );
    expect(reminderParts.length).toBe(1);
  });

  // (d) task resets so transform no-ops
  it("(d) task resets consecutive counter and pending flag so transform no-ops", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-d";
    recordSessionAgent(sessionID, "builder");

    // 3 direct tool calls to trigger pending
    await hook["tool.execute.after"]({ tool: "read", sessionID, callID: "c1" }, { output: "data" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c2" }, { output: "data" });
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c3" }, { output: "data" });

    // task call resets counter and pending flag
    const taskOut = { output: "Subagent completed task" };
    await hook["tool.execute.after"]({ tool: "task", sessionID, callID: "c4" }, taskOut);
    expect(taskOut.output).toBe("Subagent completed task"); // No mutation in after

    const originalMessages = [
      {
        info: { id: "msg-d1", sessionID, role: "user" },
        parts: [{ type: "text", text: "Continue implementation" }],
      },
    ];
    const output = { messages: originalMessages };

    // Transform must be a no-op because task reset pending flag
    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages).toBe(originalMessages);
    expect(output.messages[0].parts.length).toBe(1);
    expect(output.messages[0].parts[0].text).toBe("Continue implementation");

    // Also verify todowrite resets counter
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c5" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c6" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c7" }, { output: "ok" });
    // todowrite resets
    await hook["tool.execute.after"]({ tool: "todowrite", sessionID, callID: "c8" }, { output: "todos set" });

    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages[0].parts.length).toBe(1);
  });

  // (e) non-builder caller sessions do not fire
  it("(e) does not fire for non-builder sessions (worker-deep, explorer, researcher)", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-worker";
    recordSessionAgent(sessionID, "worker-deep");

    // 5 direct tool calls by worker
    for (let i = 1; i <= 5; i++) {
      await hook["tool.execute.after"](
        { tool: "edit", sessionID, callID: `c${i}` },
        { output: "worker editing" }
      );
    }

    const originalMessages = [
      {
        info: { id: "msg-w1", sessionID, role: "user" },
        parts: [{ type: "text", text: "Subagent prompt" }],
      },
    ];
    const output = { messages: originalMessages };

    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages).toBe(originalMessages);
    expect(output.messages[0].parts.length).toBe(1);
  });

  // (f) untracked headless sessions are presumed builder and allowed
  it("(f) allows untracked headless sessions to receive reminder", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-untracked-headless";
    // Do NOT record any agent for sessionID

    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c1" }, { output: "out" });
    await hook["tool.execute.after"]({ tool: "grep", sessionID, callID: "c2" }, { output: "out" });
    await hook["tool.execute.after"]({ tool: "glob", sessionID, callID: "c3" }, { output: "out" });

    const originalMessages = [
      {
        info: { id: "msg-u1", sessionID, role: "user" },
        parts: [{ type: "text", text: "Run automated pipeline" }],
      },
    ];
    const output = { messages: originalMessages };

    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages[0].parts.length).toBe(2);
    expect(output.messages[0].parts[0].id).toBe("prt_category_skill_reminder_msg-u1");
  });

  // (g) session.deleted resets session map
  it("(g) session.deleted deletes session state and resets counter", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-del";
    recordSessionAgent(sessionID, "builder");

    // 3 direct calls → sets pending
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c3" }, { output: "ok" });

    // Fire session.deleted event
    await hook.event({
      event: { type: "session.deleted", properties: { id: sessionID } },
    });

    const originalMessages = [
      {
        info: { id: "msg-del1", sessionID, role: "user" },
        parts: [{ type: "text", text: "Deleted session message" }],
      },
    ];
    const output = { messages: originalMessages };

    // Transform should no-op because session map was cleared
    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages[0].parts.length).toBe(1);

    // 2 more direct calls start fresh at 2 (no reminder on 2)
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c4" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c5" }, { output: "ok" });

    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages[0].parts.length).toBe(1);

    // 3rd direct call fires again
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c6" }, { output: "ok" });
    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages[0].parts.length).toBe(2);
  });

  // (h) skips injection if prt_category_skill_reminder_ already exists in message parts
  it("(h) skips injection if prt_category_skill_reminder_ part already exists", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-exist";
    recordSessionAgent(sessionID, "builder");

    await hook["tool.execute.after"]({ tool: "read", sessionID, callID: "c1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "read", sessionID, callID: "c2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "read", sessionID, callID: "c3" }, { output: "ok" });

    // Message already has a reminder part
    const originalMessages = [
      {
        info: { id: "msg-ex1", sessionID, role: "user" },
        parts: [
          {
            id: "prt_category_skill_reminder_msg-ex1",
            type: "text",
            synthetic: true,
            text: "existing reminder",
          },
          { type: "text", text: "User prompt" },
        ],
      },
    ];
    const output = { messages: originalMessages };

    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages[0].parts.length).toBe(2);
    expect(output.messages[0].parts[0].text).toBe("existing reminder");
  });

  // (i) finds latest message with non-synthetic type:text part
  it("(i) targets latest message with non-synthetic text part across multi-message history", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-multi";
    recordSessionAgent(sessionID, "builder");

    await hook["tool.execute.after"]({ tool: "read", sessionID, callID: "c1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "read", sessionID, callID: "c2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "read", sessionID, callID: "c3" }, { output: "ok" });

    const originalMessages = [
      {
        info: { id: "msg-1", sessionID, role: "user" },
        parts: [{ type: "text", text: "First user message" }],
      },
      {
        info: { id: "msg-2", sessionID, role: "assistant" },
        parts: [{ type: "tool", tool: "read", state: {} }],
      },
      {
        info: { id: "msg-3", sessionID, role: "user" },
        parts: [{ type: "text", text: "Second user message" }],
      },
      {
        info: { id: "msg-4", sessionID, role: "assistant" },
        // Only synthetic text part
        parts: [{ type: "text", text: "Synthetic note", synthetic: true }],
      },
    ];
    const output = { messages: originalMessages };

    await hook["experimental.chat.messages.transform"]({}, output);

    // Latest message with non-synthetic text part is msg-3!
    expect(output.messages[0].parts.length).toBe(1); // msg-1 untouched
    expect(output.messages[2].parts.length).toBe(2); // msg-3 spliced
    expect(output.messages[2].parts[0].id).toBe("prt_category_skill_reminder_msg-3");
    expect(output.messages[2].parts[1].text).toBe("Second user message");
    expect(output.messages[3].parts.length).toBe(1); // msg-4 untouched
  });

  // (j) case-insensitive direct tool matching
  it("(j) handles case-insensitive direct tool names and ignores non-direct tools", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-case";
    recordSessionAgent(sessionID, "builder");

    // Non-direct tools do not increment counter
    await hook["tool.execute.after"]({ tool: "unknown_tool", sessionID, callID: "c0" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "READ", sessionID, callID: "c1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "Edit", sessionID, callID: "c2" }, { output: "ok" });

    const output = {
      messages: [
        {
          info: { id: "msg-case", sessionID, role: "user" },
          parts: [{ type: "text", text: "Check case" }],
        },
      ],
    };

    // Only 2 directs so far
    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages[0].parts.length).toBe(1);

    // 3rd direct with mixed case
    await hook["tool.execute.after"]({ tool: "BASH", sessionID, callID: "c3" }, { output: "ok" });
    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages[0].parts.length).toBe(2);
  });

  // (k) strictly preserves output.messages array reference (in-place contract per #25754)
  it("(k) strictly preserves output.messages array reference (in-place contract per #25754)", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-ref";
    recordSessionAgent(sessionID, "builder");

    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c3" }, { output: "ok" });

    const originalMessages = [
      {
        info: { id: "msg-ref", sessionID, role: "user" },
        parts: [{ type: "text", text: "Ref check" }],
      },
    ];
    const output = { messages: originalMessages };

    await hook["experimental.chat.messages.transform"]({}, output);

    // Crucial: engine prompt.ts#L1252-L1263 passes local msgs array as { messages: msgs }
    // and downstream effect reads msgs. Reassigning output.messages fails to propagate!
    expect(output.messages).toBe(originalMessages);
    expect(output.messages[0].parts.length).toBe(2);
    expect(output.messages[0].parts[0].id).toBe("prt_category_skill_reminder_msg-ref");
  });
});

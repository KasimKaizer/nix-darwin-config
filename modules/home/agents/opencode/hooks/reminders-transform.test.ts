import { describe, expect, it } from "bun:test";
import { recordSessionAgent } from "./guards.js";
import {
  CATEGORY_SKILL_REMINDER,
  CATEGORY_SKILL_REMINDER_MARKER,
  MAX_CATEGORY_REMINDERS,
  createCategorySkillReminderHook,
} from "./reminders.js";

interface Part {
  id?: string;
  sessionID?: string;
  messageID?: string;
  type: string;
  text?: string;
  synthetic?: boolean;
}

interface Msg {
  info: { id: string; sessionID: string; role: string };
  parts: Part[];
}

describe("category-skill-reminder + experimental transform (C4b)", () => {
  it("exports MAX_CATEGORY_REMINDERS as 3", () => {
    expect(MAX_CATEGORY_REMINDERS).toBe(3);
  });

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

    // 3 direct tool calls (bash, edit, write)
    const outAfter = { output: "result" };
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c1" }, outAfter);
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c2" }, outAfter);
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c3" }, outAfter);

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

    // 3 direct tool calls (write, edit, bash)
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c1" }, { output: "files" });
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
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c1" }, { output: "data" });
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
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c2" }, { output: "out" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c3" }, { output: "out" });

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

    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c3" }, { output: "ok" });

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

    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c3" }, { output: "ok" });

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

    // Non-direct tools (read, grep, glob, webfetch, unknown) do not increment counter or trigger reminders
    await hook["tool.execute.after"]({ tool: "unknown_tool", sessionID, callID: "c0" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "read", sessionID, callID: "c-r1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "read", sessionID, callID: "c-r2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "read", sessionID, callID: "c-r3" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "grep", sessionID, callID: "c-grep" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "glob", sessionID, callID: "c-glob" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "webfetch", sessionID, callID: "c-fetch" }, { output: "ok" });

    const output = {
      messages: [
        {
          info: { id: "msg-case", sessionID, role: "user" },
          parts: [{ type: "text", text: "Check case" }],
        },
      ],
    };

    // 3 consecutive reads + grep + glob + webfetch must NOT trigger category reminders
    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages[0].parts.length).toBe(1);

    // Direct tools with mixed case: WRITE, Edit (2 directs so far)
    await hook["tool.execute.after"]({ tool: "WRITE", sessionID, callID: "c1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "Edit", sessionID, callID: "c2" }, { output: "ok" });

    // Only 2 directs so far
    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages[0].parts.length).toBe(1);

    // 3rd direct with mixed case
    await hook["tool.execute.after"]({ tool: "BASH", sessionID, callID: "c3" }, { output: "ok" });
    await hook["experimental.chat.messages.transform"]({}, output);
    expect(output.messages[0].parts.length).toBe(2);
    expect(output.messages[0].parts[0].id).toBe("prt_category_skill_reminder_msg-case");
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

  // (l) disarms after injecting reminder so consecutive directs without task do not trigger second reminder
  it("(l) disarms after injecting reminder so consecutive directs without task do not trigger second reminder", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-disarm";
    recordSessionAgent(sessionID, "builder");

    // 3 direct tool calls trigger reminder #1
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c3" }, { output: "ok" });

    const msg1 = {
      info: { id: "msg-disarm-1", sessionID, role: "user" },
      parts: [{ type: "text", text: "First instruction" }],
    };
    const output1 = { messages: [msg1] };

    await hook["experimental.chat.messages.transform"]({}, output1);
    expect(output1.messages[0].parts.length).toBe(2);
    expect(output1.messages[0].parts[0].id).toBe("prt_category_skill_reminder_msg-disarm-1");

    // 3 subsequent direct tool calls without task/todowrite
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c4" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c5" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c6" }, { output: "ok" });

    const msg2 = {
      info: { id: "msg-disarm-2", sessionID, role: "user" },
      parts: [{ type: "text", text: "Second instruction" }],
    };
    const output2 = { messages: [msg1, msg2] };

    await hook["experimental.chat.messages.transform"]({}, output2);
    // msg2 must NOT have a reminder spliced because hook is disarmed
    expect(output2.messages[1].parts.length).toBe(1);
    expect(output2.messages[1].parts[0].text).toBe("Second instruction");
  });

  // (m) re-arms via task so subsequent 3 direct tools trigger reminder #2
  it("(m) re-arms via task so subsequent 3 direct tools trigger reminder #2", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-rearm-task";
    recordSessionAgent(sessionID, "builder");

    // Streak 1: 3 direct calls trigger reminder #1
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c3" }, { output: "ok" });

    const msg1 = {
      info: { id: "msg-task-1", sessionID, role: "user" },
      parts: [{ type: "text", text: "First prompt" }],
    };
    const output1 = { messages: [msg1] };
    await hook["experimental.chat.messages.transform"]({}, output1);
    expect(msg1.parts.length).toBe(2);
    expect(msg1.parts[0].id).toBe("prt_category_skill_reminder_msg-task-1");

    // Calling task re-arms the hook (consecDirect=0, pending=false, armed=true)
    const taskOut = { output: "Subagent completed task" };
    await hook["tool.execute.after"]({ tool: "task", sessionID, callID: "c-task" }, taskOut);
    expect(taskOut.output).toBe("Subagent completed task");

    // Streak 2: 3 subsequent direct calls
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c4" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c5" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c6" }, { output: "ok" });

    const msg2 = {
      info: { id: "msg-task-2", sessionID, role: "user" },
      parts: [{ type: "text", text: "Second prompt" }],
    };
    const output2 = { messages: [msg1, msg2] };
    await hook["experimental.chat.messages.transform"]({}, output2);

    // Reminder #2 must be spliced into msg2
    expect(msg2.parts.length).toBe(2);
    expect(msg2.parts[0].id).toBe("prt_category_skill_reminder_msg-task-2");
    expect(msg2.parts[0].text).toContain(CATEGORY_SKILL_REMINDER_MARKER);
  });

  // (n) re-arms via todowrite so subsequent 3 direct tools trigger reminder #3
  it("(n) re-arms via todowrite so subsequent 3 direct tools trigger reminder #3", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-rearm-todowrite";
    recordSessionAgent(sessionID, "builder");

    // Reminder #1 via 3 directs
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c3" }, { output: "ok" });
    const msg1 = {
      info: { id: "msg-todo-1", sessionID, role: "user" },
      parts: [{ type: "text", text: "Prompt 1" }],
    };
    await hook["experimental.chat.messages.transform"]({}, { messages: [msg1] });
    expect(msg1.parts.length).toBe(2);

    // Re-arm via task -> Streak 2 -> Reminder #2
    await hook["tool.execute.after"]({ tool: "task", sessionID, callID: "c-t1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c4" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c5" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c6" }, { output: "ok" });
    const msg2 = {
      info: { id: "msg-todo-2", sessionID, role: "user" },
      parts: [{ type: "text", text: "Prompt 2" }],
    };
    await hook["experimental.chat.messages.transform"]({}, { messages: [msg1, msg2] });
    expect(msg2.parts.length).toBe(2);

    // Re-arm via todowrite -> Streak 3 -> Reminder #3
    await hook["tool.execute.after"]({ tool: "todowrite", sessionID, callID: "c-tw1" }, { output: "todos set" });
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "c7" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "c8" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "c9" }, { output: "ok" });
    const msg3 = {
      info: { id: "msg-todo-3", sessionID, role: "user" },
      parts: [{ type: "text", text: "Prompt 3" }],
    };
    await hook["experimental.chat.messages.transform"]({}, { messages: [msg1, msg2, msg3] });
    expect(msg3.parts.length).toBe(2);
    expect(msg3.parts[0].id).toBe("prt_category_skill_reminder_msg-todo-3");
  });

  // (o) enforces session cap of MAX_CATEGORY_REMINDERS (3 reminders max even if re-armed)
  it("(o) enforces session cap of MAX_CATEGORY_REMINDERS (3 reminders max even if re-armed)", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionID = "session-test-cap";
    recordSessionAgent(sessionID, "builder");

    const messages: Msg[] = [];

    // Trigger 3 reminders with task/todowrite re-arming between each
    for (let reminderIdx = 1; reminderIdx <= 3; reminderIdx++) {
      if (reminderIdx > 1) {
        await hook["tool.execute.after"](
          { tool: reminderIdx === 2 ? "task" : "todowrite", sessionID, callID: `reset-${reminderIdx}` },
          { output: "reset" }
        );
      }
      await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: `dir-${reminderIdx}-1` }, { output: "ok" });
      await hook["tool.execute.after"]({ tool: "write", sessionID, callID: `dir-${reminderIdx}-2` }, { output: "ok" });
      await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: `dir-${reminderIdx}-3` }, { output: "ok" });

      const msg: Msg = {
        info: { id: `msg-cap-${reminderIdx}`, sessionID, role: "user" },
        parts: [{ type: "text", text: `Prompt ${reminderIdx}` }],
      };
      messages.push(msg);
      await hook["experimental.chat.messages.transform"]({}, { messages: [...messages] });
      expect(msg.parts.length).toBe(2);
      expect(msg.parts[0].id).toBe(`prt_category_skill_reminder_msg-cap-${reminderIdx}`);
    }

    // Now 3 reminders have been injected. Call task to attempt re-arm.
    await hook["tool.execute.after"](
      { tool: "task", sessionID, callID: "c-task-after-cap" },
      { output: "task done" }
    );

    // Execute 3 more direct tools
    await hook["tool.execute.after"]({ tool: "edit", sessionID, callID: "dir-4-1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID, callID: "dir-4-2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID, callID: "dir-4-3" }, { output: "ok" });

    const msg4: Msg = {
      info: { id: "msg-cap-4", sessionID, role: "user" },
      parts: [{ type: "text", text: "Prompt 4" }],
    };
    messages.push(msg4);
    await hook["experimental.chat.messages.transform"]({}, { messages: [...messages] });

    // 4th message must NOT receive a reminder (cap of 3 reached)
    expect(msg4.parts.length).toBe(1);
    expect(msg4.parts[0].text).toBe("Prompt 4");
  });

  // (p) multi-session isolation: Session A at cap (3 reminders) does not affect Session B at 0
  it("(p) multi-session isolation: Session A at cap (3 reminders) does not affect Session B at 0", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionA = "session-iso-cat-A";
    const sessionB = "session-iso-cat-B";
    recordSessionAgent(sessionA, "builder");
    recordSessionAgent(sessionB, "builder");

    // Session A triggers 3 reminders with re-arming between each
    for (let r = 1; r <= 3; r++) {
      if (r > 1) {
        await hook["tool.execute.after"](
          { tool: "task", sessionID: sessionA, callID: `reset-a-${r}` },
          { output: "ok" }
        );
      }
      await hook["tool.execute.after"]({ tool: "edit", sessionID: sessionA, callID: `a-${r}-1` }, { output: "ok" });
      await hook["tool.execute.after"]({ tool: "write", sessionID: sessionA, callID: `a-${r}-2` }, { output: "ok" });
      await hook["tool.execute.after"]({ tool: "bash", sessionID: sessionA, callID: `a-${r}-3` }, { output: "ok" });

      const msgA: Msg = {
        info: { id: `msg-a-${r}`, sessionID: sessionA, role: "user" },
        parts: [{ type: "text", text: `Prompt A ${r}` }],
      };
      await hook["experimental.chat.messages.transform"]({}, { messages: [msgA] });
      expect(msgA.parts.length).toBe(2);
      expect(msgA.parts[0].id).toBe(`prt_category_skill_reminder_msg-a-${r}`);
    }

    // Session A attempts 4th reminder after task re-arm (must be capped)
    await hook["tool.execute.after"](
      { tool: "task", sessionID: sessionA, callID: "reset-a-4" },
      { output: "ok" }
    );
    await hook["tool.execute.after"]({ tool: "edit", sessionID: sessionA, callID: "a-4-1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID: sessionA, callID: "a-4-2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID: sessionA, callID: "a-4-3" }, { output: "ok" });

    const msgA4: Msg = {
      info: { id: "msg-a-4", sessionID: sessionA, role: "user" },
      parts: [{ type: "text", text: "Prompt A 4" }],
    };
    await hook["experimental.chat.messages.transform"]({}, { messages: [msgA4] });
    expect(msgA4.parts.length).toBe(1);

    // Session B is completely independent, starts at count 0, triggers 3 direct tools
    await hook["tool.execute.after"]({ tool: "edit", sessionID: sessionB, callID: "b-1-1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID: sessionB, callID: "b-1-2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID: sessionB, callID: "b-1-3" }, { output: "ok" });

    const msgB1: Msg = {
      info: { id: "msg-b-1", sessionID: sessionB, role: "user" },
      parts: [{ type: "text", text: "Prompt B 1" }],
    };
    await hook["experimental.chat.messages.transform"]({}, { messages: [msgB1] });
    expect(msgB1.parts.length).toBe(2);
    expect(msgB1.parts[0].id).toBe("prt_category_skill_reminder_msg-b-1");
  });

  // (q) session.deleted purges Session A to fresh {reminderCount: 0, armed: true} while Session B remains unaffected
  it("(q) session.deleted purges Session A to fresh {reminderCount: 0, armed: true} while Session B remains unaffected", async () => {
    const hook = createCategorySkillReminderHook();
    const sessionA = "session-del-cat-A";
    const sessionB = "session-del-cat-B";
    recordSessionAgent(sessionA, "builder");
    recordSessionAgent(sessionB, "builder");

    // Session A reaches cap of 3 reminders
    for (let r = 1; r <= 3; r++) {
      if (r > 1) {
        await hook["tool.execute.after"](
          { tool: "task", sessionID: sessionA, callID: `reset-a-${r}` },
          { output: "ok" }
        );
      }
      await hook["tool.execute.after"]({ tool: "edit", sessionID: sessionA, callID: `a-${r}-1` }, { output: "ok" });
      await hook["tool.execute.after"]({ tool: "write", sessionID: sessionA, callID: `a-${r}-2` }, { output: "ok" });
      await hook["tool.execute.after"]({ tool: "bash", sessionID: sessionA, callID: `a-${r}-3` }, { output: "ok" });

      const msgA: Msg = {
        info: { id: `msg-del-a-${r}`, sessionID: sessionA, role: "user" },
        parts: [{ type: "text", text: `Prompt A ${r}` }],
      };
      await hook["experimental.chat.messages.transform"]({}, { messages: [msgA] });
      expect(msgA.parts.length).toBe(2);
    }

    // Session B triggers 1 reminder
    await hook["tool.execute.after"]({ tool: "edit", sessionID: sessionB, callID: "b-1-1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID: sessionB, callID: "b-1-2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID: sessionB, callID: "b-1-3" }, { output: "ok" });

    const msgB1: Msg = {
      info: { id: "msg-del-b-1", sessionID: sessionB, role: "user" },
      parts: [{ type: "text", text: "Prompt B 1" }],
    };
    await hook["experimental.chat.messages.transform"]({}, { messages: [msgB1] });
    expect(msgB1.parts.length).toBe(2);

    // Delete Session A
    await hook.event({
      event: { type: "session.deleted", properties: { id: sessionA } },
    });

    // Session A starts fresh:
    // 2 direct calls do NOT trigger reminder
    await hook["tool.execute.after"]({ tool: "edit", sessionID: sessionA, callID: "a-fresh-1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID: sessionA, callID: "a-fresh-2" }, { output: "ok" });
    const msgAFreshNoop: Msg = {
      info: { id: "msg-del-a-fresh-noop", sessionID: sessionA, role: "user" },
      parts: [{ type: "text", text: "Fresh Prompt 2 tools" }],
    };
    await hook["experimental.chat.messages.transform"]({}, { messages: [msgAFreshNoop] });
    expect(msgAFreshNoop.parts.length).toBe(1);

    // 3rd direct call triggers reminder #1
    await hook["tool.execute.after"]({ tool: "bash", sessionID: sessionA, callID: "a-fresh-3" }, { output: "ok" });
    const msgAFresh1: Msg = {
      info: { id: "msg-del-a-fresh-1", sessionID: sessionA, role: "user" },
      parts: [{ type: "text", text: "Fresh Prompt 1" }],
    };
    await hook["experimental.chat.messages.transform"]({}, { messages: [msgAFresh1] });
    expect(msgAFresh1.parts.length).toBe(2);
    expect(msgAFresh1.parts[0].id).toBe("prt_category_skill_reminder_msg-del-a-fresh-1");

    // Session B was untouched: currently disarmed at count 1.
    // Calling 3 direct tools without re-arm in Session B does NOT trigger reminder
    await hook["tool.execute.after"]({ tool: "edit", sessionID: sessionB, callID: "b-disarmed-1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID: sessionB, callID: "b-disarmed-2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID: sessionB, callID: "b-disarmed-3" }, { output: "ok" });
    const msgBDisarmed: Msg = {
      info: { id: "msg-b-disarmed", sessionID: sessionB, role: "user" },
      parts: [{ type: "text", text: "Prompt B Disarmed" }],
    };
    await hook["experimental.chat.messages.transform"]({}, { messages: [msgBDisarmed] });
    expect(msgBDisarmed.parts.length).toBe(1);

    // Re-arming Session B via todowrite allows reminder #2
    await hook["tool.execute.after"](
      { tool: "todowrite", sessionID: sessionB, callID: "b-rearm" },
      { output: "ok" }
    );
    await hook["tool.execute.after"]({ tool: "edit", sessionID: sessionB, callID: "b-2-1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID: sessionB, callID: "b-2-2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID: sessionB, callID: "b-2-3" }, { output: "ok" });
    const msgB2: Msg = {
      info: { id: "msg-b-2", sessionID: sessionB, role: "user" },
      parts: [{ type: "text", text: "Prompt B 2" }],
    };
    await hook["experimental.chat.messages.transform"]({}, { messages: [msgB2] });
    expect(msgB2.parts.length).toBe(2);
  });

  // (r) subsession prefix deletion (${sessionID}:*) purges child sessions while keeping unrelated sessions intact
  it("(r) subsession prefix deletion (${sessionID}:*) purges child sessions while keeping unrelated sessions intact", async () => {
    const hook = createCategorySkillReminderHook();
    const parentSession = "session-parent-r";
    const childSession1 = `${parentSession}:child-1`;
    const childSession2 = `${parentSession}:child-2`;
    const siblingSession = "session-sibling-r";
    const siblingChild = `${siblingSession}:child-1`;

    for (const sid of [parentSession, childSession1, childSession2, siblingSession, siblingChild]) {
      recordSessionAgent(sid, "builder");
      await hook["tool.execute.after"]({ tool: "edit", sessionID: sid, callID: `dir-${sid}-1` }, { output: "ok" });
      await hook["tool.execute.after"]({ tool: "write", sessionID: sid, callID: `dir-${sid}-2` }, { output: "ok" });
      await hook["tool.execute.after"]({ tool: "bash", sessionID: sid, callID: `dir-${sid}-3` }, { output: "ok" });
    }

    // Fire session.deleted for parent session
    await hook.event({
      event: { type: "session.deleted", properties: { id: parentSession } },
    });

    // Parent and its children must have their pending states cleared (no reminder injected)
    for (const sid of [parentSession, childSession1, childSession2]) {
      const msg: Msg = {
        info: { id: `msg-${sid}`, sessionID: sid, role: "user" },
        parts: [{ type: "text", text: "Prompt after delete" }],
      };
      await hook["experimental.chat.messages.transform"]({}, { messages: [msg] });
      expect(msg.parts.length).toBe(1);
    }

    // Unrelated sibling and its child must remain untouched (reminder injected)
    for (const sid of [siblingSession, siblingChild]) {
      const msg: Msg = {
        info: { id: `msg-${sid}`, sessionID: sid, role: "user" },
        parts: [{ type: "text", text: "Prompt sibling intact" }],
      };
      await hook["experimental.chat.messages.transform"]({}, { messages: [msg] });
      expect(msg.parts.length).toBe(2);
      expect(msg.parts[0].id).toBe(`prt_category_skill_reminder_msg-${sid}`);
    }
  });

  // (s) session.deleted with unknown ID or malformed payload is safe and preserves active sessions
  it("(s) session.deleted with unknown ID or malformed payload is safe and preserves active sessions", async () => {
    const hook = createCategorySkillReminderHook();
    const activeSession = "session-active-cat-s";
    recordSessionAgent(activeSession, "builder");

    await hook["tool.execute.after"]({ tool: "edit", sessionID: activeSession, callID: "c1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID: activeSession, callID: "c2" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "bash", sessionID: activeSession, callID: "c3" }, { output: "ok" });

    // Safe handling of nonexistent session ID
    await hook.event({
      event: { type: "session.deleted", properties: { id: "non-existent-session-id" } },
    });
    // Empty properties
    await hook.event({
      event: { type: "session.deleted", properties: {} },
    });
    // Non-delete event type
    await hook.event({
      event: { type: "session.created", properties: { id: activeSession } },
    });
    // Null and undefined inputs
    await hook.event(null);
    await hook.event(undefined);

    // Active session still triggers reminder
    const msg: Msg = {
      info: { id: "msg-active-s", sessionID: activeSession, role: "user" },
      parts: [{ type: "text", text: "Active session prompt" }],
    };
    await hook["experimental.chat.messages.transform"]({}, { messages: [msg] });
    expect(msg.parts.length).toBe(2);
    expect(msg.parts[0].id).toBe("prt_category_skill_reminder_msg-active-s");
  });

  // (t) session.deleted resolves sessionID from properties.id, properties.sessionID, or properties.info.id
  it("(t) session.deleted resolves sessionID from properties.id, properties.sessionID, or properties.info.id", async () => {
    const hook = createCategorySkillReminderHook();
    const sId = "session-del-prop-id";
    const sSessionId = "session-del-prop-sessionid";
    const sInfoId = "session-del-prop-info-id";

    for (const sid of [sId, sSessionId, sInfoId]) {
      recordSessionAgent(sid, "builder");
      await hook["tool.execute.after"]({ tool: "edit", sessionID: sid, callID: `c-${sid}-1` }, { output: "ok" });
      await hook["tool.execute.after"]({ tool: "write", sessionID: sid, callID: `c-${sid}-2` }, { output: "ok" });
      await hook["tool.execute.after"]({ tool: "bash", sessionID: sid, callID: `c-${sid}-3` }, { output: "ok" });
    }

    // Delete using properties.id
    await hook.event({
      event: { type: "session.deleted", properties: { id: sId } },
    });
    // Delete using properties.sessionID
    await hook.event({
      event: { type: "session.deleted", properties: { sessionID: sSessionId } },
    });
    // Delete using properties.info.id
    await hook.event({
      event: { type: "session.deleted", properties: { info: { id: sInfoId } } },
    });

    // All 3 sessions should have their state cleared
    for (const sid of [sId, sSessionId, sInfoId]) {
      const msg: Msg = {
        info: { id: `msg-${sid}`, sessionID: sid, role: "user" },
        parts: [{ type: "text", text: "Prompt after delete" }],
      };
      await hook["experimental.chat.messages.transform"]({}, { messages: [msg] });
      expect(msg.parts.length).toBe(1);
    }
  });

  // (u) non-builder sessions never trigger category reminders and cannot modify orchestrator session state
  it("(u) non-builder sessions never trigger category reminders and cannot modify orchestrator session state", async () => {
    const hook = createCategorySkillReminderHook();
    const builderSession = "session-builder-u";
    const workerSession = "session-worker-u";
    recordSessionAgent(builderSession, "builder");
    recordSessionAgent(workerSession, "worker-quick");

    // Builder executes 2 direct tools (streak = 2, pending = false)
    await hook["tool.execute.after"]({ tool: "edit", sessionID: builderSession, callID: "b-u-1" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "write", sessionID: builderSession, callID: "b-u-2" }, { output: "ok" });

    // Worker executes 6 direct tools (far above threshold 3)
    for (let i = 1; i <= 6; i++) {
      await hook["tool.execute.after"]({ tool: "bash", sessionID: workerSession, callID: `w-u-${i}` }, { output: "ok" });
    }

    // Worker transform never injects reminder
    const workerMsg: Msg = {
      info: { id: "msg-worker-u", sessionID: workerSession, role: "user" },
      parts: [{ type: "text", text: "Worker prompt" }],
    };
    await hook["experimental.chat.messages.transform"]({}, { messages: [workerMsg] });
    expect(workerMsg.parts.length).toBe(1);

    // Worker executes task and todowrite - must NOT reset builder's streak or disarm builder
    await hook["tool.execute.after"]({ tool: "task", sessionID: workerSession, callID: "w-u-task" }, { output: "ok" });
    await hook["tool.execute.after"]({ tool: "todowrite", sessionID: workerSession, callID: "w-u-todo" }, { output: "ok" });

    // Builder executes 3rd direct tool - completing its streak of 3
    await hook["tool.execute.after"]({ tool: "bash", sessionID: builderSession, callID: "b-u-3" }, { output: "ok" });

    // Builder transform DOES inject reminder (proving builder streak was not wiped by worker)
    const builderMsg: Msg = {
      info: { id: "msg-builder-u", sessionID: builderSession, role: "user" },
      parts: [{ type: "text", text: "Builder prompt" }],
    };
    await hook["experimental.chat.messages.transform"]({}, { messages: [builderMsg] });
    expect(builderMsg.parts.length).toBe(2);
    expect(builderMsg.parts[0].id).toBe("prt_category_skill_reminder_msg-builder-u");
  });
});

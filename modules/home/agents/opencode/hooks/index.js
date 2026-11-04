import {
  createTodoDescriptionOverrideHook,
  TODOWRITE_DESCRIPTION,
} from "./definitions.js";
import {
  createBashFileReadGuardHook,
  createNotepadWriteGuardHook,
  createWriteExistingFileGuardHook,
  FILE_READ_WARNING,
  recordSessionAgent,
} from "./guards.js";
import {
  createEditErrorRecoveryHook,
  createEmptyTaskResponseDetectorHook,
  createJsonErrorRecoveryHook,
  createNotepadReadReminderHook,
  createTaskResumeInfoHook,
  createToolOutputTruncatorHook,
  EDIT_ERROR_REMINDER,
  EMPTY_RESPONSE_WARNING,
  JSON_ERROR_REMINDER,
  NOTEPAD_READ_REMINDER,
} from "./recovery.js";
import {
  AGENT_USAGE_REMINDER,
  AGENT_USAGE_REMINDER_MARKER,
  CATEGORY_SKILL_REMINDER,
  CATEGORY_SKILL_REMINDER_MARKER,
  RESEARCHER_USAGE_REMINDER,
  RESEARCHER_USAGE_REMINDER_MARKER,
  createAgentUsageReminderHook,
  createCategorySkillReminderHook,
  createTaskReminderHook,
  TASK_REMINDER_MARKER,
  TASK_REMINDER_MESSAGE,
} from "./reminders.js";
import {
  createDelegateTaskRetryHook,
  RETRY_GUIDANCE_MARKER,
} from "./retry.js";
import {
  createCompactionTodoPreserverHook,
  createNotepadDirectiveHook,
  createPlanFormatValidatorHook,
  NOTEPAD_DIRECTIVE,
} from "./session.js";
import { createWebfetchRedirectGuardHook } from "./webfetch.js";

export {
  AGENT_USAGE_REMINDER,
  AGENT_USAGE_REMINDER_MARKER,
  CATEGORY_SKILL_REMINDER,
  CATEGORY_SKILL_REMINDER_MARKER,
  EDIT_ERROR_REMINDER,
  EMPTY_RESPONSE_WARNING,
  FILE_READ_WARNING,
  JSON_ERROR_REMINDER,
  NOTEPAD_DIRECTIVE,
  NOTEPAD_READ_REMINDER,
  RESEARCHER_USAGE_REMINDER,
  RESEARCHER_USAGE_REMINDER_MARKER,
  RETRY_GUIDANCE_MARKER,
  TASK_REMINDER_MARKER,
  TASK_REMINDER_MESSAGE,
  TODOWRITE_DESCRIPTION,
};

const plugin = {
  id: "opencode-hooks",
  setup: async (ctx) => {
    const hooks = await plugin.server({ directory: ctx.location.directory, storage: ctx.storage, native: true });
    // Keep the policy hooks independent of the v2 transport. Native names and
    // payloads are translated only here (v2.2.5 promise/tool.ts and session.ts).
    const inputFor = (event) => ({
      ...event,
      nativeTool: event.tool,
      tool: ({ subagent: "task", shell: "bash" })[event.tool] ?? event.tool,
      callID: event.id,
      args: event.input,
    });
    await ctx.tool.hook("execute.before", async (event) => {
      recordSessionAgent(event.sessionID, event.agent);
      // Snapshot only successful todo writes in execute.after.
      if (event.tool === "todowrite") return;
      await hooks["tool.execute.before"](inputFor(event), { args: event.input });
    });
    await ctx.tool.hook("execute.after", async (event) => {
      recordSessionAgent(event.sessionID, event.agent);
      const input = inputFor(event);
      if (event.status === "error") {
        const output = { output: `Error: ${event.error.message}` };
        await hooks["tool.execute.after"](input, output);
        event.error.message = output.output.replace(/^Error: /, "");
        return;
      }
      if (event.tool === "todowrite") {
        await hooks["tool.execute.before"](input, { args: event.input });
        await ctx.storage.set(`todos:${event.sessionID}`, event.result.output.todos);
      }
      const content = event.result.content;
      const text = typeof content === "string" ? content : (content ?? [])
        .filter((part) => part.type === "text").map((part) => part.text).join("\n");
      const output = { output: text, metadata: event.result.metadata };
      await hooks["tool.execute.after"](input, output);
      if (output.output === text) return;
      // Never replace structured output or discard file/image attachments.
      event.result.content = [
        { type: "text", text: output.output },
        ...(Array.isArray(content) ? content.filter((part) => part.type !== "text") : []),
      ];
    });
    await ctx.session.hook("context", async (event) => {
      recordSessionAgent(event.sessionID, event.agent);
      if (event.tools.todowrite) event.tools.todowrite.description = TODOWRITE_DESCRIPTION;
      // The existing reminder policies inspect legacy message parts. Project
      // native LLM content into that view, then copy back only injected text.
      const messages = event.messages.map((message, index) => ({
        info: { id: message.id ?? `context-${index}`, sessionID: event.sessionID },
        parts: message.content.map((part) => {
          if (part.type === "tool-call") return { type: "tool", tool: part.name };
          if (part.type === "tool-result") {
            const value = part.result.value;
            const text = part.result.type === "content"
              ? value.filter((item) => item.type === "text").map((item) => item.text).join("\n")
              : typeof value === "string" ? value : "";
            return { type: "tool-result", state: { output: text } };
          }
          return part;
        }),
      }));
      await hooks["experimental.chat.messages.transform"]({}, { messages });
      messages.forEach((message, index) => {
        const additions = message.parts.filter((part) => part.synthetic);
        if (additions.length === 0) return;
        const target = event.messages[index].content;
        const at = target.findLastIndex((part) => part.type === "text");
        target.splice(at === -1 ? target.length : at, 0,
          ...additions.map((part) => ({ type: "text", text: part.text })));
      });
    });
    await ctx.session.hook("compaction", async (event) => {
      const output = { context: [] };
      await hooks["experimental.session.compacting"]({ sessionID: event.sessionID }, output);
      event.system.push(...output.context.map((text) => ({ type: "text", text })));
    });
    const controller = new AbortController();
    let eventFailure;
    const events = (async () => {
      for await (const event of ctx.event.subscribe({ types: ["session.deleted"], signal: controller.signal })) {
        await hooks.event({ event: { type: event.type, properties: { id: event.data.sessionID } } });
      }
    })().catch((error) => { if (!controller.signal.aborted) eventFailure = error; });
    return async () => {
      controller.abort();
      await events;
      if (eventFailure !== undefined) throw eventFailure;
    };
  },
  server: async (ctx) => {
    const todoDescriptionOverride = createTodoDescriptionOverrideHook();
    const notepadWriteGuard = createNotepadWriteGuardHook();
    const writeExistingFileGuard = createWriteExistingFileGuardHook(ctx);
    const bashFileReadGuard = createBashFileReadGuardHook();
    const editErrorRecovery = createEditErrorRecoveryHook(ctx);
    const jsonErrorRecovery = createJsonErrorRecoveryHook();
    const emptyTaskResponseDetector = createEmptyTaskResponseDetectorHook();
    const delegateTaskRetry = createDelegateTaskRetryHook();
    const taskResumeInfo = createTaskResumeInfoHook();
    const notepadReadReminder = createNotepadReadReminderHook();
    const webfetchRedirectGuard = createWebfetchRedirectGuardHook();
    const planFormatValidator = createPlanFormatValidatorHook(ctx);
    const toolOutputTruncator = createToolOutputTruncatorHook();
    const notepadDirective = createNotepadDirectiveHook();
    const compactionTodoPreserver = createCompactionTodoPreserverHook(ctx);
    const agentUsageReminder = createAgentUsageReminderHook();
    const taskReminder = createTaskReminderHook(ctx);
    const categorySkillReminder = createCategorySkillReminderHook(ctx);

    return {
      "tool.definition": async (input, output) => {
        await todoDescriptionOverride["tool.definition"](input, output);
      },

      "tool.execute.before": async (input, output) => {
        await notepadWriteGuard["tool.execute.before"](input, output);
        await writeExistingFileGuard["tool.execute.before"](input, output);
        await editErrorRecovery["tool.execute.before"](input, output);
        await webfetchRedirectGuard["tool.execute.before"](input, output);
        await notepadDirective["tool.execute.before"](input, output);
        await delegateTaskRetry["tool.execute.before"](input, output);
        await compactionTodoPreserver["tool.execute.before"](input, output);
      },

      "tool.execute.after": async (input, output) => {
        if (input.status === "error") {
          await editErrorRecovery["tool.execute.after"](input, output);
          await jsonErrorRecovery["tool.execute.after"](input, output);
          await webfetchRedirectGuard["tool.execute.after"](input, output);
          return;
        }
        await bashFileReadGuard["tool.execute.after"](input, output);
        await editErrorRecovery["tool.execute.after"](input, output);
        await jsonErrorRecovery["tool.execute.after"](input, output);
        await emptyTaskResponseDetector["tool.execute.after"](input, output);
        await taskResumeInfo["tool.execute.after"](input, output);
        await notepadReadReminder["tool.execute.after"](input, output);
        await webfetchRedirectGuard["tool.execute.after"](input, output);
        await planFormatValidator["tool.execute.after"](input, output);
        await agentUsageReminder["tool.execute.after"](input, output);
        await taskReminder["tool.execute.after"](input, output);
        await categorySkillReminder["tool.execute.after"](input, output);
        await toolOutputTruncator["tool.execute.after"](input, output);
      },

      "chat.message": async (input, output) => {
        recordSessionAgent(input?.sessionID, input?.agent);
      },

      "experimental.chat.messages.transform": async (input, output) => {
        await agentUsageReminder["experimental.chat.messages.transform"](input, output);
        await categorySkillReminder["experimental.chat.messages.transform"](input, output);
      },

      "experimental.session.compacting": async (input, output) => {
        const snapshot = (await compactionTodoPreserver.getSnapshot?.(input?.sessionID)) ?? [];
        const open = snapshot.filter((t) => t?.status !== "completed" && t?.status !== "cancelled");
        if (open.length === 0) return;
        const lines = open.map((t) => `- [ ] ${t?.content ?? t?.id ?? "untitled task"}`).join("\n");
        const extra = `### Preserved open todos (restore these after compaction)\n${lines}`;
        if (Array.isArray(output?.context)) {
          output.context.push(extra);
        }
      },

      event: async (input) => {
        await compactionTodoPreserver.event(input);
        await webfetchRedirectGuard.event(input);
        await agentUsageReminder.event(input);
        await taskReminder.event(input);
        await categorySkillReminder.event(input);
      },
    };
  },
};

export default plugin;

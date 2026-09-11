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

export default {
  id: "opencode-hooks",
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

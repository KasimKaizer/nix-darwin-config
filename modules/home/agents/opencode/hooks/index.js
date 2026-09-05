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
  createCompactionTodoPreserverHook,
  createNotepadDirectiveHook,
  createPlanFormatValidatorHook,
  NOTEPAD_DIRECTIVE,
} from "./session.js";

export {
  EDIT_ERROR_REMINDER,
  EMPTY_RESPONSE_WARNING,
  FILE_READ_WARNING,
  JSON_ERROR_REMINDER,
  NOTEPAD_DIRECTIVE,
  NOTEPAD_READ_REMINDER,
};

export default {
  id: "opencode-hooks",
  server: async (ctx) => {
    const notepadWriteGuard = createNotepadWriteGuardHook();
    const writeExistingFileGuard = createWriteExistingFileGuardHook(ctx);
    const bashFileReadGuard = createBashFileReadGuardHook();
    const editErrorRecovery = createEditErrorRecoveryHook(ctx);
    const jsonErrorRecovery = createJsonErrorRecoveryHook();
    const emptyTaskResponseDetector = createEmptyTaskResponseDetectorHook();
    const taskResumeInfo = createTaskResumeInfoHook();
    const notepadReadReminder = createNotepadReadReminderHook();
    const planFormatValidator = createPlanFormatValidatorHook(ctx);
    const toolOutputTruncator = createToolOutputTruncatorHook();
    const notepadDirective = createNotepadDirectiveHook();
    const compactionTodoPreserver = createCompactionTodoPreserverHook();

    return {
      "tool.execute.before": async (input, output) => {
        await notepadWriteGuard["tool.execute.before"](input, output);
        await writeExistingFileGuard["tool.execute.before"](input, output);
        await editErrorRecovery["tool.execute.before"](input, output);
        await notepadDirective["tool.execute.before"](input, output);
        await compactionTodoPreserver["tool.execute.before"](input, output);
      },

      "tool.execute.after": async (input, output) => {
        await bashFileReadGuard["tool.execute.after"](input, output);
        await editErrorRecovery["tool.execute.after"](input, output);
        await jsonErrorRecovery["tool.execute.after"](input, output);
        await emptyTaskResponseDetector["tool.execute.after"](input, output);
        await taskResumeInfo["tool.execute.after"](input, output);
        await notepadReadReminder["tool.execute.after"](input, output);
        await planFormatValidator["tool.execute.after"](input, output);
        await toolOutputTruncator["tool.execute.after"](input, output);
      },

      "chat.message": async (input, output) => {
        recordSessionAgent(input?.sessionID, input?.agent);
      },

      "experimental.session.compacting": async (input, output) => {
        const snapshot = compactionTodoPreserver.getSnapshot?.(input?.sessionID) ?? [];
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
      },
    };
  },
};

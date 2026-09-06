import { normalize, sep } from "node:path";
import { isNonBuilderSession, resolveFilePath } from "./guards.js";

export const AGENT_USAGE_REMINDER_MARKER = "[Agent Usage Reminder]";

export const AGENT_USAGE_REMINDER = `
${AGENT_USAGE_REMINDER_MARKER}
You called a search/fetch tool directly without leveraging specialized subagents.
As the builder orchestrator, prefer delegating exploration and research via the task tool:
- Explorer: task(subagent_type="explorer", prompt="Find files/code matching ...")
- Researcher: task(subagent_type="researcher", prompt="Investigate docs/library internals for ...")
- Worker: task(subagent_type="worker-quick" | "worker-deep" | "worker-ultra", prompt="...")

Parallel delegation preserves your context window and keeps work organized.
(Notice: this reminder is shown at most 3 times per session).
`;

const TARGET_TOOL_NAMES = new Set(["grep", "glob", "webfetch"]);
const TARGET_TOOL_PREFIXES = [
  "exa_",
  "context7_",
  "grep_app_",
  "mcp-gateway_",
  "codegraph_",
];

const MAX_REMINDERS = 3;

function isTargetTool(toolLower) {
  return (
    TARGET_TOOL_NAMES.has(toolLower) ||
    TARGET_TOOL_PREFIXES.some((prefix) => toolLower.startsWith(prefix))
  );
}

export function createAgentUsageReminderHook() {
  const sessionStates = new Map();

  function getOrCreateState(sessionID) {
    let state = sessionStates.get(sessionID);
    if (!state) {
      state = {
        agentUsed: false,
        reminderCount: 0,
      };
      sessionStates.set(sessionID, state);
    }
    return state;
  }

  return {
    "tool.execute.after": async (input, output) => {
      if (!input?.sessionID) return;
      if (isNonBuilderSession(input.sessionID)) return;
      if (typeof input?.tool !== "string") return;

      const toolLower = input.tool.toLowerCase();

      if (toolLower === "task") {
        const state = getOrCreateState(input.sessionID);
        state.agentUsed = true;
        return;
      }

      if (!isTargetTool(toolLower)) return;

      const state = getOrCreateState(input.sessionID);
      if (state.agentUsed || state.reminderCount >= MAX_REMINDERS) return;
      if (typeof output?.output !== "string") return;
      if (output.output.includes(AGENT_USAGE_REMINDER_MARKER)) return;

      output.output = `${output.output.trimEnd()}\n${AGENT_USAGE_REMINDER}`;
      state.reminderCount++;
    },

    event: async (input) => {
      const event = input?.event ?? input;
      if (event?.type === "session.deleted") {
        const props = event?.properties;
        const sessionID = props?.id ?? props?.sessionID ?? props?.info?.id;
        if (sessionID) {
          sessionStates.delete(sessionID);
        }
      }
    },
  };
}

// task-reminder: nudges todowrite discipline after turns without progress tracking
// (upstream: packages/omo-opencode/src/hooks/task-reminder/hook.ts)
export const TASK_REMINDER_THRESHOLD = 10;
export const TASK_REMINDER_MARKER = "[TASK REMINDER]";
export const TASK_REMINDER_MESSAGE = `${TASK_REMINDER_MARKER}
Progress has not been tracked recently (10+ turns). If you are executing multi-step work, remember to use todowrite to maintain task discipline or record progress in docs/plans/.`;

const PLANS_ROOT = normalize("docs/plans");
const TASK_RESET_TOOLS = new Set(["task", "todowrite"]);

export function isPlanFilePath(filePath) {
  if (typeof filePath !== "string" || !filePath.toLowerCase().endsWith(".md")) {
    return false;
  }
  const normalized = normalize(filePath);
  return (
    normalized.startsWith(`${PLANS_ROOT}${sep}`) ||
    normalized.includes(`${sep}${PLANS_ROOT}${sep}`)
  );
}

export function createTaskReminderHook(_ctx = {}, options = {}) {
  const sessionCounters = new Map();
  const threshold =
    options?.threshold ??
    (typeof _ctx?.threshold === "number" ? _ctx.threshold : TASK_REMINDER_THRESHOLD);

  return {
    "tool.execute.after": async (input, output) => {
      if (!input?.sessionID) return;
      if (typeof input?.tool !== "string") return;

      const toolLower = input.tool.toLowerCase();

      if (TASK_RESET_TOOLS.has(toolLower)) {
        sessionCounters.set(input.sessionID, 0);
        return;
      }

      if (toolLower === "write" || toolLower === "edit") {
        const filePath = resolveFilePath(output?.args) ?? resolveFilePath(input?.args);
        if (filePath && isPlanFilePath(filePath)) {
          sessionCounters.set(input.sessionID, 0);
          return;
        }
      }

      const currentCount = sessionCounters.get(input.sessionID) ?? 0;
      const newCount = currentCount + 1;

      if (
        newCount >= threshold &&
        typeof output?.output === "string" &&
        output.output.trim().length > 0
      ) {
        output.output = `${output.output.trimEnd()}\n\n${TASK_REMINDER_MESSAGE}`;
        sessionCounters.set(input.sessionID, 0);
      } else {
        sessionCounters.set(input.sessionID, newCount);
      }
    },

    event: async (input) => {
      const event = input?.event ?? input;
      if (event?.type === "session.deleted") {
        const props = event?.properties;
        const sessionID = props?.id ?? props?.sessionID ?? props?.info?.id;
        if (sessionID) {
          sessionCounters.delete(sessionID);
        }
      }
    },
  };
}

// category-skill-reminder with experimental transform (spliced in place)
// (upstream: packages/omo-opencode/src/hooks/category-skill-reminder/hook.ts)
export const CATEGORY_SKILL_REMINDER_THRESHOLD = 3;
export const CATEGORY_SKILL_REMINDER_MARKER = "[Category+Skill Reminder]";

export const CATEGORY_SKILL_REMINDER = `
${CATEGORY_SKILL_REMINDER_MARKER}
You have performed 3+ consecutive direct tool actions without delegating.
As the builder orchestrator, prefer delegating implementation work via the task tool to specialized worker subagents:
- Visual: task(subagent_type="worker-visual", description="[visual] ...", prompt="...")
- Deep: task(subagent_type="worker-deep", description="[deep] ...", prompt="...")
- Ultra: task(subagent_type="worker-ultra", description="[ultra] ...", prompt="...")
- Quick: task(subagent_type="worker-quick", description="[quick] ...", prompt="...")

Review <available_skills> for domain skills to include in LOAD SKILLS: [...] when delegating.
Parallel delegation preserves your context window and keeps work organized.
`.trim();

const CATEGORY_DIRECT_TOOLS = new Set([
  "edit",
  "write",
  "bash",
  "read",
  "grep",
  "glob",
]);

const CATEGORY_RESET_TOOLS = new Set(["task", "todowrite"]);

export function createCategorySkillReminderHook(_ctx = {}, options = {}) {
  const sessionStates = new Map();
  const threshold =
    options?.threshold ??
    (typeof _ctx?.threshold === "number"
      ? _ctx.threshold
      : CATEGORY_SKILL_REMINDER_THRESHOLD);
  const reminderMessage =
    options?.reminderMessage ??
    _ctx?.reminderMessage ??
    CATEGORY_SKILL_REMINDER;

  function getOrCreateState(sessionID) {
    let state = sessionStates.get(sessionID);
    if (!state) {
      state = {
        consecDirect: 0,
        pending: false,
        shownAt: 0,
      };
      sessionStates.set(sessionID, state);
    }
    return state;
  }

  return {
    "tool.execute.after": async (input, _output) => {
      if (!input?.sessionID) return;
      if (typeof input?.tool !== "string") return;

      const sessionID = input.sessionID;
      const toolLower = input.tool.toLowerCase();

      // Non-builder caller sessions (worker-deep, explorer, researcher) are bypassed
      if (isNonBuilderSession(sessionID)) {
        const state = sessionStates.get(sessionID);
        if (state) {
          state.pending = false;
        }
        return;
      }

      const state = getOrCreateState(sessionID);

      if (CATEGORY_RESET_TOOLS.has(toolLower)) {
        state.consecDirect = 0;
        state.pending = false;
        return;
      }

      if (!CATEGORY_DIRECT_TOOLS.has(toolLower)) {
        return;
      }

      state.consecDirect += 1;
      if (state.consecDirect >= threshold && !state.shownAt) {
        state.pending = true;
      }
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      const messages = output?.messages;
      if (!Array.isArray(messages) || messages.length === 0) return;

      for (let mIdx = messages.length - 1; mIdx >= 0; mIdx--) {
        const message = messages[mIdx];
        if (!message || typeof message !== "object") continue;
        const parts = message.parts;
        if (!Array.isArray(parts)) continue;

        const sessionID = message.info?.sessionID ?? message.sessionID;
        const messageID = message.info?.id ?? message.id;
        if (typeof sessionID !== "string" || typeof messageID !== "string") continue;

        const state = sessionStates.get(sessionID);
        if (!state?.pending) continue;

        // Skip if a reminder part is already present.
        const alreadyInjected = parts.some(
          (p) =>
            typeof p?.id === "string" &&
            p.id.startsWith("prt_category_skill_reminder_")
        );
        if (alreadyInjected) {
          state.pending = false;
          continue;
        }

        const textPartIndex = parts.findLastIndex(
          (part) => part?.type === "text" && !part?.synthetic
        );

        if (textPartIndex === -1) continue;

        const reminderPart = {
          id: `prt_category_skill_reminder_${messageID}`,
          sessionID,
          messageID,
          type: "text",
          text: reminderMessage,
          synthetic: true,
        };

        // Splice into the parts array in place; reassigning output.messages would not propagate.
        parts.splice(textPartIndex, 0, reminderPart);
        state.pending = false;
        state.shownAt = Date.now();
        state.consecDirect = 0;
        break;
      }
    },

    event: async (input) => {
      const event = input?.event ?? input;
      if (event?.type === "session.deleted") {
        const props = event?.properties;
        const sessionID = props?.id ?? props?.sessionID ?? props?.info?.id;
        if (sessionID) {
          sessionStates.delete(sessionID);
          for (const key of sessionStates.keys()) {
            if (key.startsWith(`${sessionID}:`)) {
              sessionStates.delete(key);
            }
          }
        }
      }
    },
  };
}

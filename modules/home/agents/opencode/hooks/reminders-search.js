import { shouldRunAgentUsageReminder } from "./guards.js";

const IMMEDIATE_SEARCH_TOOLS = new Set(["grep", "glob", "webfetch"]);
const IMMEDIATE_SEARCH_PREFIXES = ["codegraph_"];
const RESEARCH_SERVER_PREFIXES = ["exa_", "context7_", "grep_app_", "github_"];
const DYNAMIC_WRAPPERS = new Set(["calldynamictool", "call_dynamic_tool"]);
const RESEARCH_NAME_FRAGMENTS = [
  "web_search",
  "websearch",
  "google_search",
  "custom_websearch",
  "searchgithub",
  "query-docs",
  "query_docs",
  "resolve-library",
  "resolve_library",
  "web_fetch_exa",
];

export const RESEARCH_SEARCH_STREAK = 3;

function readArg(args, key) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "";
  const value = args[key];
  return typeof value === "string" ? value.toLowerCase() : "";
}

export function resolveSearchToolName(input, output) {
  const tool = typeof input?.tool === "string" ? input.tool.toLowerCase() : "";
  if (!tool) return "";

  const args = output?.args ?? input?.args;
  if (!DYNAMIC_WRAPPERS.has(tool)) return tool;

  const namespace = readArg(args, "namespace") || readArg(args, "server");
  const inner =
    readArg(args, "toolName") || readArg(args, "tool_name") || readArg(args, "name");
  if (!inner) return tool;
  return namespace ? `${namespace}_${inner}` : inner;
}

export function isImmediateSearchTool(toolName) {
  return (
    IMMEDIATE_SEARCH_TOOLS.has(toolName) ||
    IMMEDIATE_SEARCH_PREFIXES.some((prefix) => toolName.startsWith(prefix))
  );
}

export function isResearchSearchTool(toolName) {
  if (!toolName) return false;
  if (RESEARCH_SERVER_PREFIXES.some((prefix) => toolName.startsWith(prefix))) {
    return true;
  }
  return RESEARCH_NAME_FRAGMENTS.some((fragment) => toolName.includes(fragment));
}

export const AGENT_USAGE_REMINDER_MARKER = "[Agent Usage Reminder]";

export const AGENT_USAGE_REMINDER = `
${AGENT_USAGE_REMINDER_MARKER}
You searched the codebase directly without an explorer subagent.
As the caller, delegate local exploration via the task tool:
- ${AGENT_USAGE_REMINDER_MARKER} Explorer: task(subagent_type="explorer", prompt="Find files/code matching ...") — direct search can hide Line bodies; delegate to preserve accuracy.

Fire multiple explorers in parallel to preserve your context window.
(Notice: this reminder is shown at most 3 times per session).
`;

export const RESEARCHER_USAGE_REMINDER_MARKER = "[Researcher Usage Reminder]";

export const RESEARCHER_USAGE_REMINDER = `
${RESEARCHER_USAGE_REMINDER_MARKER}
You called 3+ documentation/web search tools directly without a researcher subagent.
As the caller, delegate research via the task tool:
- ${RESEARCHER_USAGE_REMINDER_MARKER} Researcher: task(subagent_type="researcher", prompt="Investigate docs/library internals for ...") — delegate to preserve citations and accuracy.

Parallel researchers preserve your context window and keep citations organized.
(Notice: this reminder is shown at most 3 times per session).
`;

const MAX_REMINDERS = 3;

function appendReminder(state, output, countKey, message, marker) {
  if (state[countKey] >= MAX_REMINDERS) return false;
  if (typeof output?.output !== "string") return false;
  if (output.output.includes(marker)) return false;
  output.output = `${output.output.trimEnd()}\n${message}`;
  state[countKey]++;
  return true;
}

function toolNameFromPart(part) {
  if (!part || part.type !== "tool") return "";
  const tool = typeof part.tool === "string" ? part.tool : "";
  const args = part.state?.input ?? part.state?.args ?? part.args;
  return resolveSearchToolName({ tool, args }, { args });
}

function partHasMarker(part, marker) {
  if (typeof part?.text === "string" && part.text.includes(marker)) return true;
  const out = part?.state?.output;
  return typeof out === "string" && out.includes(marker);
}

function trailingResearchStreak(messages, sessionID) {
  let streak = 0;
  for (let m = messages.length - 1; m >= 0; m--) {
    const message = messages[m];
    const sid = message?.info?.sessionID ?? message?.sessionID;
    if (sid !== sessionID) continue;
    const parts = message?.parts;
    if (!Array.isArray(parts)) continue;
    for (let p = parts.length - 1; p >= 0; p--) {
      const part = parts[p];
      if (part?.type !== "tool") continue;
      if (!isResearchSearchTool(toolNameFromPart(part))) return streak;
      streak += 1;
    }
  }
  return streak;
}

export function createAgentUsageReminderHook() {
  const sessionStates = new Map();

  function getOrCreateState(sessionID) {
    let state = sessionStates.get(sessionID);
    if (!state) {
      state = {
        explorerCount: 0,
        researcherCount: 0,
        consecResearch: 0,
      };
      sessionStates.set(sessionID, state);
    }
    return state;
  }

  return {
    "tool.execute.after": async (input, output) => {
      if (!input?.sessionID) return;
      if (!shouldRunAgentUsageReminder(input.sessionID)) return;
      if (typeof input?.tool !== "string") return;

      const toolLower = input.tool.toLowerCase();
      const searchName = resolveSearchToolName(input, output);

      if (toolLower === "task") {
        const state = getOrCreateState(input.sessionID);
        state.explorerCount = 0;
        state.researcherCount = 0;
        state.consecResearch = 0;
        return;
      }

      if (isImmediateSearchTool(searchName)) {
        const state = getOrCreateState(input.sessionID);
        state.consecResearch = 0;
        appendReminder(
          state,
          output,
          "explorerCount",
          AGENT_USAGE_REMINDER,
          AGENT_USAGE_REMINDER_MARKER,
        );
        return;
      }

      if (isResearchSearchTool(searchName)) {
        const state = getOrCreateState(input.sessionID);
        state.consecResearch += 1;
        if (state.consecResearch >= RESEARCH_SEARCH_STREAK) {
          if (
            appendReminder(
              state,
              output,
              "researcherCount",
              RESEARCHER_USAGE_REMINDER,
              RESEARCHER_USAGE_REMINDER_MARKER,
            )
          ) {
            state.consecResearch = 0;
          }
        }
        return;
      }

      const existing = sessionStates.get(input.sessionID);
      if (existing) existing.consecResearch = 0;
    },

    "experimental.chat.messages.transform": async (_input, output) => {
      const messages = output?.messages;
      if (!Array.isArray(messages) || messages.length === 0) return;

      const streakBySession = new Map();

      for (let mIdx = messages.length - 1; mIdx >= 0; mIdx--) {
        const message = messages[mIdx];
        if (!message || typeof message !== "object") continue;
        const parts = message.parts;
        if (!Array.isArray(parts)) continue;

        const sessionID = message.info?.sessionID ?? message.sessionID;
        const messageID = message.info?.id ?? message.id;
        if (typeof sessionID !== "string" || typeof messageID !== "string") continue;
        if (!shouldRunAgentUsageReminder(sessionID)) continue;

        if (parts.some((part) => partHasMarker(part, RESEARCHER_USAGE_REMINDER_MARKER))) {
          continue;
        }

        let streak = streakBySession.get(sessionID);
        if (streak === undefined) {
          streak = trailingResearchStreak(messages, sessionID);
          streakBySession.set(sessionID, streak);
        }
        if (streak < RESEARCH_SEARCH_STREAK) continue;

        const state = getOrCreateState(sessionID);
        if (state.researcherCount >= MAX_REMINDERS) continue;

        const textPartIndex = parts.findLastIndex(
          (part) => part?.type === "text" && !part?.synthetic,
        );
        const reminderPart = {
          id: `prt_researcher_usage_${messageID}`,
          sessionID,
          messageID,
          type: "text",
          text: RESEARCHER_USAGE_REMINDER,
          synthetic: true,
        };
        if (textPartIndex === -1) {
          parts.push(reminderPart);
        } else {
          parts.splice(textPartIndex, 0, reminderPart);
        }
        state.researcherCount += 1;
        state.consecResearch = 0;
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
        }
      }
    },
  };
}

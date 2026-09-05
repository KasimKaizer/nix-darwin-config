// 4. edit-error-recovery
// Upstream: packages/omo-opencode/src/hooks/edit-error-recovery/hook.ts
// NOTE: `tool.execute.after` does NOT fire on failed native-tool calls in
// opencode 1.18.x (verified live: successful `edit` logs after-hook, failed
// `edit` with status=error never reaches it — the Effect failure
// short-circuits before `plugin.trigger`). The legacy patterns below were
// also copied from the system-prompt docs ("oldString not found in content"),
// not the real thrown errors ("Could not find oldString in the file...").
// So the after-hook alone is dead live. The `tool.execute.before`
// pre-validation below is what actually fires: it mirrors the edit tool's
// own checks (from the opencode binary) and throws the reminder BEFORE the
// tool runs. The after-hook is kept (with live patterns + multi-field scan)
// for forward-compat and MCP edit variants that return errors as output.
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";

export const EDIT_ERROR_PATTERNS = [
  // Legacy docs wording (kept for compat with unit tests / older opencode).
  "oldString and newString must be different",
  "oldString not found",
  "oldString found multiple times",
  // Live opencode 1.18.x edit-tool errors (from binary strings).
  "No changes to apply",
  "Could not find oldString",
  "Found multiple matches for oldString",
  "Found multiple exact matches for oldString",
  "oldString must not be empty",
];

export const EDIT_ERROR_REMINDER = `
[EDIT ERROR - IMMEDIATE ACTION REQUIRED]

You made an Edit mistake. STOP and do this NOW:

1. READ the file immediately to see its ACTUAL current state
2. VERIFY what the content really looks like (your assumption was wrong)
3. APOLOGIZE briefly to the user for the error
4. CONTINUE with corrected action based on the real file content

DO NOT attempt another edit until you've read and verified the file state.
`;

const EDIT_ERROR_MARKER = "[EDIT ERROR - IMMEDIATE ACTION REQUIRED]";
const MAX_PRECHECK_BYTES = 2_000_000;

function resolveEditArgs(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return {};
  const filePath =
    typeof args.filePath === "string"
      ? args.filePath
      : typeof args.path === "string"
        ? args.path
        : typeof args.file_path === "string"
          ? args.file_path
          : typeof args.filepath === "string"
            ? args.filepath
            : undefined;
  const oldString =
    typeof args.oldString === "string"
      ? args.oldString
      : typeof args.old_string === "string"
        ? args.old_string
        : undefined;
  const newString =
    typeof args.newString === "string"
      ? args.newString
      : typeof args.new_string === "string"
        ? args.new_string
        : undefined;
  const replaceAll = args.replaceAll ?? args.replace_all ?? false;
  return { filePath, oldString, newString, replaceAll };
}

function collectAfterText(output) {
  const parts = [];
  if (typeof output?.output === "string") parts.push(output.output);
  if (typeof output?.error === "string") parts.push(output.error);
  if (typeof output?.title === "string") parts.push(output.title);
  if (Array.isArray(output?.content)) {
    for (const c of output.content) {
      if (typeof c?.text === "string") parts.push(c.text);
    }
  }
  return parts;
}

export function createEditErrorRecoveryHook(ctx) {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool?.toLowerCase() !== "edit") return;
      const { filePath, oldString, newString, replaceAll } = resolveEditArgs(output?.args ?? input?.args);
      if (typeof oldString !== "string" || typeof newString !== "string") return;

      if (oldString === newString) {
        throw new Error(`No changes to apply: oldString and newString are identical.\n${EDIT_ERROR_REMINDER}`);
      }
      if (oldString === "") {
        throw new Error(`oldString must not be empty. Use write to create or overwrite a file.\n${EDIT_ERROR_REMINDER}`);
      }
      if (typeof filePath !== "string" || filePath === "") return;

      let resolved;
      try {
        const directory = ctx?.directory ?? process.cwd();
        resolved = isAbsolute(filePath) ? filePath : resolve(directory, filePath);
      } catch {
        return;
      }
      let content;
      try {
        if (!existsSync(resolved)) return;
        const st = statSync(resolved);
        if (!st.isFile() || st.size > MAX_PRECHECK_BYTES) return;
        content = readFileSync(resolved, "utf-8");
      } catch {
        return;
      }

      // Mirror the tool's exact-match semantics, tolerating CRLF so we never
      // block an edit the tool would accept.
      const normalizedContent = content.replace(/\r\n/g, "\n");
      const normalizedOld = oldString.replace(/\r\n/g, "\n");
      const found = content.includes(oldString) || normalizedContent.includes(normalizedOld);
      if (!found) {
        throw new Error(
          `Could not find oldString in the file. It must match exactly, including whitespace, indentation, and line endings.\n${EDIT_ERROR_REMINDER}`
        );
      }
      if (replaceAll !== true) {
        const count =
          oldString.length === 0 ? 0 : content.split(oldString).length - 1;
        if (count > 1) {
          throw new Error(
            `Found multiple exact matches for oldString. Provide more surrounding context or set replaceAll to true.\n${EDIT_ERROR_REMINDER}`
          );
        }
      }
    },
    "tool.execute.after": async (input, output) => {
      if (input.tool?.toLowerCase() !== "edit") return;
      const parts = collectAfterText(output);
      if (parts.length === 0) return;
      if (parts.some((p) => p.includes(EDIT_ERROR_MARKER))) return;
      const haystack = parts.join("\n").toLowerCase();
      if (EDIT_ERROR_PATTERNS.some((p) => haystack.includes(p.toLowerCase()))) {
        if (typeof output.output === "string") {
          output.output += `\n${EDIT_ERROR_REMINDER}`;
        } else if (typeof output.error === "string") {
          output.error += `\n${EDIT_ERROR_REMINDER}`;
        } else if (Array.isArray(output.content)) {
          const firstText = output.content.find((c) => typeof c?.text === "string");
          if (firstText) firstText.text += `\n${EDIT_ERROR_REMINDER}`;
          else output.output = `${EDIT_ERROR_REMINDER}`;
        }
      }
    },
  };
}

// 5. json-error-recovery
// Upstream: packages/omo-opencode/src/hooks/json-error-recovery/hook.ts
export const JSON_ERROR_PATTERNS = [
  /json parse error/i,
  /failed to parse json/i,
  /invalid json/i,
  /malformed json/i,
  /unexpected end of json input/i,
  /syntaxerror:\s*unexpected token.*json/i,
  /json[^\n]*expected '\}'/i,
  /json[^\n]*unexpected eof/i,
];

export const JSON_ERROR_REMINDER = `
[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]

You sent invalid JSON arguments. The system could not parse your tool call.
STOP and do this NOW:

1. LOOK at the error message above to see what was expected vs what you sent.
2. CORRECT your JSON syntax (missing braces, unescaped quotes, trailing commas, etc).
3. RETRY the tool call with valid JSON.

DO NOT repeat the exact same invalid call.
`;

// Native tools whose outputs are data (file contents, search results) or
// owned by other hooks: a JSON-error string in them is content to read,
// not a failed call to retry.
export const JSON_ERROR_TOOL_EXCLUDE_LIST = new Set([
  "bash",
  "code-mode",
  "glob",
  "grep",
  "mcp-add",
  "mcp-config-set",
  "mcp-exec",
  "mcp-find",
  "read",
  "skill",
  "task",
  "todoread",
  "todowrite",
  "webfetch",
]);

// Namespaces whose tools return data (docs, code, search results, page
// text): a JSON-error string in them is content, not a failed call.
// OpenCode registers MCP tools with the server name as prefix
// (https://opencode.ai/docs/mcp-servers), hyphens preserved, so the sandbox
// gateway (server key "mcp-gateway" in sandbox.nix) yields "mcp-gateway_*".
// Extend when a new data-source server is added to agents.nix mcpServers.
export const JSON_ERROR_NAMESPACE_EXCLUDE_PREFIXES = [
  "codegraph_",
  "context7_",
  "custom_websearch",
  "exa_",
  "github_",
  "google_search",
  "grep_app_",
  "mcp-gateway_",
  "nix_",
  "playwright_",
  "sequential-thinking_",
  "serena_",
  "websearch",
];

export function isJsonRecoveryExcluded(toolName) {
  const name = toolName?.toLowerCase();
  if (!name) return false;
  return (
    JSON_ERROR_TOOL_EXCLUDE_LIST.has(name) ||
    JSON_ERROR_NAMESPACE_EXCLUDE_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
}

export function createJsonErrorRecoveryHook() {
  return {
    "tool.execute.after": async (input, output) => {
      if (isJsonRecoveryExcluded(input.tool)) return;
      if (typeof output?.output !== "string") return;
      if (output.output.includes("[JSON PARSE ERROR - IMMEDIATE ACTION REQUIRED]")) return;
      if (JSON_ERROR_PATTERNS.some((p) => p.test(output.output))) {
        output.output += `\n${JSON_ERROR_REMINDER}`;
      }
    },
  };
}

// 6. empty-task-response-detector
// Upstream: packages/omo-opencode/src/hooks/empty-task-response-detector.ts
export const EMPTY_RESPONSE_WARNING = `[Task Empty Response Warning]

Task invocation completed but returned no response. This indicates the agent either:
- Failed to execute properly
- Did not terminate correctly
- Returned an empty result

Note: The call has already completed - you are NOT waiting for a response. Proceed accordingly.`;

export function createEmptyTaskResponseDetectorHook() {
  return {
    "tool.execute.after": async (input, output) => {
      if (input.tool?.toLowerCase() !== "task") return;
      const responseText = typeof output?.output === "string" ? output.output.trim() : "";
      if (!responseText) {
        output.output = EMPTY_RESPONSE_WARNING;
        return;
      }
      // OpenCode 1.18 wraps completed results in a <task><task_result>
      // envelope, so emptiness is judged on human-readable text: the
      // insides of result blocks plus anything outside tags. This covers
      // bare whitespace, whitespace-only envelopes, and malformed
      // envelopes with no result block — without touching real content
      // (prose mentioning tags, or text inside non-result blocks).
      const inners = [];
      const outside = responseText.replace(
        /<task_result[\s>]([\s\S]*?)<\/task_result\s*>/gi,
        (_, group) => {
          inners.push(group);
          return " ";
        },
      );
      const readable = `${inners.join(" ")} ${outside.replace(/<[^>]*>/g, " ")}`.trim();
      if (!readable) {
        output.output = EMPTY_RESPONSE_WARNING;
      }
    },
  };
}

// 7. task-resume-info
// Upstream: packages/omo-opencode/src/hooks/task-resume-info/hook.ts
export const TASK_RESUME_TOOLS = new Set(["task", "task_tool"]);

export function createTaskResumeInfoHook() {
  return {
    "tool.execute.after": async (input, output) => {
      if (!TASK_RESUME_TOOLS.has(input.tool?.toLowerCase())) return;
      if (typeof output?.output !== "string") return;
      const outputText = output.output;
      if (outputText.startsWith("Error:") || outputText.startsWith("Failed")) return;
      if (outputText.includes("\nto continue:")) return;

      const meta = output.metadata;
      const taskId =
        meta?.taskId ??
        meta?.sessionId ??
        outputText.match(/(?:task_id|sessionId|session_id)[="':\s]+([a-zA-Z0-9_-]+)/)?.[1];
      if (!taskId) return;

      output.output = `${outputText.trimEnd()}\n\nto continue: task(task_id="${taskId}", load_skills=[], run_in_background=false, prompt="...")`;
    },
  };
}

// 8. tool-output-truncator
// Upstream: packages/omo-opencode/src/hooks/tool-output-truncator.ts
const TRUNCATABLE_TOOLS = new Set(["grep", "safe_grep", "glob", "safe_glob", "webfetch", "lsp_diagnostics", "skill_mcp"]);
const DEFAULT_MAX_CHARS = 200_000;
const WEBFETCH_MAX_CHARS = 40_000;

export function createToolOutputTruncatorHook() {
  return {
    "tool.execute.after": async (input, output) => {
      const toolName = input.tool?.toLowerCase();
      if (!TRUNCATABLE_TOOLS.has(toolName)) return;
      if (typeof output?.output !== "string") return;

      const maxChars = toolName === "webfetch" ? WEBFETCH_MAX_CHARS : DEFAULT_MAX_CHARS;
      if (output.output.length > maxChars) {
        const truncatedCount = output.output.length - maxChars;
        output.output =
          output.output.slice(0, maxChars) +
          `\n\n[Output truncated: omitted ${truncatedCount} characters exceeding length limit.]`;
      }
    },
  };
}

// 9. task-completion notepad reminder
// Upstream: packages/omo-opencode/src/hooks/atlas/verification-reminders.ts
// (STEP 5: READ SUBAGENT NOTEPAD). Ported without the boulder-state progress
// machine, session-reuse routing, and plan-name resolution, which would
// require an external progress-tracking database. Nudges the orchestrator
// to read fresh notepad entries after each completed delegation.
export const NOTEPAD_READ_REMINDER_MARKER = "[READ SUBAGENT NOTEPAD]";

export const NOTEPAD_READ_REMINDER = `
[READ SUBAGENT NOTEPAD]

The subagent was instructed to record findings in notepad files. Read them NOW:
- \`docs/plans/notepads/*/learnings.md\`: Patterns, conventions, successful approaches discovered
- \`docs/plans/notepads/*/issues.md\`: Problems, blockers, gotchas encountered during work

**USE this information to:**
- Inform your next delegation (avoid known pitfalls)
- Adjust your plan if blockers were discovered
- Propagate learnings to subsequent subagents
`;

export function createNotepadReadReminderHook() {
  return {
    "tool.execute.after": async (input, output) => {
      if (!TASK_RESUME_TOOLS.has(input.tool?.toLowerCase())) return;
      if (typeof output?.output !== "string") return;
      const outputText = output.output;
      if (outputText.startsWith("Error:") || outputText.startsWith("Failed")) return;
      // An empty delegation recorded nothing — no read nudge.
      if (outputText.includes("[Task Empty Response Warning]")) return;
      if (outputText.includes(NOTEPAD_READ_REMINDER_MARKER)) return;
      output.output = `${outputText.trimEnd()}\n${NOTEPAD_READ_REMINDER}`;
    },
  };
}

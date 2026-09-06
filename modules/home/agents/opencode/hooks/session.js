import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import {
  getTaskTargetAgent,
  isNonBuilderSession,
  isWorkerTargetAgent,
  resolveFilePath,
} from "./guards.js";

// plan-format-validator (upstream: packages/omo-opencode/src/hooks/plan-format-validator/hook.ts):
// warns when plan checkboxes deviate from the progress-counter format.
const SECTION_BOUNDARY_HEADING = /^#{1,2}(?:[ \t]+|$)/;
const HEADING_TODOS = /^##[ \t]+TODOs(?:[ \t]+#+)?[ \t]*$/i;
const HEADING_FINAL_WAVE = /^##[ \t]+Final Verification Wave(?:[ \t]+#+)?[ \t]*$/i;
const TOPLEVEL_CHECKBOX = /^[-*]\s*\[[ xX]?\]/;
const TODO_TASK = /^- \[[ xX]\] [1-9]\d*\. .+$/;
const FINAL_WAVE_TASK = /^- \[[ xX]\] F[1-9]\d*\. .+$/i;

export function buildPlanFormatWarning(rawCount, parsedCount, hasEmptySection) {
  if (hasEmptySection) {
    const summary =
      parsedCount === 0
        ? "Plan has recognized task sections but no valid task rows."
        : "One or more recognized task sections contain no valid task rows.";
    return [
      "",
      "<plan-format-warning>",
      summary,
      "Those sections will contribute no tasks to execution progress.",
      "",
      "**Fix**: Every task checkbox under `## TODOs` MUST start with a bare number",
      "followed by dot + space: `1.`, `2.`, `3.` — NOT `T1.`, `Phase 1:`, `Task-1.` etc.",
      "Every Final Verification Wave checkbox MUST start with `F` + number:",
      "`F1.`, `F2.` — NOT `T-F1.`, `F-1.`, `Final-1.` etc.",
      "</plan-format-warning>",
    ].join("\n");
  }
  const skipped = rawCount - parsedCount;
  return [
    "",
    "<plan-format-warning>",
    `Plan has **${rawCount} task checkbox(es)** but only parsed **${parsedCount}**. `,
    `**${skipped} task(s)** have malformed labels and will be SKIPPED by the progress counter.`,
    "",
    "**Fix**: Ensure every skipped task checkbox uses bare-number format:",
    "  `## TODOs` → `1.`, `2.`, `3.` (NOT `T1.`, `Phase 1:`, `Task-1.`)",
    "  `## Final Verification Wave` → `F1.`, `F2.`, `F3.` (NOT `T-F1.`, `F-1.`, `Final-1.`)",
    "</plan-format-warning>",
  ].join("\n");
}

function analyzePlanMarkdown(content) {
  const lines = content.split(/\r?\n/);
  const sections = [];
  let section = null;
  for (const line of lines) {
    if (SECTION_BOUNDARY_HEADING.test(line)) {
      if (HEADING_TODOS.test(line)) {
        section = { name: "todo", rawCount: 0, validCount: 0 };
        sections.push(section);
      } else if (HEADING_FINAL_WAVE.test(line)) {
        section = { name: "final-wave", rawCount: 0, validCount: 0 };
        sections.push(section);
      } else {
        section = null;
      }
      continue;
    }
    if (!section || !TOPLEVEL_CHECKBOX.test(line)) continue;
    section.rawCount += 1;
    const validPattern = section.name === "todo" ? TODO_TASK : FINAL_WAVE_TASK;
    if (validPattern.test(line)) section.validCount += 1;
  }
  return {
    rawCount: sections.reduce((acc, s) => acc + s.rawCount, 0),
    validCount: sections.reduce((acc, s) => acc + s.validCount, 0),
    hasEmptySection: sections.some((s) => s.validCount === 0),
    hasMalformedRows: sections.some((s) => s.rawCount !== s.validCount),
    recognized: sections.length > 0,
  };
}

export function createPlanFormatValidatorHook(ctx) {
  return {
    "tool.execute.after": async (input, output) => {
      const toolName = input.tool?.toLowerCase();
      if (toolName !== "write" && toolName !== "edit") return;
      if (typeof output?.output === "string" && output.output.includes("<plan-format-warning>")) return;
      const filePath = resolveFilePath(input.args ?? output?.args);
      if (!filePath) return;
      const normalized = filePath.toLowerCase().replace(/\\/g, "/");
      if (!normalized.endsWith(".md")) return;
      if (!normalized.includes("docs/plans/")) return;

      const directory = ctx?.directory ?? process.cwd();
      const resolvedPath = isAbsolute(filePath) ? filePath : resolve(directory, filePath);
      if (!existsSync(resolvedPath)) return;

      const content = readFileSync(resolvedPath, "utf-8");
      const stats = analyzePlanMarkdown(content);
      if (!stats.recognized) return;
      if (!stats.hasEmptySection && !stats.hasMalformedRows) return;

      output.output = `${output.output ?? ""}${buildPlanFormatWarning(stats.rawCount, stats.validCount, stats.hasEmptySection)}`;
    },
  };
}

// notepad-directive (upstream: packages/omo-opencode/src/hooks/sisyphus-junior-notepad/constants.ts):
// prepends notepad context to worker subagent prompts.
export const NOTEPAD_DIRECTIVE = `
<Work_Context>
## Notepad Location (for recording learnings)
NOTEPAD PATH: docs/plans/notepads/{plan-name}/
- learnings.md: Record patterns, conventions, successful approaches
- issues.md: Record problems, blockers, gotchas encountered
- decisions.md: Record architectural choices and rationales
- problems.md: Record unresolved issues, technical debt

You SHOULD append findings to notepad files after completing work.
Notepad files are auto-scaffolded by work-plan. APPEND only - use the \`edit\` tool (match-and-insert after the last line) or \`bash\` \`>>\`. Never use the \`write\` tool (blocked by notepad-write-guard) and never overwrite.

## Plan Location (subagent: READ ONLY)
PLAN PATH: docs/plans/{plan-name}.md

SUBAGENT PLAN RESTRICTION (applies to YOU, the delegated worker — NOT to the Orchestrator):
- You may READ the plan to understand your assigned tasks
- You may READ checkbox items to know what to work on
- You MUST NOT edit the plan file or mark checkboxes — that is the Orchestrator's job
- The Orchestrator (builder) updates checkboxes after verifying your completed work
</Work_Context>
`;

export function createNotepadDirectiveHook() {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool?.toLowerCase() !== "task") return;
      if (isNonBuilderSession(input.sessionID)) return;
      const targetAgent = getTaskTargetAgent(output?.args);
      if (!isWorkerTargetAgent(targetAgent)) return;
      const prompt = output?.args?.prompt;
      if (typeof prompt !== "string") return;
      if (prompt.includes("<Work_Context>")) return;
      // Mutate in place: output.args shares the tool's live args reference, so
      // only property assignment propagates (see session/tools.ts).
      output.args.prompt = NOTEPAD_DIRECTIVE + "\n" + prompt;
    },
  };
}

// compaction-todo-preserver (upstream: packages/omo-opencode/src/hooks/compaction-todo-preserver/hook.ts):
// preserves open todos across compaction, falling back to SQLite so they survive restarts.
export async function getStoredTodosFromSqlite(sessionID) {
  if (!sessionID) return [];
  const dataDir = process.env.XDG_DATA_HOME
    ? join(process.env.XDG_DATA_HOME, "opencode")
    : join(homedir(), ".local/share/opencode");
  const candidates = [join(dataDir, "opencode-stable.db"), join(dataDir, "opencode.db")];
  const dbPath = candidates.find((p) => existsSync(p));
  if (!dbPath) return [];

  // Try bun:sqlite first (runtime of opencode binary)
  try {
    const { Database } = await import("bun:sqlite");
    const db = new Database(dbPath, { readonly: true });
    try {
      return db
        .query(
          "SELECT content, status FROM todo WHERE session_id = ? AND status != 'completed' AND status != 'cancelled' ORDER BY position ASC"
        )
        .all(sessionID);
    } finally {
      db.close();
    }
  } catch {}

  // Try node:sqlite (when running under Node v22.5+)
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(dbPath, { readOnly: true });
    try {
      const stmt = db.prepare(
        "SELECT content, status FROM todo WHERE session_id = ? AND status != 'completed' AND status != 'cancelled' ORDER BY position ASC"
      );
      return stmt.all(sessionID);
    } finally {
      db.close();
    }
  } catch {}

  return [];
}

export function createCompactionTodoPreserverHook(ctx) {
  const todoSnapshots = new Map();
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool?.toLowerCase() !== "todowrite" || !input.sessionID) return;
      if (!Array.isArray(output?.args?.todos)) return;
      todoSnapshots.set(input.sessionID, output.args.todos);
    },
    event: async ({ event }) => {
      if (event?.type === "session.deleted" && event?.properties?.id) {
        todoSnapshots.delete(event.properties.id);
      }
    },
    getSnapshot: async (sessionID) => {
      if (!sessionID) return [];
      // 1. In-memory snapshot (active session uncommitted state)
      const inMemory = todoSnapshots.get(sessionID);
      if (Array.isArray(inMemory) && inMemory.length > 0) {
        return inMemory;
      }
      // 2. OpenCode SDK client (if running in server context with client)
      if (ctx?.client?.session?.todo) {
        try {
          const res = await ctx.client.session.todo({ path: { id: sessionID } });
          const list = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
          if (list.length > 0) return list;
        } catch {}
      }
      // 3. Fallback to OpenCode's SQLite database directly (survives restarts)
      const dbRows = await getStoredTodosFromSqlite(sessionID);
      if (dbRows.length > 0) return dbRows;
      return inMemory ?? [];
    },
  };
}

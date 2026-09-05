import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, join, normalize, relative, resolve, sep } from "node:path";

export function resolveFilePath(args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return undefined;
  const raw = args.filePath ?? args.path ?? args.file_path;
  return typeof raw === "string" ? raw : undefined;
}

// Session agent tracking. Trigger inputs for tool calls carry no agent
// field, so the plugin records sessionID -> agent from "chat.message"
// traffic (which does carry it) and gates builder-scoped hooks on it.
const sessionAgents = new Map();

export function recordSessionAgent(sessionID, agent) {
  if (sessionID && typeof agent === "string" && agent !== "") {
    sessionAgents.set(sessionID, agent.toLowerCase());
  }
}

// Skip only sessions positively identified as a non-builder agent.
// Headless `opencode run` primary sessions arrive with agent undefined
// while worker subagents self-identify, so an untracked session is
// presumed to be the orchestrator.
export function isNonBuilderSession(sessionID) {
  const agent = sessionAgents.get(sessionID);
  return agent !== undefined && agent !== "builder";
}

// 1. notepad-write-guard
// Upstream: packages/omo-opencode/src/hooks/notepad-write-guard/index.ts
const NOTEPAD_ROOT = normalize("docs/plans/notepads");

export function isNotepadPath(filePath) {
  const normalizedPath = normalize(filePath);
  return (
    normalizedPath === NOTEPAD_ROOT ||
    normalizedPath.startsWith(`${NOTEPAD_ROOT}${sep}`) ||
    normalizedPath.includes(`${sep}${NOTEPAD_ROOT}${sep}`)
  );
}

export function createNotepadWriteGuardHook() {
  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool?.toLowerCase() !== "write") return;
      const filePath = resolveFilePath(output?.args);
      if (!filePath) return;
      // Global: every agent's writes are policed. Notepad history must
      // survive regardless of which session attempts the overwrite —
      // especially worker subagents recording learnings via #11.
      if (isNotepadPath(filePath)) {
        throw new Error(
          `Refused: Write to ${filePath} is blocked because notepad files are append-only and Write would destroy history. Report the original Edit failure to the user and ask for guidance instead.`
        );
      }
    },
  };
}

// 2. write-existing-file-guard
// Upstream: packages/omo-opencode/src/hooks/write-existing-file-guard/hook.ts
function toCanonicalPath(absolutePath) {
  if (existsSync(absolutePath)) {
    try {
      return normalize(realpathSync.native(absolutePath));
    } catch {
      return normalize(absolutePath);
    }
  }
  const absoluteDir = dirname(absolutePath);
  const resolvedDir = existsSync(absoluteDir) ? realpathSync.native(absoluteDir) : absoluteDir;
  return normalize(join(resolvedDir, basename(absolutePath)));
}

function isPathInsideDirectory(pathToCheck, directory) {
  const rel = relative(directory, pathToCheck);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

export function createWriteExistingFileGuardHook(ctx) {
  const readPermissionsBySession = new Map();
  return {
    "tool.execute.before": async (input, output) => {
      const toolName = input.tool?.toLowerCase();
      if (toolName !== "write" && toolName !== "read") return;

      const args = output?.args;
      const filePath = resolveFilePath(args);
      if (!filePath) return;

      const directory = ctx?.directory ?? process.cwd();
      const resolvedPath = normalize(isAbsolute(filePath) ? filePath : resolve(directory, filePath));
      const canonicalSessionRoot = toCanonicalPath(directory);
      const canonicalPath = toCanonicalPath(resolvedPath);

      if (!isPathInsideDirectory(canonicalPath, canonicalSessionRoot)) return;

      if (toolName === "read") {
        if (!existsSync(resolvedPath) || !input.sessionID) return;
        let readSet = readPermissionsBySession.get(input.sessionID);
        if (!readSet) {
          readSet = new Set();
          readPermissionsBySession.set(input.sessionID, readSet);
        }
        readSet.add(canonicalPath);
        return;
      }

      if (!existsSync(resolvedPath)) return;

      if (args?.overwrite === true) return;

      if (readPermissionsBySession.get(input.sessionID)?.delete(canonicalPath)) return;

      throw new Error("File already exists. Use edit tool instead.");
    },
  };
}

// 3. bash-file-read-guard
// Upstream: packages/omo-opencode/src/hooks/bash-file-read-guard.ts
export const FILE_READ_WARNING =
  "Prefer the Read tool over `cat`/`head`/`tail` for reading file contents. The Read tool provides line numbers and hash anchors for precise editing.";

const FILE_READ_PATTERNS = [
  /^\s*cat\s+(?!-)[^\s|&;]+\s*$/,
  /^\s*head\s+(-n\s+\d+\s+)?(?!-)[^\s|&;]+\s*$/,
  /^\s*tail\s+(-n\s+\d+\s+)?(?!-)[^\s|&;]+\s*$/,
];

export function createBashFileReadGuardHook() {
  return {
    "tool.execute.after": async (input, output) => {
      if (input.tool?.toLowerCase() !== "bash") return;
      const command = input?.args?.command ?? output?.metadata?.command;
      if (typeof command !== "string" || typeof output?.output !== "string") return;
      if (FILE_READ_PATTERNS.some((p) => p.test(command))) {
        output.output = `${output.output.trimEnd()}\n\n[Notice: ${FILE_READ_WARNING}]`;
      }
    },
  };
}

// Ported from packages/omo-opencode delegate-task-retry (adapted to local
// subagent_type/description/prompt params). Validates delegation args BEFORE
// dispatch: after-hooks never run on failure, so throwing here always runs.
import { getTaskTargetAgent } from "./guards.js";

export const RETRY_GUIDANCE_MARKER = "[task CALL FAILED - IMMEDIATE RETRY REQUIRED]";

export const LOCAL_SUBAGENTS = [
  // NOTE: keep in sync with the builder task allowlist in opencode.nix
  // (unknown names are rejected by the validator below).
  "worker-deep",
  "worker-visual",
  "worker-ultra",
  "worker-quick",
  "planner",
  "reviewer",
  "advisor",
  "explorer",
  "researcher",
];

export const FORBIDDEN_TASK_ARGS = [
  {
    arg: "run_in_background",
    errorType: "forbidden_run_in_background",
    fixHint:
      "Remove 'run_in_background'. Local task delegation requires only subagent_type, description, and prompt.",
  },
  {
    arg: "load_skills",
    errorType: "forbidden_load_skills",
    fixHint:
      "Remove 'load_skills'. Local task delegation requires only subagent_type, description, and prompt. Skills are invoked via the skill tool.",
  },
  {
    arg: "category",
    errorType: "forbidden_category",
    fixHint:
      "Remove 'category'. Use subagent_type ('worker-quick', 'worker-deep', 'explorer', 'researcher', etc.) with description and prompt.",
  },
];

const ROSTER_LIST = LOCAL_SUBAGENTS.join(", ");

const AGENT_FIX_BY_ERROR_TYPE = {
  empty_agent: `Provide a non-empty subagent_type: ${ROSTER_LIST}.`,
  unknown_agent: `Use a valid subagent_type from the available local agents: ${ROSTER_LIST}.`,
  primary_agent:
    "Primary agent 'builder' cannot be called via task. Use a subagent: worker-deep, worker-quick, explorer, researcher, planner, reviewer, advisor, worker-visual, worker-ultra.",
};

export function buildRetryGuidance(errorType, detail = "") {
  const forbidden = FORBIDDEN_TASK_ARGS.find((entry) => entry.errorType === errorType);
  const fix =
    forbidden?.fixHint ??
    AGENT_FIX_BY_ERROR_TYPE[errorType] ??
    "Fix the error and retry with correct parameters.";

  let guidance = `${RETRY_GUIDANCE_MARKER}

**Error Type**: ${errorType}
**Fix**: ${fix}
`;

  if (detail) {
    guidance += `
**Received**: ${detail}
`;
  }

  guidance += `
**Action**: Retry task NOW with corrected parameters.

Example of CORRECT call:
\`\`\`
task(
  subagent_type="worker-quick",
  description="...",
  prompt="..."
)
\`\`\`
`;

  return guidance.trim();
}

export function createDelegateTaskRetryHook() {
  return {
    "tool.execute.before": async (input, output) => {
      if (input?.tool?.toLowerCase() !== "task") return;
      const args = output?.args;
      if (!args || typeof args !== "object" || Array.isArray(args)) return;

      for (const rule of FORBIDDEN_TASK_ARGS) {
        if (Object.prototype.hasOwnProperty.call(args, rule.arg)) {
          throw new Error(buildRetryGuidance(rule.errorType, rule.arg));
        }
      }

      const target = getTaskTargetAgent(args);
      if (target === undefined) {
        // Fail open when no agent key is present at all: the server validates
        // the rest and produces its own error. But a present-but-blank key is
        // always a mistake — reject it with guidance.
        const hasAgentKey = ["subagent_type", "subagent", "agent"].some((key) =>
          Object.prototype.hasOwnProperty.call(args, key),
        );
        if (!hasAgentKey) return;
        throw new Error(buildRetryGuidance("empty_agent", ""));
      }
      const name = target.trim();
      if (name === "") {
        throw new Error(buildRetryGuidance("empty_agent", target));
      }
      const lower = name.toLowerCase();
      if (lower === "builder") {
        throw new Error(buildRetryGuidance("primary_agent", name));
      }
      if (!LOCAL_SUBAGENTS.some((agent) => agent.toLowerCase() === lower)) {
        throw new Error(buildRetryGuidance("unknown_agent", name));
      }
    },
  };
}

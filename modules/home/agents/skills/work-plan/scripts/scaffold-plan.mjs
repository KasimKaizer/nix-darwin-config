#!/usr/bin/env node
// scaffold-plan.mjs - generate the plan draft + skeleton deterministically.
//
// Zero external dependencies (node:fs/path/process/url builtins only) so it runs
// byte-identically under `node` and `bun` on macOS, Linux, and Windows.
//
// Usage:  node "<skill-root>/scripts/scaffold-plan.mjs" <slug> [--clear|--unclear] [--draft-only] [--review-required] [--reset [--force]]
//
// RESUME-SAFE: run it ONCE at plan generation. A plain re-run on an existing
// plan artifact is a NO-OP success (it never overwrites your appended todos).
// Destructive overwrite is reserved behind --reset, and --reset refuses to discard
// a hand-edited file unless --force is also passed.

import { lstat, mkdir, writeFile, readFile, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";

export const PLAN_SECTION_HEADERS = [
  "## TL;DR (For humans)",
  "## Scope",
  "## Verification strategy",
  "## Execution strategy",
  "## Todos",
  "## Final verification wave",
  "## Commit strategy",
  "## Success criteria",
];

export const FINAL_VERIFICATION_ITEMS = [
  "F1. Plan compliance audit",
  "F2. Code quality review",
  "F3. Real manual QA",
  "F4. Scope fidelity",
];

export const NOTEPAD_FILES = [
  "learnings.md",
  "decisions.md",
  "issues.md",
  "problems.md",
];

export const NOTEPAD_LABELS = {
  "learnings.md": "Learnings",
  "decisions.md": "Decisions",
  "issues.md": "Issues",
  "problems.md": "Problems",
};

export const NOTEPAD_PURPOSES = {
  "learnings.md":
    "Conventions, patterns, and successful approaches discovered during work on this plan.",
  "decisions.md":
    "Architectural choices and rationales discovered during work on this plan.",
  "issues.md":
    "Problems and gotchas encountered during work on this plan.",
  "problems.md":
    "Unresolved blockers and technical debt discovered during work on this plan.",
};

export const NOTEPAD_FOOTER =
  "_Auto-scaffolded by work-plan. Append new entries below - never overwrite._";

export function buildNotepadHeader(fileName, slug) {
  const label = NOTEPAD_LABELS[fileName];
  const purpose = NOTEPAD_PURPOSES[fileName];
  return `# ${label} — ${slug}\n\n${purpose}\n\n${NOTEPAD_FOOTER}\n\n---\n`;
}

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;

export function parseArgs(argv) {
  const rest = argv.slice(2);
  let slug;
  let intent = "unspecified";
  let force = false;
  let reset = false;
  let draftOnly = false;
  let reviewRequired = false;
  for (const arg of rest) {
    if (arg === "--clear") intent = "clear";
    else if (arg === "--unclear") intent = "unclear";
    else if (arg === "--reset") reset = true;
    else if (arg === "--force") force = true;
    else if (arg === "--draft-only") draftOnly = true;
    else if (arg === "--review-required") reviewRequired = true;
    else if (arg.startsWith("--")) throw new Error(`unknown flag: ${arg}`);
    else if (slug === undefined) slug = arg;
    else throw new Error(`unexpected argument: ${arg}`);
  }
  if (!slug)
    throw new Error(
      "usage: scaffold-plan.mjs <slug> [--clear|--unclear] [--draft-only] [--review-required] [--reset [--force]]",
    );
  if (!SLUG_PATTERN.test(slug)) {
    throw new Error(
      `invalid slug "${slug}" - use lowercase letters, digits, and hyphens only`,
    );
  }
  return { slug, intent, reset, force, draftOnly, reviewRequired };
}

export function resolveSafePlanPath(cwd, relPath) {
  const resolved = resolve(cwd, relPath);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(`refused: path escapes the workspace root: ${relPath}`);
  }
  if (!/(^|[/\\])docs[/\\]plans([/\\]|$)/i.test(rel)) {
    throw new Error(
      `refused: planning artifacts may only be written under docs/plans/: ${relPath}`,
    );
  }
  if (!resolved.toLowerCase().endsWith(".md")) {
    throw new Error(
      `refused: planning artifacts may only write .md files: ${relPath}`,
    );
  }
  return resolved;
}

function assertContainedPath(parent, child, message) {
  const rel = relative(parent, child);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(message);
  }
}

async function mkdirWithoutSymlinks(dir, stopAt) {
  if (dir === stopAt) return;
  const parent = dirname(dir);
  if (
    parent === dir ||
    relative(stopAt, dir).startsWith("..") ||
    isAbsolute(relative(stopAt, dir))
  ) {
    throw new Error(`refused: path escapes the workspace root: ${dir}`);
  }
  await mkdirWithoutSymlinks(parent, stopAt);
  const stat = await lstat(dir).catch((err) => {
    if (err && err.code === "ENOENT") return null;
    throw err;
  });
  if (stat) {
    if (stat.isSymbolicLink()) {
      throw new Error(`refused: path component is a symlink: ${dir}`);
    }
    if (!stat.isDirectory()) {
      throw new Error(`refused: path component is not a directory: ${dir}`);
    }
    return;
  }
  await mkdir(dir);
}

async function assertSafeWriteParent(cwd, target) {
  const workspaceReal = await realpath(cwd);
  const workspaceRoot = resolve(cwd);
  const plansRoot = resolve(cwd, "docs", "plans");
  const parent = dirname(target);
  assertContainedPath(
    workspaceRoot,
    parent,
    `refused: path escapes the workspace root: ${target}`,
  );
  assertContainedPath(
    plansRoot,
    parent,
    `refused: planning artifacts may only be written under docs/plans/: ${target}`,
  );
  await mkdirWithoutSymlinks(parent, workspaceRoot);
  const plansReal = await realpath(plansRoot);
  const parentReal = await realpath(parent);
  assertContainedPath(
    workspaceReal,
    parentReal,
    `refused: path escapes the workspace root through symlinks: ${target}`,
  );
  assertContainedPath(
    plansReal,
    parentReal,
    `refused: planning artifacts may only write under docs/plans/ through real paths: ${target}`,
  );
}

async function assertSafeWriteTarget(target) {
  const stat = await lstat(target).catch((err) => {
    if (err && err.code === "ENOENT") return null;
    throw err;
  });
  if (stat?.isSymbolicLink()) {
    throw new Error(`refused: target is a symlink: ${target}`);
  }
}

export function isPlanArtifact(content) {
  const isPlan =
    content.includes("## TL;DR (For humans)") &&
    content.includes("## Final verification wave");
  const isDraft =
    content.includes("# Draft:") && content.includes("## Approval gate");
  return isPlan || isDraft;
}

export function buildDraft(slug, intent, { reviewRequired = false } = {}) {
  const assumptionsNote =
    intent === "unclear"
      ? "Intent is UNCLEAR: research resolves ambiguity, defaults are adopted (not asked), and each is surfaced in the plan's human TL;DR for veto."
      : "Record any default you adopt instead of asking, so the user can veto it at the gate.";
  const reviewState = reviewRequired
    ? `review_required: true
plan_path: docs/plans/${slug}.md
plan_sha256: null
review_round_id: null
pending-action: write and review docs/plans/${slug}.md
review:
  reviewer:
    status: pending
    workspace_root: null
    runtime_home: null
    target: docs/plans/${slug}.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: null
  advisor:
    status: pending
    workspace_root: null
    runtime_home: null
    target: docs/plans/${slug}.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: null`
    : `review_required: false
pending-action: write docs/plans/${slug}.md`;
  return `---
slug: ${slug}
status: drafting
intent: ${intent}
${reviewState}
approach: <fill: the approach you intend to plan>
---

# Draft: ${slug}

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

## Open assumptions (announced defaults)
<!-- ${assumptionsNote} -->
<!-- assumption | adopted default | rationale | reversible? -->

## Findings (cited - path:lines)

## Decisions (with rationale)

## Scope IN

## Scope OUT (Must NOT have)

## Open questions

## Approval gate
status: drafting
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
`;
}

export function buildPlanSkeleton(slug, intent) {
  const decisionsLine =
    intent === "unclear"
      ? "**Decisions I made for you:** <fill last - the best-practice defaults you adopted; the user vetoes any here>"
      : "**Decisions to sanity-check:** <fill last - the few choices worth a human glance>";
  return `# ${slug} - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** <fill last - deliverables in human terms, 1-2 sentences>

**Why this approach:** <fill last - the one or two load-bearing decisions and why>

**What it will NOT do:** <fill last - 1-3 plain lines mirroring Must NOT have>

**Effort:** <Quick | Short | Medium | Large | XL>
**Risk:** <Low | Medium | High> - <one-line driver>
${decisionsLine}

Your next move: <fill - e.g. approve, or run a high-accuracy review>. Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope
### Must have
### Must NOT have (guardrails, anti-slop, scope boundaries)

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: <TDD | tests-after | none> + framework
- Evidence: docs/plans/evidence/task-<N>-${slug}.<ext>

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

### Plan blackboard (session memory)
> If \`docs/plans/notepads/${slug}/\` exists: before each delegation wave, read \`learnings.md\` and \`issues.md\` and fold inherited wisdom into the dispatched prompts (cap: those two files). If you implement todos directly rather than delegating, append your own discoveries to the notepads yourself.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit - never rewrite the headers above. -->
- [ ] 1. <title>
  What to do / Must NOT do: <...>
  Parallelization: Wave <N> | Blocked by: <...> | Blocks: <...>
  References (executor has NO interview context - be exhaustive): <src/path:lines>
  Acceptance criteria (agent-executable): <exact command or assertion>
  QA scenarios (name the exact tool + invocation): happy + failure, Evidence docs/plans/evidence/task-1-${slug}.<ext>
  Commit: <Y/N> | <type>(<scope>): <summary>

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
${FINAL_VERIFICATION_ITEMS.map((item) => `- [ ] ${item}`).join("\n")}

## Commit strategy

## Success criteria
`;
}

export async function scaffoldNotepads(cwd, slug) {
  const results = [];
  for (const fileName of NOTEPAD_FILES) {
    const relPath = join("docs", "plans", "notepads", slug, fileName);
    try {
      // Never pass reset/force: notepads are append-only memory. An existing
      // file (even hand-created) is kept as-is, mirroring upstream's `wx`.
      results.push(
        await writeGuarded(cwd, relPath, buildNotepadHeader(fileName, slug), {}),
      );
    } catch (err) {
      // A same-named non-artifact file blocks the slot; treat as already
      // present rather than failing the whole scaffold.
      if (
        err instanceof Error &&
        err.message.includes("exists and is not a plan artifact")
      ) {
        results.push({ relPath, status: "exists" });
        continue;
      }
      throw err;
    }
  }
  return results;
}

export async function writeGuarded(
  cwd,
  relPath,
  content,
  { reset = false, force = false } = {},
) {
  const target = resolveSafePlanPath(cwd, relPath);
  await assertSafeWriteParent(cwd, target);
  await assertSafeWriteTarget(target);
  const existing = await readFile(target, "utf8").catch(() => null);
  if (existing && existing.trim() !== "") {
    if (!reset) {
      if (isPlanArtifact(existing)) return { relPath, status: "exists" };
      throw new Error(
        `refused: ${relPath} exists and is not a plan artifact (pass --reset to overwrite)`,
      );
    }
    if (existing.trim() !== content.trim() && !force) {
      throw new Error(
        `refused: ${relPath} has edits that differ from a fresh skeleton; pass --reset --force to discard them`,
      );
    }
  }
  await writeFile(target, content, "utf8");
  return { relPath, status: existing ? "reset" : "created" };
}

export async function scaffold(
  cwd,
  {
    slug,
    intent,
    reset = false,
    force = false,
    draftOnly = false,
    reviewRequired = false,
  },
) {
  const draftRel = join("docs", "plans", "drafts", `${slug}.md`);
  const draft = await writeGuarded(
    cwd,
    draftRel,
    buildDraft(slug, intent, { reviewRequired }),
    { reset, force },
  );
  if (draftOnly) return [draft];
  const planRel = join("docs", "plans", `${slug}.md`);
  const plan = await writeGuarded(
    cwd,
    planRel,
    buildPlanSkeleton(slug, intent),
    { reset, force },
  );
  const notepads = await scaffoldNotepads(cwd, slug);
  return [draft, plan, ...notepads];
}

async function main() {
  const { slug, intent, reset, force, draftOnly, reviewRequired } = parseArgs(
    process.argv,
  );
  const results = await scaffold(process.cwd(), {
    slug,
    intent,
    reset,
    force,
    draftOnly,
    reviewRequired,
  });
  for (const r of results) process.stdout.write(`${r.status}: ${r.relPath}\n`);
  const created = results.some((r) => r.status !== "exists");
  process.stdout.write(
    draftOnly
      ? `next: record intent, findings, decisions, review state, and the approval gate in the draft; create the plan only after approval.\n`
      : created
        ? `next: record findings/decisions in the draft, then APPEND task batches into the "## Todos" region of the plan; fill "## TL;DR (For humans)" LAST.\n`
        : `skeleton already present - left untouched. APPEND task batches into the "## Todos" region; the human "## TL;DR (For humans)" stays on top.\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main().catch((err) => {
    process.stderr.write(
      `${err instanceof Error ? err.message : String(err)}\n`,
    );
    process.exit(1);
  });
}

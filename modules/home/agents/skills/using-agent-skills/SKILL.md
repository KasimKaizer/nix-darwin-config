---
name: using-agent-skills
description: "Discovers and invokes agent skills. Make sure to use this meta-skill whenever starting any engineering task, planning complex work, choosing workflows, fixing bugs, refactoring, building UI, or reviewing code. It governs how all specialized domain skills and lifecycle skills are discovered, composed, and executed across OpenCode, Cursor, Codex, Copilot, Antigravity, and Zed."
---

# Using Agent Skills

This copy is Addy Osmani's `using-agent-skills` (MIT) with a universal multi-agent overlay.
Upstream: https://github.com/addyosmani/agent-skills/tree/main/skills/using-agent-skills

Specialized domain and task skills:

- **System / Host / Dotfiles Configuration** → `nix-darwin-home-manager`
- **Authoring or editing an Agent Skill** → `skill-creator`
- **Python Exercism or CodeCrafters** → `exercism-codecrafters-python-mentor`
- **Visual UI, terminal TUI, and document verification** → `visual-qa`
- **Behavior-preserving cleanup of AI code smells (10 categories)** → `remove-ai-slops`

Active core and engineering lifecycle skills:

- **Polyglot strict types, modern stacks, and toolchains (Python, TS, Rust, Go)** → `programming`
- **Structural AST search & code rewrite** → `ast-grep`
- **About to claim done / passing / fixed** → `verification-before-completion`
- **UI design tokens, layouts, and components** → `frontend-ui-engineering`
- **Playwright browser QA & automation** → `browser-testing-with-devtools`
- **Performance profiling, latency, and memory** → `performance-optimization`
- **Office & Documents** → `pdf`, `docx`, `pptx`, `xlsx`
- **Engineering Lifecycle Suite** → `spec-driven-development`, `planning-and-task-breakdown`, `incremental-implementation`, `test-driven-development`, `source-driven-development`, `doubt-driven-development`, `api-and-interface-design`, `debugging-and-error-recovery`, `code-review-and-quality`, `security-and-hardening`, `git-workflow-and-versioning`, `ci-cd-and-automation`, `deprecation-and-migration`, `documentation-and-adrs`, `observability-and-instrumentation`

## Overview

Agent Skills is a collection of engineering workflow skills organized by development phase and task domain. Each skill encodes a specific process that senior engineers follow. This meta-skill helps you discover and apply the right skill for your current task across any agent environment (OpenCode, Cursor, Codex, Copilot, Antigravity, Zed) on macOS and Linux.

## Skill Discovery

When a task arrives, identify the domain or development phase and apply the corresponding skill:

```
Task arrives
    │
    ├── Domain-Specific Tasks
    │   ├── System / dotfiles / host configuration? ──→ nix-darwin-home-manager
    │   ├── Authoring or editing an Agent Skill? ─────→ skill-creator
    │   ├── Python Exercism / CodeCrafters? ──────────→ exercism-codecrafters-python-mentor
    │   ├── PDF / Word / PowerPoint / Excel? ─────────→ pdf / docx / pptx / xlsx
    │   ├── Structural AST code search / rewrite? ────→ ast-grep
    │   └── Cleaning AI code smells / de-slop? ───────→ remove-ai-slops
    │
    ├── Development Phase
    │   ├── Define & Scope (requirements, specs)? ────→ spec-driven-development
    │   ├── Plan & Decompose (break into tasks)? ─────→ planning-and-task-breakdown
    │   ├── Visual & UI Engineering (styling/UX)? ────→ frontend-ui-engineering + visual-qa
    │   ├── Implementing Code (polyglot/modern)? ─────→ programming + incremental-implementation
    │   │   ├── API & Interface boundaries? ──────────→ api-and-interface-design
    │   │   ├── Verifying framework documentation? ───→ source-driven-development
    │   │   └── High-stakes logic / state machines? ──→ doubt-driven-development
    │   ├── Writing & Running Tests (TDD)? ───────────→ test-driven-development
    │   ├── Investigating Bugs & Failures? ───────────→ debugging-and-error-recovery
    │   ├── Performance Profiling & Optimization? ────→ performance-optimization
    │   ├── Telemetry, Metrics, Tracing & Logging? ──→ observability-and-instrumentation
    │   ├── Browser Testing & Web Automation? ────────→ browser-testing-with-devtools + visual-qa
    │   ├── Reviewing Code & Quality Gates? ──────────→ code-review-and-quality + security-and-hardening
    │   ├── About to claim done / complete? ──────────→ verification-before-completion
    │   ├── Committing, Branching & Git ops? ─────────→ git-workflow-and-versioning
    │   ├── CI/CD & Pipeline Automation? ─────────────→ ci-cd-and-automation
    │   ├── Deprecating & Migrating Old Code? ────────→ deprecation-and-migration
    │   └── Writing ADRs & Documentation? ────────────→ documentation-and-adrs
```

## Universal Task Domain $\longleftrightarrow$ Skill Stack Reference

For complex tasks spanning multiple capabilities, combine complementary skills:

| Task Domain | Primary Skill Stack | Objective & Workflow |
| :--- | :--- | :--- |
| **Visual & UI Engineering** | `frontend-ui-engineering` + `visual-qa` + `browser-testing-with-devtools` | Token-driven design, responsive component layouts, Playwright browser driving, and dual-perspective visual/TUI pixel QA. |
| **Deep Autonomous Implementation** | `programming` + `test-driven-development` + `incremental-implementation` + `remove-ai-slops` | Red-green TDD discipline, strict type proofs, thin vertical slices, and behavior-preserving AI slop removal. |
| **Complex Logic & State Machines** | `doubt-driven-development` + `api-and-interface-design` + `remove-ai-slops` | Adversarial cross-examination of non-trivial invariants, stable interface contracts, and clean error types. |
| **Fast Mechanical Edits** | `verification-before-completion` + `remove-ai-slops` | Evidence-first verification, zero unverified success claims, and clean code deodorizing. |
| **Planning & Task Breakdown** | `spec-driven-development` + `planning-and-task-breakdown` | Requirement discovery, acceptance criteria, and verifiable task decomposition. |
| **Bug Fixing & Diagnostics** | `debugging-and-error-recovery` + `test-driven-development` + `source-driven-development` | Reproduce with failing test $\rightarrow$ localize root cause $\rightarrow$ verify with docs $\rightarrow$ minimal fix $\rightarrow$ regression guard. |
| **Production Hardening & Delivery** | `security-and-hardening` + `observability-and-instrumentation` + `ci-cd-and-automation` | OWASP defense-in-depth, consumer-leveled telemetry, and automated CI/CD deployment gates. |
| **Host & System Configuration** | `nix-darwin-home-manager` + `verification-before-completion` | Declarative system configuration, package placement, secret templates, and switch verification. |

---

## Core Operating Behaviors

These behaviors apply at all times, across all skills. They are non-negotiable.

### 1. Surface Assumptions

Before implementing anything non-trivial, explicitly state your assumptions:

```
ASSUMPTIONS I'M MAKING:
1. [assumption about requirements]
2. [assumption about architecture]
3. [assumption about scope]
→ Correct me now or I'll proceed with these.
```

Don't silently fill in ambiguous requirements. The most common failure mode is making wrong assumptions and running with them unchecked. Surface uncertainty early — it's cheaper than rework.

### 2. Manage Confusion Actively

When you encounter inconsistencies, conflicting requirements, or unclear specifications:

1. **STOP.** Do not proceed with a guess.
2. Name the specific confusion.
3. Present the tradeoff or ask the clarifying question.
4. Wait for resolution before continuing.

**Bad:** Silently picking one interpretation and hoping it's right.
**Good:** "I see X in the spec but Y in the existing code. Which takes precedence?"

### 3. Push Back When Warranted

You are not a yes-machine. When an approach has clear problems:

- Point out the issue directly
- Explain the concrete downside (quantify when possible — "this adds ~200ms latency" not "this might be slower")
- Propose an alternative
- Accept the human's decision if they override with full information

Sycophancy is a failure mode. "Of course!" followed by implementing a bad idea helps no one. Honest technical disagreement is more valuable than false agreement.

### 4. Enforce Simplicity

Your natural tendency is to overcomplicate. Actively resist it.

Before finishing any implementation, ask:

- Can this be done in fewer lines?
- Are these abstractions earning their complexity?
- Would a staff engineer look at this and say "why didn't you just..."?

If you build 1000 lines and 100 would suffice, you have failed. Prefer the boring, obvious solution. Cleverness is expensive.

### 5. Maintain Scope Discipline

Touch only what you're asked to touch.

Do NOT:

- Remove comments you don't understand
- "Clean up" code orthogonal to the task
- Refactor adjacent systems as a side effect
- Delete code that seems unused without explicit approval
- Add features not in the spec because they "seem useful"

Your job is surgical precision, not unsolicited renovation.

### 6. Verify, Don't Assume

Every skill includes a verification step. A task is not complete until verification passes. "Seems right" is never sufficient — there must be evidence (passing tests, build output, runtime data).

Per-skill verification is the local check. The project-wide bar that applies to _every_ change, regardless of which skill is active, is the Definition of Done: tests pass, no regressions, behavior verified at runtime, docs updated. See `references/definition-of-done.md`. It complements each task's acceptance criteria rather than replacing them.

---

## Failure Modes to Avoid

1. Making wrong assumptions without checking
2. Not managing your own confusion — plowing ahead when lost
3. Not surfacing inconsistencies you notice
4. Not presenting tradeoffs on non-obvious decisions
5. Being sycophantic ("Of course!") to approaches with clear problems
6. Overcomplicating code and APIs
7. Modifying code or comments orthogonal to the task
8. Removing things you don't fully understand
9. Building without a spec because "it's obvious"
10. Skipping verification because "it looks right"

---

## Skill Rules

1. **Check for an applicable skill before starting work.** Skills encode processes that prevent common mistakes.
2. **Skills are workflows, not suggestions.** Follow the steps in order. Don't skip verification steps.
3. **Multiple skills can apply.** A feature implementation might involve `spec-driven-development` → `planning-and-task-breakdown` → `programming` → `incremental-implementation` → `test-driven-development` → `code-review-and-quality` → `remove-ai-slops` in sequence.
4. **When in doubt, start with a plan or spec.** If the task is non-trivial and there's no spec, begin with `spec-driven-development`.

---

## Lifecycle Sequence

For a complete feature, the typical skill sequence is:

```
1.  spec-driven-development     → Define what we're building
2.  planning-and-task-breakdown → Decompose into atomic task batches
3.  api-and-interface-design    → Design stable interface contracts and boundary parsing
4.  source-driven-development   → Verify against official documentation
5.  programming                 → Apply strict polyglot types and toolchain
6.  incremental-implementation  → Build slice by slice
7.  doubt-driven-development    → Cross-examine non-trivial decisions in-flight
8.  test-driven-development     → Red-green TDD proof for each slice
9.  frontend-ui-engineering     → UI components, design tokens (if visual)
10. visual-qa                   → Dual-perspective visual and TUI verification (if UI)
11. performance-optimization    → Benchmark and eliminate bottlenecks
12. observability-and-instrumentation → Add structured logging, metrics, and tracing
13. remove-ai-slops             → Strip AI code smells while locking behavior
14. code-review-and-quality     → Multi-axis review before merge
15. security-and-hardening      → Security audit and input boundary hardening
16. verification-before-completion → Evidence check before completion claims
17. git-workflow-and-versioning → Atomic commits, clean history
18. documentation-and-adrs      → Document decisions and architecture
19. ci-cd-and-automation        → Automated quality gates on every change
20. deprecation-and-migration   → Retire old systems safely when needed
```

---

## Quick Reference

### Engineering Lifecycle Skills

| Phase | Skill | One-Line Summary |
| :--- | :--- | :--- |
| **Scope** | `spec-driven-development` | Requirements, contracts, and acceptance criteria before code |
| **Plan** | `planning-and-task-breakdown` | Decompose work into small, verifiable, atomic tasks |
| **API** | `api-and-interface-design` | Stable interfaces with clear contracts and parse-don't-validate |
| **Code** | `programming` | Strict types, modern stacks, and canonical toolchains (Python, TS, Rust, Go) |
| **Build** | `incremental-implementation` | Thin vertical slices, test each before expanding |
| **Docs** | `source-driven-development` | Verify against official documentation before implementing |
| **Logic** | `doubt-driven-development` | Adversarial fresh-context review of every non-trivial decision |
| **UI** | `frontend-ui-engineering` | Design tokens, layouts, and component primitives |
| **Browser** | `browser-testing-with-devtools` | Playwright browser QA, DOM inspection, and console verification |
| **Visual** | `visual-qa` | Dual-perspective visual, TUI, and document verification with pixel diffs |
| **De-slop** | `remove-ai-slops` | Behavior-preserving cleanup of AI code bloat and smells (10 categories) |
| **TDD** | `test-driven-development` | Failing test first (Given/When/Then), then make it pass |
| **Debug** | `debugging-and-error-recovery` | Reproduce $\rightarrow$ localize $\rightarrow$ fix $\rightarrow$ regression guard |
| **Perf** | `performance-optimization` | Profile bottlenecks, latency, and resource utilization |
| **Observe** | `observability-and-instrumentation` | Log, metric, trace, and instrument production paths |
| **Review** | `code-review-and-quality` | Multi-axis review with quality gates before merge |
| **Security** | `security-and-hardening` | OWASP prevention, input parsing at boundaries, least privilege |
| **Done** | `verification-before-completion` | Require real tool evidence before making any completion claim |
| **Git** | `git-workflow-and-versioning` | Atomic commits, clean history, semver, and release logs |
| **CI** | `ci-cd-and-automation` | Automated quality gates on every change |
| **Docs** | `documentation-and-adrs` | Document the why, not just the what |
| **Sunset** | `deprecation-and-migration` | Remove old systems and migrate users safely |

### Specialized & Domain Skills

| Domain | Skill | One-Line Summary |
| :--- | :--- | :--- |
| **AST** | `ast-grep` | Structural AST search, linting, and rewrite rules |
| **Office** | `pdf` / `docx` / `pptx` / `xlsx` | Parse, author, and manipulate office document and spreadsheet formats |
| **System** | `nix-darwin-home-manager` | Declarative macOS, Homebrew, dotfiles, and system configuration |
| **Meta** | `skill-creator` | Author, iterate, benchmark, and optimize Agent Skills |
| **Practice** | `exercism-codecrafters-python-mentor` | Socratic mentor for Python exercises and challenges |

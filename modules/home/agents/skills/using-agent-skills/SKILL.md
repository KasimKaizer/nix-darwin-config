---
name: using-agent-skills
description: Discovers and invokes agent skills. Use when starting a session or when you need to discover which skill applies to the current task. This is the meta-skill that governs how the Addy Osmani engineering skills are discovered and invoked. Flake-local skills (nix-darwin-home-manager, skill-creator, exercism-codecrafters-python-mentor) take precedence when they apply. Third-party skills are allowlisted in modules/home/agents/skills.nix and deployed to every configured agent on nixswitch.
---

# Using Agent Skills

This copy is Addy Osmani's `using-agent-skills` (MIT) with a local overlay.
Upstream: https://github.com/addyosmani/agent-skills/tree/main/skills/using-agent-skills

Flake-local skills take precedence when they apply:

- **nix-darwin / home-manager / this flake** → `nix-darwin-home-manager`
- **Authoring or editing an Agent Skill** → `skill-creator`
- **Python Exercism or CodeCrafters** → `exercism-codecrafters-python-mentor`

Pinned third-party skills (flake inputs, allowlisted in `modules/home/agents/skills.nix`):

- **About to claim done / passing / fixed** → `verification-before-completion`
- **PDF files** → `pdf`
- **Word documents (.docx / .dotx)** → `docx`
- **PowerPoint (.pptx)** → `pptx`

Not installed (move the name into `enable` in `modules/home/agents/skills.nix` to get them back): `interview-me`, `frontend-ui-engineering`, `browser-testing-with-devtools`, `performance-optimization`, `observability-and-instrumentation`, `shipping-and-launch`. `creating-pr` and `writing-commit-messages` also need a pinned source before they can be enabled. Do not invent those workflows from memory; if the user needs one, enable it first.

## Overview

Agent Skills is a collection of engineering workflow skills organized by development phase. Each skill encodes a specific process that senior engineers follow. This meta-skill helps you discover and apply the right skill for your current task.

## Skill Discovery

When a task arrives, identify the development phase and apply the corresponding skill:

```
Task arrives
    │
    ├── nix-darwin / Homebrew / this flake? ─→ nix-darwin-home-manager
    ├── Authoring or editing a skill? ──────→ skill-creator
    ├── Python Exercism / CodeCrafters? ────→ exercism-codecrafters-python-mentor
    ├── PDF files? ─────────────────────────→ pdf
    ├── Word / .docx / .dotx? ───────────────→ docx
    ├── PowerPoint / .pptx? ────────────────→ pptx
    ├── About to claim done? ───────────────→ verification-before-completion
    ├── Have a rough concept, need variants? → idea-refine
    ├── New project/feature/change? ──→ spec-driven-development
    ├── Have a spec, need tasks? ──────→ planning-and-task-breakdown
    ├── Implementing code? ────────────→ incremental-implementation
    │   ├── API work? ────────────────→ api-and-interface-design
    │   ├── Need better context? ─────→ context-engineering
    │   ├── Need doc-verified code? ───→ source-driven-development
    │   └── Stakes high / unfamiliar code? ──→ doubt-driven-development
    ├── Writing/running tests? ────────→ test-driven-development
    ├── Something broke? ──────────────→ debugging-and-error-recovery
    ├── Reviewing code? ──────────────→ code-review-and-quality
    │   ├── Too complex? ─────────────→ code-simplification
    │   └── Security concerns? ───────→ security-and-hardening
    ├── Committing/branching? ─────────→ git-workflow-and-versioning
    ├── CI/CD pipeline work? ──────────→ ci-cd-and-automation
    ├── Deprecating/migrating? ────────→ deprecation-and-migration
    └── Writing docs/ADRs? ───────────→ documentation-and-adrs
```

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

## Failure Modes to Avoid

These are the subtle errors that look like productivity but create problems:

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

## Skill Rules

1. **Check for an applicable skill before starting work.** Skills encode processes that prevent common mistakes.

2. **Skills are workflows, not suggestions.** Follow the steps in order. Don't skip verification steps.

3. **Multiple skills can apply.** A feature implementation might involve `idea-refine` → `spec-driven-development` → `planning-and-task-breakdown` → `incremental-implementation` → `test-driven-development` → `code-review-and-quality` → `code-simplification` in sequence.

4. **When in doubt, start with a spec.** If the task is non-trivial and there's no spec, begin with `spec-driven-development`.

## Lifecycle Sequence

For a complete feature, the typical skill sequence is:

```
1.  idea-refine                 → Refine vague ideas
2.  spec-driven-development     → Define what we're building
3.  planning-and-task-breakdown → Break into verifiable chunks
4.  context-engineering         → Load the right context
5.  source-driven-development   → Verify against official docs
6.  incremental-implementation  → Build slice by slice
7.  doubt-driven-development    → Cross-examine non-trivial decisions in-flight
8.  test-driven-development     → Prove each slice works
9.  code-review-and-quality     → Review before merge
10. code-simplification         → Reduce unnecessary complexity while preserving behavior
11. git-workflow-and-versioning → Clean commit history
12. documentation-and-adrs      → Document decisions
13. deprecation-and-migration   → Retire old systems and move users safely when needed
```

Not every task needs every skill. A bug fix might only need: `debugging-and-error-recovery` → `test-driven-development` → `code-review-and-quality`.

## Quick Reference

| Phase  | Skill                       | One-Line Summary                                                |
| ------ | --------------------------- | --------------------------------------------------------------- |
| Define | idea-refine                 | Refine ideas through structured divergent and convergent thinking |
| Define | spec-driven-development     | Requirements and acceptance criteria before code                |
| Plan   | planning-and-task-breakdown | Decompose into small, verifiable tasks                          |
| Build  | incremental-implementation  | Thin vertical slices, test each before expanding                |
| Build  | source-driven-development   | Verify against official docs before implementing                |
| Build  | doubt-driven-development    | Adversarial fresh-context review of every non-trivial decision  |
| Build  | context-engineering         | Right context at the right time                                 |
| Build  | api-and-interface-design    | Stable interfaces with clear contracts                          |
| Verify | test-driven-development     | Failing test first, then make it pass                           |
| Verify | debugging-and-error-recovery| Reproduce → localize → fix → guard                              |
| Review | code-review-and-quality     | Five-axis review with quality gates                             |
| Review | code-simplification         | Preserve behavior while reducing unnecessary complexity         |
| Review | security-and-hardening      | OWASP prevention, input validation, least privilege             |
| Ship   | git-workflow-and-versioning | Atomic commits, clean history                                   |
| Ship   | ci-cd-and-automation        | Automated quality gates on every change                         |
| Ship   | deprecation-and-migration   | Remove old systems and migrate users safely                     |
| Ship   | documentation-and-adrs      | Document the why, not just the what                             |

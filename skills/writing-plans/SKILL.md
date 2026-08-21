---
name: writing-plans
description: Use when you have a spec or requirements for a multi-step task, before touching code. Write a bite-sized implementation plan with files, tests, and verification for each task.
---

# Writing Plans

Copyright (c) 2025 Jesse Vincent. MIT License. From [obra/superpowers](https://github.com/obra/superpowers). Adapted: no Superpowers plugin required.

## Overview

Write an implementation plan assuming the engineer has little context for this codebase. Document which files to touch, how to test, and how to verify. DRY. YAGNI. TDD. Frequent commits.

**Announce at start:** "I'm using the writing-plans skill to create the implementation plan."

**Save plans to** a path the user names, otherwise `docs/plans/YYYY-MM-DD-<feature-name>.md`.

## Scope Check

If the spec covers multiple independent subsystems, suggest separate plans — one per subsystem. Each plan should produce working, testable software on its own.

## File Structure

Before defining tasks, map which files will be created or modified and what each is responsible for.

- Prefer smaller, focused files over large ones that do too much.
- Files that change together should live together. Split by responsibility, not by technical layer.
- In existing codebases, follow established patterns.

## Task Right-Sizing

A task is the smallest unit that carries its own test cycle. Fold setup and docs into the task whose deliverable needs them. Split only where a reviewer could reject one task while approving its neighbor.

**Each step is one action (2–5 minutes):** write the failing test, run it, implement the minimum, run tests, commit.

## Plan Document Header

Every plan MUST start with this header:

```markdown
# [Feature Name] Implementation Plan

**Goal:** [One sentence]

**Architecture:** [2-3 sentences]

**Tech stack:** [Key technologies]

**Spec:** [path to the spec this plan implements]

## Global constraints

[Version floors, naming, platform requirements — exact values from the spec.]
```

## Task Structure

````markdown
### Task N: [Component Name]

**Files:**
- Create: `exact/path/to/file.py`
- Modify: `exact/path/to/existing.py`
- Test: `tests/exact/path/to/test.py`

**Interfaces:**
- Consumes: [signatures from earlier tasks]
- Produces: [names and types later tasks rely on]

- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Run it and confirm it fails**
- [ ] **Step 3: Write minimal implementation**
- [ ] **Step 4: Run tests and confirm they pass**
- [ ] **Step 5: Commit**
````

Code steps must include the actual test or implementation, not "add tests later".

## No Placeholders

Never write: TBD, TODO, "implement later", "add appropriate error handling", "similar to Task N", or steps that describe what without showing how.

## Self-Review

1. Every spec requirement maps to a task.
2. No placeholder language.
3. Names and types in later tasks match earlier tasks.

After saving the plan, ask whether to execute it in this session or stop so the user can review first.

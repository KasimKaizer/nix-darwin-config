---
name: systematic-debugging
description: Use when encountering any bug, test failure, or unexpected behavior, before proposing fixes. Find root cause first; do not guess at patches.
---

# Systematic Debugging

Copyright (c) 2025 Jesse Vincent. MIT License. From [obra/superpowers](https://github.com/obra/superpowers). Adapted to be self-contained.

## Overview

**Core principle:** ALWAYS find root cause before attempting fixes. Symptom fixes are failure.

## The Iron Law

```
NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST
```

If you haven't completed Phase 1, you cannot propose fixes.

## When to Use

Use for ANY technical issue: test failures, unexpected behavior, performance problems, build failures, integration issues.

Use this especially when under time pressure, when a "quick fix" seems obvious, when previous fixes failed, or when you don't fully understand the issue.

## The Four Phases

Complete each phase before proceeding to the next.

### Phase 1: Root Cause Investigation

**BEFORE attempting ANY fix:**

1. **Read error messages carefully** — stack traces, line numbers, file paths, error codes. Don't skip warnings.
2. **Reproduce consistently** — exact steps. If not reproducible, gather more data; don't guess.
3. **Check recent changes** — git diff, recent commits, new dependencies, config, environment.
4. **Gather evidence at component boundaries** — log what enters and exits each layer, then identify WHERE it breaks.
5. **Trace data flow** — where does the bad value originate? Walk callers until you find the source. Fix at the source, not the symptom.

### Phase 2: Pattern Analysis

1. Find similar working code in the same codebase.
2. Compare against a complete reference implementation if you are following a pattern.
3. List every difference between working and broken. Don't assume "that can't matter".
4. Understand dependencies, config, environment, and assumptions.

### Phase 3: Hypothesis and Testing

1. Form a **single** hypothesis: "I think X is the root cause because Y."
2. Make the smallest possible change to test it. One variable at a time.
3. If it worked → Phase 4. If not → new hypothesis. Don't stack extra fixes.
4. If you don't know, say so. Don't pretend.

### Phase 4: Implementation

1. Create a failing test or the simplest reproduction **before** the fix.
2. Implement **one** change that addresses the root cause. No bundled refactoring.
3. Verify the original symptom is gone and nothing else broke. Use `verification-before-completion` before claiming success.
4. If the fix doesn't work: STOP. Count attempts. If < 3, return to Phase 1. If ≥ 3, question the architecture with the user before trying again.

## Red Flags - STOP and Return to Phase 1

- "Quick fix for now, investigate later"
- "Just try changing X and see"
- Adding multiple changes then running tests
- "It's probably X"
- Proposing a list of fixes without investigation
- "One more try" after two failures already

## Quick Reference

| Phase | Success criteria |
|-------|------------------|
| 1. Root cause | Understand WHAT and WHY |
| 2. Pattern | Identify differences vs working code |
| 3. Hypothesis | Confirmed or new hypothesis |
| 4. Implementation | Bug resolved, tests pass |

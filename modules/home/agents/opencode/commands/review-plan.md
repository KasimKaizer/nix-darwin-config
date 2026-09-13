---
description: Run independent plan reviews and summarize only actionable blockers.
agent: planner
---

Before reviewing, call the `skill` tool with `name: "work-plan"` and follow its
high-accuracy review workflow exactly. This command is an explicit request for that
workflow's dual review of the supplied plan: dispatch the configured `reviewer` and
independent `advisor` in parallel, wait for both results, apply only evidence-backed
eligible blockers, and use the skill's bounded convergence process. Do not replace that
process with an ad-hoc review or create a new planning workflow. Do not edit product
code.

Review this plan using that workflow: $ARGUMENTS

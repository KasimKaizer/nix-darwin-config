import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildNotepadHeader,
  buildPlanSkeleton,
  NOTEPAD_FILES,
  scaffold,
  scaffoldNotepads,
} from "./scaffold-plan.mjs";

function freshWorkspace() {
  const cwd = mkdtempSync(join(tmpdir(), "scaffold-notepad-test-"));
  mkdirSync(join(cwd, "docs", "plans"), { recursive: true });
  return cwd;
}

describe("notepad scaffold", () => {
  it("creates all four notepad files with upstream-format headers", async () => {
    const cwd = freshWorkspace();
    try {
      const results = await scaffoldNotepads(cwd, "demo-plan");
      assert.equal(results.length, 4);
      for (const fileName of NOTEPAD_FILES) {
        const hit = results.find((r) => r.relPath.endsWith(fileName));
        assert.ok(hit, `missing result for ${fileName}`);
        assert.equal(hit.status, "created");
        const content = readFileSync(join(cwd, hit.relPath), "utf8");
        assert.ok(content.startsWith("# "));
        assert.ok(content.includes("demo-plan"));
        assert.ok(content.includes("Append new entries below - never overwrite."));
        assert.ok(content.endsWith("---\n"));
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("is resume-safe: second run preserves appended entries", async () => {
    const cwd = freshWorkspace();
    try {
      await scaffoldNotepads(cwd, "demo-plan");
      const target = join(cwd, "docs", "plans", "notepads", "demo-plan", "learnings.md");
      writeFileSync(target, readFileSync(target, "utf8") + "\n- Learned: X\n", "utf8");
      const rerun = await scaffoldNotepads(cwd, "demo-plan");
      assert.ok(rerun.every((r) => r.status === "exists"));
      assert.ok(readFileSync(target, "utf8").includes("- Learned: X"));
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("header builder matches upstream label/purpose/footer shape", () => {
    const header = buildNotepadHeader("issues.md", "demo-plan");
    assert.ok(header.startsWith("# Issues — demo-plan\n\n"));
    assert.ok(header.includes("Problems and gotchas"));
    assert.ok(header.includes("_Auto-scaffolded by work-plan."));
  });

  it("plan skeleton carries the pre-dispatch blackboard rule", () => {
    const skeleton = buildPlanSkeleton("demo-plan", "clear");
    assert.ok(skeleton.includes("### Plan blackboard (session memory)"));
    assert.ok(skeleton.includes("docs/plans/notepads/demo-plan/"));
    assert.ok(skeleton.includes("before each delegation wave"));
    assert.ok(
      skeleton.includes("If you implement todos directly rather than delegating"),
    );
  });

  it("full scaffold includes notepads only on the plan-creating run", async () => {
    const cwd = freshWorkspace();
    try {
      const draftOnly = await scaffold(cwd, { slug: "demo-plan", intent: "clear", draftOnly: true });
      assert.ok(draftOnly.every((r) => !r.relPath.includes("notepads")));

      const full = await scaffold(cwd, { slug: "demo-plan", intent: "clear" });
      const notepadResults = full.filter((r) => r.relPath.includes("notepads"));
      assert.equal(notepadResults.length, 4);
      assert.ok(
        notepadResults.every((r) => r.status === "created" || r.status === "exists"),
      );
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

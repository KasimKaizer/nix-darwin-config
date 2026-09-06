import { describe, expect, it } from "bun:test";
import {
  createTodoDescriptionOverrideHook,
  TODOWRITE_DESCRIPTION,
} from "./definitions.js";

describe("C1 todo-description-override (definitions.js)", () => {
  it("exports createTodoDescriptionOverrideHook returning only tool.definition handler", () => {
    const hook = createTodoDescriptionOverrideHook();
    expect(hook).toBeDefined();
    expect(typeof hook["tool.definition"]).toBe("function");
    expect(Object.keys(hook)).toEqual(["tool.definition"]);
  });

  it("replaces output.description with TODOWRITE_DESCRIPTION when toolID is todowrite", async () => {
    const hook = createTodoDescriptionOverrideHook();
    const input = { toolID: "todowrite" };
    const output = {
      description: "Original description",
      parameters: { type: "object", properties: {} },
    };

    await hook["tool.definition"](input, output);

    expect(output.description).toBe(TODOWRITE_DESCRIPTION);
    // parameters must remain untouched
    expect(output.parameters).toEqual({ type: "object", properties: {} });
  });

  it("leaves output untouched when toolID is not todowrite", async () => {
    const hook = createTodoDescriptionOverrideHook();
    const input = { toolID: "bash" };
    const output = {
      description: "Execute bash command",
      parameters: { type: "object" },
    };

    await hook["tool.definition"](input, output);

    expect(output.description).toBe("Execute bash command");
    expect(output.parameters).toEqual({ type: "object" });
  });

  it("handles non-matching toolIDs like read or edit without altering description", async () => {
    const hook = createTodoDescriptionOverrideHook();
    const input = { toolID: "read" };
    const output = {
      description: "Read file contents",
    };

    await hook["tool.definition"](input, output);

    expect(output.description).toBe("Read file contents");
  });

  it("handles null/undefined input and output gracefully", async () => {
    const hook = createTodoDescriptionOverrideHook();
    await expect(hook["tool.definition"](null, null)).resolves.toBeUndefined();
    await expect(hook["tool.definition"]({ toolID: "todowrite" }, null)).resolves.toBeUndefined();
  });

  it("exports TODOWRITE_DESCRIPTION meeting all requirements", () => {
    expect(TODOWRITE_DESCRIPTION).toBeDefined();
    expect(typeof TODOWRITE_DESCRIPTION).toBe("string");

    // Atomic 1-3 tool calls
    expect(TODOWRITE_DESCRIPTION).toContain("atomic action completable in 1-3 tool calls");

    // String-only priority: high|medium|low
    expect(TODOWRITE_DESCRIPTION).toContain("`priority`: string, one of `high`, `medium`, `low`");
    expect(TODOWRITE_DESCRIPTION).toContain("Never send numeric priorities");

    // Title formula [WHERE] [HOW] to [WHY] - expect [RESULT]
    expect(TODOWRITE_DESCRIPTION).toContain('Format: "[WHERE] [HOW] to [WHY] - expect [RESULT]"');

    // No OMO agent names
    const omoNames = [
      "sisyphus",
      "atlas",
      "prometheus",
      "hephaestus",
      "oracle",
      "call_omo_agent",
      "explore-as-omo",
    ];
    for (const name of omoNames) {
      expect(TODOWRITE_DESCRIPTION.toLowerCase()).not.toContain(name);
    }
  });
});

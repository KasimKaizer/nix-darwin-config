import { describe, expect, it } from "bun:test";
import plugin from "./index.js";

describe("opencode-hooks plugin assembly (12 hooks)", () => {
  const mockCtx = {
    directory: "/tmp/hooks-test-assembly",
    client: {
      tui: {
        showToast: async (opts) => {},
      },
    },
  };

  it("boots the plugin and exposes all expected handlers", async () => {
    const hooks = await plugin.server(mockCtx, {});
    expect(hooks["tool.execute.before"]).toBeFunction();
    expect(hooks["tool.execute.after"]).toBeFunction();
    expect(hooks["chat.message"]).toBeFunction();
    expect(hooks["experimental.session.compacting"]).toBeFunction();
    expect(hooks.event).toBeFunction();
  });
});

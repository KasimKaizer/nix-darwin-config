import { describe, expect, it } from "bun:test";
import plugin, { EMPTY_RESPONSE_WARNING, FILE_READ_WARNING, NOTEPAD_DIRECTIVE, NOTEPAD_READ_REMINDER, RETRY_GUIDANCE_MARKER, TODOWRITE_DESCRIPTION } from "./index.js";

// Contracts: v2.2.5 packages/plugin/src/promise/{plugin,tool,session}.ts,
// packages/schema/src/{event,session-event}.ts and core/src/tool/plugin/subagent.ts.
async function boot() {
  const callbacks = new Map();
  const stored = new Map();
  let send;
  let onDelete;
  const deleted = new Promise((resolve) => { onDelete = resolve; });
  const ctx = {
    location: { directory: import.meta.dir },
    tool: { hook: async (name, callback) => callbacks.set(`tool.${name}`, callback) },
    session: { hook: async (name, callback) => callbacks.set(`session.${name}`, callback) },
    storage: {
      get: async (key) => stored.get(key),
      set: async (key, value) => {
        stored.set(key, value);
        if (Array.isArray(value) && value.length === 0) onDelete();
      },
    },
    event: { subscribe: ({ signal }) => new ReadableStream({
      start(controller) {
        send = (event) => controller.enqueue(event);
        signal.addEventListener("abort", () => controller.close(), { once: true });
      },
    }) },
  };
  const cleanup = await plugin.setup(ctx);
  return { callbacks, ctx, cleanup, send: (event) => send(event), deleted };
}

const call = (tool, input, overrides = {}) => ({
  tool, input, sessionID: "ses_native", agent: "builder", messageID: "msg_native", id: "call_native", ...overrides,
});
const context = (overrides = {}) => ({
  sessionID: "ses_native", agent: "builder", system: [], messages: [], tools: {}, ...overrides,
});

describe("OpenCode v2.2.5 native contract", () => {
  it("rejects invalid native subagent calls before execution", async () => {
    const { callbacks, cleanup } = await boot();
    try {
      await expect(callbacks.get("tool.execute.before")(call("subagent", {
        agent: "builder", description: "Invalid primary delegation", prompt: "Do work",
      }))).rejects.toThrow(RETRY_GUIDANCE_MARKER);
    } finally { await cleanup(); }
  });

  it("gives native retry syntax when delegation is rejected", async () => {
    const { callbacks, cleanup } = await boot();
    try {
      await expect(callbacks.get("tool.execute.before")(call("subagent", {
        agent: "unknown-agent", description: "Invalid target", prompt: "Do work",
      }))).rejects.toThrow('subagent(\n  agent="worker-quick"');
    } finally { await cleanup(); }
  });

  it.each([
    ["docs/plans/notepads/plan/learnings.md", "append-only"],
    ["package.json", "File already exists"],
  ])("enforces native write guards for %s", async (path, error) => {
    const { callbacks, cleanup } = await boot();
    try {
      await expect(callbacks.get("tool.execute.before")(call("write", { path, content: "overwrite" }))).rejects.toThrow(error);
    } finally { await cleanup(); }
  });

  it("mutates native worker prompts and honors the tool event's caller agent", async () => {
    const { callbacks, cleanup } = await boot();
    const before = callbacks.get("tool.execute.before");
    const worker = call("subagent", { agent: "worker-deep", description: "Implement", prompt: "Do work" });
    const explorer = call("subagent", { agent: "worker-deep", description: "Explore", prompt: "Find code" }, { agent: "explorer" });
    try {
      await before(worker);
      await before(explorer);
      expect(worker.input.prompt).toBe(`${NOTEPAD_DIRECTIVE}\nDo work`);
      expect(explorer.input.prompt).toBe("Find code");
    } finally { await cleanup(); }
  });

  it("overrides the native todo description without changing tool schemas or unrelated tools", async () => {
    const { callbacks, cleanup } = await boot();
    const schema = { type: "object", properties: { todos: { type: "array" } } };
    const todo = { description: "Original todo description", input: schema };
    const read = { description: "Read a file", input: {} };
    try {
      await callbacks.get("session.context")(context({ tools: { todowrite: todo, read } }));
      expect(todo.description).toBe(TODOWRITE_DESCRIPTION);
      expect(todo.input).toBe(schema);
      expect(read.description).toBe("Read a file");
    } finally { await cleanup(); }
  });

  it("preserves structured results and attachments while annotating native shell text", async () => {
    const { callbacks, cleanup } = await boot();
    const file = { type: "file", uri: "data:image/png;base64,AA==", mime: "image/png" };
    const structured = { exit: 0, output: "file contents", truncated: false };
    const event = { ...call("shell", { command: "cat file.txt" }), status: "completed",
      result: { output: structured, content: [{ type: "text", text: "file contents" }, file] } };
    try {
      await callbacks.get("tool.execute.after")(event);
      expect(event.result.output).toBe(structured);
      expect(event.result.content).toContain(file);
      expect(event.result.content.find((part) => part.type === "text").text).toContain(FILE_READ_WARNING);
    } finally { await cleanup(); }
  });

  it("lets native edit matching decide whether a non-exact match is valid", async () => {
    const { callbacks, cleanup } = await boot();
    try {
      await expect(callbacks.get("tool.execute.before")(call("edit", {
        path: "package.json", oldString: '  "name": "opencode-hooks",  ', newString: '  "name": "renamed",',
      }))).resolves.toBeUndefined();
    } finally { await cleanup(); }
  });

  it.each([
    "Could not find oldString in the file",
    "Found 2 matches for oldString, but expected exactly one.",
  ])("annotates native edit errors without changing their failure status: %s", async (message) => {
    const { callbacks, cleanup } = await boot();
    const event = { ...call("edit", {}), status: "error", error: { message } };
    try {
      await callbacks.get("tool.execute.after")(event);
      expect(event.status).toBe("error");
      expect(event.error.message).toContain(message);
      expect(event.error.message).toContain("[EDIT ERROR - IMMEDIATE ACTION REQUIRED]");
    } finally { await cleanup(); }
  });

  it("emits a resume call accepted by the native subagent guard", async () => {
    const { callbacks, cleanup } = await boot();
    const event = { ...call("subagent", { agent: "worker-deep", description: "Implement", prompt: "Work" }),
      status: "completed", result: { output: { sessionID: "ses_child", status: "completed", output: "Done" },
        metadata: { sessionID: "ses_child", status: "completed" }, content: [{ type: "text", text: "Done" }] } };
    try {
      await callbacks.get("tool.execute.after")(event);
      const text = event.result.content.find((part) => part.type === "text").text;
      const payload = JSON.parse(text.split("\nto continue: subagent(")[1].split(")\n")[0]);
      expect(payload.sessionID).toBe("ses_child");
      expect(payload.agent).toBe("worker-deep");
      await expect(callbacks.get("tool.execute.before")(call("subagent", payload))).resolves.toBeUndefined();
    } finally { await cleanup(); }
  });

  it("warns on native no-text completion without claiming a notepad was written", async () => {
    const { callbacks, cleanup } = await boot();
    const wrapper = '<subagent sessionID="ses_child" state="completed">\nSubagent completed without a text response.\n</subagent>';
    const event = { ...call("subagent", { agent: "worker-deep", description: "Implement", prompt: "Work" }),
      status: "completed", result: { output: { sessionID: "ses_child", status: "completed" },
        metadata: { sessionID: "ses_child", status: "completed" }, content: [{ type: "text", text: wrapper }] } };
    try {
      await callbacks.get("tool.execute.after")(event);
      const text = event.result.content.find((part) => part.type === "text").text;
      expect(text).toContain(wrapper);
      expect(text).toContain(EMPTY_RESPONSE_WARNING);
      expect(text).not.toContain(NOTEPAD_READ_REMINDER);
      expect(text).toContain('"sessionID":"ses_child"');
    } finally { await cleanup(); }
  });

  it("does not report a running native subagent as completed", async () => {
    const { callbacks, cleanup } = await boot();
    const content = [{ type: "text", text: "Subagent is running in the background" }];
    const event = { ...call("subagent", { agent: "worker-deep", description: "Implement", prompt: "Work" }),
      status: "completed", result: { content, metadata: { sessionID: "ses_child", status: "running" } } };
    try {
      await callbacks.get("tool.execute.after")(event);
      expect(event.result.content).toBe(content);
    } finally { await cleanup(); }
  });

  it("injects category reminders into native LLM content, not legacy parts", async () => {
    const { callbacks, cleanup } = await boot();
    const after = callbacks.get("tool.execute.after");
    const event = context({ messages: [{ id: "msg_user", role: "user", content: [{ type: "text", text: "Implement" }] }] });
    try {
      for (let n = 0; n < 3; n++) await after({ ...call("shell", { command: "true" }), status: "completed", result: { content: "OK" } });
      await callbacks.get("session.context")(event);
      expect(event.messages[0].content.some((part) => part.type === "text" && part.text.includes("[Category+Skill Reminder]"))).toBe(true);
      expect(event.messages[0].content.at(-1).text).toBe("Implement");
    } finally { await cleanup(); }
  });

  it("does not duplicate research reminders already present in native tool results", async () => {
    const { callbacks, cleanup } = await boot();
    const messages = [];
    try {
      for (const [index, name] of ["context7_query_docs", "exa_web_search_exa", "grep_app_searchGitHub"].entries()) {
        const event = { ...call(name, {}), status: "completed", result: { content: [{ type: "text", text: "Research result" }] } };
        await callbacks.get("tool.execute.after")(event);
        messages.push({ id: `msg-${index}`, role: "assistant", content: [
          { type: "tool-call", id: `call-${index}`, name, input: {} },
          { type: "tool-result", id: `call-${index}`, name, result: { type: "content", value: event.result.content } },
        ] });
      }
      const before = JSON.stringify(messages);
      await callbacks.get("session.context")(context({ messages }));
      expect(JSON.stringify(messages)).toBe(before);
    } finally { await cleanup(); }
  });

  it("keeps the last successful todos when a later native update fails", async () => {
    const { callbacks, cleanup } = await boot();
    const todos = [{ content: "Retain successful todo", status: "pending" }];
    try {
      await callbacks.get("tool.execute.after")({ ...call("todowrite", { todos }), status: "completed",
        result: { output: { todos }, content: "Updated" } });
      const rejected = call("todowrite", { todos: [{ content: "Rejected todo", status: "pending" }] });
      await callbacks.get("tool.execute.before")(rejected);
      await callbacks.get("tool.execute.after")({ ...rejected, status: "error", error: { message: "Permission denied" } });
      const compact = context();
      await callbacks.get("session.compaction")(compact);
      const text = compact.system.map((part) => part.text).join("\n");
      expect(text).toContain(todos[0].content);
      expect(text).not.toContain("Rejected todo");
    } finally { await cleanup(); }
  });

  it("preserves successful todos across plugin restart and clears on data.sessionID deletion", async () => {
    const host = await boot();
    const todos = [{ content: "Verify native hooks", status: "pending" }];
    try {
      await host.callbacks.get("tool.execute.after")({ ...call("todowrite", { todos }), status: "completed",
        result: { output: { todos }, content: "Todos updated", metadata: { todos } } });
      await host.cleanup();
      host.cleanup = await plugin.setup(host.ctx);
      const compact = context();
      await host.callbacks.get("session.compaction")(compact);
      expect(compact.system.some((part) => part.text.includes(todos[0].content))).toBe(true);
      host.send({ type: "session.deleted", data: { sessionID: "ses_native" } });
      await host.deleted;
      const deleted = context();
      await host.callbacks.get("session.compaction")(deleted);
      expect(deleted.system).toEqual([]);
    } finally { await host.cleanup(); }
  });
});

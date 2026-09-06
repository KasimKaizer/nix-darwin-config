import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  createWebfetchRedirectGuardHook,
  MAX_WEBFETCH_REDIRECTS,
  pendingFailures,
} from "./webfetch.js";

describe("webfetch-redirect-guard (C2)", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    pendingFailures.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    pendingFailures.clear();
  });

  // (a) non-webfetch untouched
  it("(a) non-webfetch tool untouched in before and after", async () => {
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response("OK", { status: 200 });
    }) as unknown as typeof fetch;

    const hook = createWebfetchRedirectGuardHook();

    const beforeOut = { args: { url: "https://example.com/test" } };
    await hook["tool.execute.before"](
      { tool: "bash", sessionID: "s1", callID: "c1" },
      beforeOut
    );
    expect(fetchCalled).toBe(false);
    expect(beforeOut.args.url).toBe("https://example.com/test");

    const afterOut = { output: "some output with redirected too many times" };
    await hook["tool.execute.after"](
      { tool: "bash", sessionID: "s1", callID: "c1" },
      afterOut
    );
    expect(afterOut.output).toBe("some output with redirected too many times");
  });

  // (b) missing/non-string url untouched
  it("(b) missing/non-string url untouched in before", async () => {
    let fetchCalled = false;
    globalThis.fetch = (async () => {
      fetchCalled = true;
      return new Response("OK", { status: 200 });
    }) as unknown as typeof fetch;

    const hook = createWebfetchRedirectGuardHook();

    const outNoUrl = { args: {} };
    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "s1", callID: "c1" },
      outNoUrl
    );
    expect(fetchCalled).toBe(false);

    const outNumberUrl = { args: { url: 12345 } };
    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "s1", callID: "c1" },
      outNumberUrl
    );
    expect(fetchCalled).toBe(false);

    const outNullUrl = { args: { url: null } };
    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "s1", callID: "c1" },
      outNullUrl
    );
    expect(fetchCalled).toBe(false);

    const outNoArgs = {};
    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "s1", callID: "c1" },
      outNoArgs
    );
    expect(fetchCalled).toBe(false);
  });

  // (c) pending-key converts after-output to clean error and clears key
  it("(c) pending-key converts after-output to clean error and clears key", async () => {
    // Stub fetch to simulate a network failure
    globalThis.fetch = (async () => {
      throw new Error("Network error: connection refused");
    }) as unknown as typeof fetch;

    const hook = createWebfetchRedirectGuardHook();

    const beforeOut = { args: { url: "https://example.com/network-fail" } };
    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "s-pend-1", callID: "c-pend-1" },
      beforeOut
    );

    // Key is pending
    expect(pendingFailures.has("s-pend-1:c-pend-1")).toBe(true);

    const afterOut = { output: "Some unhandled tool crash or generic output" };
    await hook["tool.execute.after"](
      { tool: "webfetch", sessionID: "s-pend-1", callID: "c-pend-1" },
      afterOut
    );

    expect(afterOut.output).toBe(
      "Error: WebFetch failed: exceeded maximum redirects (5) for https://example.com/network-fail"
    );
    // Key must be cleared
    expect(pendingFailures.has("s-pend-1:c-pend-1")).toBe(false);

    // Subsequent call with same callID is untouched
    const afterOut2 = { output: "Untouched second invocation" };
    await hook["tool.execute.after"](
      { tool: "webfetch", sessionID: "s-pend-1", callID: "c-pend-1" },
      afterOut2
    );
    expect(afterOut2.output).toBe("Untouched second invocation");
  });

  // (d) redirect-loop regex converts
  it("(d) redirect-loop regex converts output even without pending failure", async () => {
    const hook = createWebfetchRedirectGuardHook();

    const out1 = { output: "Fetch failed: redirected too many times" };
    await hook["tool.execute.after"](
      { tool: "webfetch", sessionID: "s1", callID: "c1" },
      out1
    );
    expect(out1.output).toBe(
      "Error: WebFetch failed: exceeded maximum redirects (5)"
    );

    const out2 = { output: "Got error: Too Many Redirects occurred" };
    await hook["tool.execute.after"](
      { tool: "webfetch", sessionID: "s1", callID: "c2" },
      out2
    );
    expect(out2.output).toBe(
      "Error: WebFetch failed: exceeded maximum redirects (5)"
    );

    // With URL in input args
    const out3 = { output: "Fetch error: redirected too many times" };
    await hook["tool.execute.after"](
      {
        tool: "webfetch",
        sessionID: "s1",
        callID: "c3",
        args: { url: "https://example.com/regex-url" },
      },
      out3
    );
    expect(out3.output).toBe(
      "Error: WebFetch failed: exceeded maximum redirects (5) for https://example.com/regex-url"
    );
  });

  // (e) session.deleted evicts
  it("(e) session.deleted evicts pending failure keys", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fail");
    }) as unknown as typeof fetch;

    const hook = createWebfetchRedirectGuardHook();

    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "session-to-del", callID: "c1" },
      { args: { url: "https://example.com/del1" } }
    );
    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "session-to-del", callID: "c2" },
      { args: { url: "https://example.com/del2" } }
    );
    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "session-to-keep", callID: "c1" },
      { args: { url: "https://example.com/keep1" } }
    );

    expect(pendingFailures.has("session-to-del:c1")).toBe(true);
    expect(pendingFailures.has("session-to-del:c2")).toBe(true);
    expect(pendingFailures.has("session-to-keep:c1")).toBe(true);

    // Evict session-to-del
    await hook.event({
      event: {
        type: "session.deleted",
        properties: { id: "session-to-del" },
      },
    });

    expect(pendingFailures.has("session-to-del:c1")).toBe(false);
    expect(pendingFailures.has("session-to-del:c2")).toBe(false);
    expect(pendingFailures.has("session-to-keep:c1")).toBe(true);

    // after hook for deleted session does not convert
    const out = { output: "raw output" };
    await hook["tool.execute.after"](
      { tool: "webfetch", sessionID: "session-to-del", callID: "c1" },
      out
    );
    expect(out.output).toBe("raw output");
  });

  // QA Scenario: 6-hop stub chain limit path (failure-demo)
  it("QA scenario: 6-hop stub chain exceeds 5-hop limit and triggers error path", async () => {
    // 6-hop stub chain:
    // http://example.com/0 -> 302 -> http://example.com/1
    // http://example.com/1 -> 302 -> http://example.com/2
    // http://example.com/2 -> 302 -> http://example.com/3
    // http://example.com/3 -> 302 -> http://example.com/4
    // http://example.com/4 -> 302 -> http://example.com/5
    // http://example.com/5 -> 302 -> http://example.com/6
    // http://example.com/6 -> 200 OK
    const redirectMap: Record<string, string> = {
      "http://example.com/0": "http://example.com/1",
      "http://example.com/1": "http://example.com/2",
      "http://example.com/2": "http://example.com/3",
      "http://example.com/3": "http://example.com/4",
      "http://example.com/4": "http://example.com/5",
      "http://example.com/5": "http://example.com/6",
    };

    globalThis.fetch = (async (url: string | URL) => {
      const urlStr = url.toString();
      const next = redirectMap[urlStr];
      if (next) {
        return new Response(null, {
          status: 302,
          headers: { location: next },
        });
      }
      return new Response("Final Content", { status: 200 });
    }) as unknown as typeof fetch;

    const hook = createWebfetchRedirectGuardHook();

    const beforeOut = { args: { url: "http://example.com/0" } };
    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "s-6hop", callID: "c-6hop" },
      beforeOut
    );

    // Args should NOT be rewritten to 6th hop because limit was exceeded
    expect(beforeOut.args.url).toBe("http://example.com/0");
    expect(pendingFailures.has("s-6hop:c-6hop")).toBe(true);

    const afterOut = { output: "Native webfetch response" };
    await hook["tool.execute.after"](
      { tool: "webfetch", sessionID: "s-6hop", callID: "c-6hop" },
      afterOut
    );

    expect(afterOut.output).toBe(
      "Error: WebFetch failed: exceeded maximum redirects (5) for http://example.com/0"
    );
  });

  // QA Scenario: 5-hop stub chain (happy path) succeeds and updates url
  it("happy path: 5-hop stub chain succeeds and resolves to final url", async () => {
    // 5-hop stub chain:
    // http://example.com/0 -> 302 -> http://example.com/1
    // http://example.com/1 -> 302 -> http://example.com/2
    // http://example.com/2 -> 302 -> http://example.com/3
    // http://example.com/3 -> 302 -> http://example.com/4
    // http://example.com/4 -> 302 -> http://example.com/5
    // http://example.com/5 -> 200 OK
    const redirectMap: Record<string, string> = {
      "http://example.com/0": "http://example.com/1",
      "http://example.com/1": "http://example.com/2",
      "http://example.com/2": "http://example.com/3",
      "http://example.com/3": "http://example.com/4",
      "http://example.com/4": "http://example.com/5",
    };

    globalThis.fetch = (async (url: string | URL) => {
      const urlStr = url.toString();
      const next = redirectMap[urlStr];
      if (next) {
        return new Response(null, {
          status: 302,
          headers: { location: next },
        });
      }
      return new Response("Final Content", { status: 200 });
    }) as unknown as typeof fetch;

    const hook = createWebfetchRedirectGuardHook();

    const beforeOut = { args: { url: "http://example.com/0" } };
    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "s-5hop", callID: "c-5hop" },
      beforeOut
    );

    expect(beforeOut.args.url).toBe("http://example.com/5");
    expect(pendingFailures.has("s-5hop:c-5hop")).toBe(false);

    const afterOut = { output: "Final Content" };
    await hook["tool.execute.after"](
      { tool: "webfetch", sessionID: "s-5hop", callID: "c-5hop" },
      afterOut
    );
    expect(afterOut.output).toBe("Final Content");
  });

  // Relative redirect resolution
  it("resolves relative redirect location via new URL", async () => {
    globalThis.fetch = (async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr === "https://example.com/page") {
        return new Response(null, {
          status: 301,
          headers: { location: "/target?q=1" },
        });
      }
      return new Response("Target Content", { status: 200 });
    }) as unknown as typeof fetch;

    const hook = createWebfetchRedirectGuardHook();

    const beforeOut = { args: { url: "https://example.com/page" } };
    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "s-rel", callID: "c-rel" },
      beforeOut
    );

    expect(beforeOut.args.url).toBe("https://example.com/target?q=1");
  });

  // Redirect loop detection
  it("detects redirect loop and records pending failure", async () => {
    globalThis.fetch = (async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr === "https://example.com/loop-a") {
        return new Response(null, {
          status: 302,
          headers: { location: "https://example.com/loop-b" },
        });
      }
      if (urlStr === "https://example.com/loop-b") {
        return new Response(null, {
          status: 302,
          headers: { location: "https://example.com/loop-a" },
        });
      }
      return new Response("OK", { status: 200 });
    }) as unknown as typeof fetch;

    const hook = createWebfetchRedirectGuardHook();

    const beforeOut = { args: { url: "https://example.com/loop-a" } };
    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "s-loop", callID: "c-loop" },
      beforeOut
    );

    expect(pendingFailures.has("s-loop:c-loop")).toBe(true);

    const afterOut = { output: "Looping..." };
    await hook["tool.execute.after"](
      { tool: "webfetch", sessionID: "s-loop", callID: "c-loop" },
      afterOut
    );
    expect(afterOut.output).toBe(
      "Error: WebFetch failed: exceeded maximum redirects (5) for https://example.com/loop-a"
    );
  });

  // In-place mutation: the live server shares output.args with the tool's
  // args reference, so spread-replace would be silently lost.
  it("mutates output.args in place so the server picks up the resolved url", async () => {
    globalThis.fetch = (async (url: string | URL) => {
      const urlStr = url.toString();
      if (urlStr === "https://example.com/start") {
        return new Response(null, {
          status: 302,
          headers: { location: "https://example.com/finish" },
        });
      }
      return new Response("Done", { status: 200 });
    }) as unknown as typeof fetch;

    const hook = createWebfetchRedirectGuardHook();

    const liveArgs = {
      url: "https://example.com/start",
      format: "markdown",
    };
    const beforeOut = { args: liveArgs };

    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "s-inplace", callID: "c-inplace" },
      beforeOut
    );

    expect(beforeOut.args).toBe(liveArgs);
    expect(liveArgs.url).toBe("https://example.com/finish");
    expect(liveArgs.format).toBe("markdown");
  });

  // Pruning stale entries >10 min
  it("prunes entries older than 10 minutes on before-call", async () => {
    const now = Date.now();
    pendingFailures.set("s-stale:c-stale", {
      originalUrl: "http://example.com/old",
      at: now - 11 * 60 * 1000,
    });
    pendingFailures.set("s-fresh:c-fresh", {
      originalUrl: "http://example.com/fresh",
      at: now - 5 * 60 * 1000,
    });

    globalThis.fetch = (async () => {
      return new Response("OK", { status: 200 });
    }) as unknown as typeof fetch;

    const hook = createWebfetchRedirectGuardHook();

    await hook["tool.execute.before"](
      { tool: "webfetch", sessionID: "s1", callID: "c1" },
      { args: { url: "http://example.com/new" } }
    );

    expect(pendingFailures.has("s-stale:c-stale")).toBe(false);
    expect(pendingFailures.has("s-fresh:c-fresh")).toBe(true);
  });
});

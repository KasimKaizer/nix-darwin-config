import { describe, expect, it } from "bun:test";
import {
  isImmediateSearchTool,
  isResearchSearchTool,
  resolveSearchToolName,
} from "./reminders-search.js";

describe("resolveSearchToolName", () => {
  it("lowercases native tool names", () => {
    expect(resolveSearchToolName({ tool: "GREP" }, {})).toBe("grep");
  });

  it("unwraps CallDynamicTool namespace and toolName", () => {
    expect(
      resolveSearchToolName(
        {
          tool: "CallDynamicTool",
          args: { namespace: "mcp-gateway", toolName: "web_search_exa" },
        },
        {}
      )
    ).toBe("mcp-gateway_web_search_exa");
  });

  it("prefers output.args when unwrapping CallDynamicTool", () => {
    expect(
      resolveSearchToolName(
        { tool: "CallDynamicTool", args: { namespace: "ignored", toolName: "old" } },
        { args: { namespace: "exa", toolName: "web_search_exa" } }
      )
    ).toBe("exa_web_search_exa");
  });

  it("unwraps CallDynamicTool when namespace lives beside nested arguments", () => {
    expect(
      resolveSearchToolName(
        {
          tool: "CallDynamicTool",
          args: {
            namespace: "mcp-gateway",
            toolName: "web_search_exa",
            arguments: { query: "nix flakes", objective: "one sentence" },
          },
        },
        {}
      )
    ).toBe("mcp-gateway_web_search_exa");
  });
});

describe("isImmediateSearchTool", () => {
  it("matches local explore tools only", () => {
    expect(isImmediateSearchTool("grep")).toBe(true);
    expect(isImmediateSearchTool("glob")).toBe(true);
    expect(isImmediateSearchTool("webfetch")).toBe(true);
    expect(isImmediateSearchTool("codegraph_explore")).toBe(true);
    expect(isImmediateSearchTool("exa_web_search_exa")).toBe(false);
  });
});

describe("isResearchSearchTool", () => {
  it("matches research servers and search-shaped names", () => {
    const matches = [
      "exa_web_search_exa",
      "context7_query-docs",
      "context7_resolve-library-id",
      "grep_app_searchgithub",
      "github_search_repositories",
      "mcp-gateway_web_search_exa",
      "mcp-gateway_query-docs",
      "mcp-gateway_searchgithub",
      "mcp-gateway_google_search",
      "google_search",
      "custom_websearch",
      "searchgithub",
    ];
    for (const name of matches) {
      expect(isResearchSearchTool(name)).toBe(true);
    }
  });

  it("rejects browser, nix, and other non-search gateway tools", () => {
    const rejects = [
      "mcp-gateway_browser_click",
      "mcp-gateway_browser_navigate",
      "mcp-gateway_nix",
      "playwright_browser_navigate",
      "bash",
      "read",
      "calldynamictool",
    ];
    for (const name of rejects) {
      expect(isResearchSearchTool(name)).toBe(false);
    }
  });
});

import { describe, expect, it } from "bun:test";
import {
  isImmediateSearchTool,
  isResearchSearchTool,
} from "./reminders-search.js";

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
      "google_search",
      "custom_websearch",
      "searchgithub",
    ];
    for (const name of matches) {
      expect(isResearchSearchTool(name)).toBe(true);
    }
  });

  it("rejects browser, nix, and other non-search tools", () => {
    const rejects = [
      "nix_nix",
      "playwright_browser_navigate",
      "bash",
      "read",
    ];
    for (const name of rejects) {
      expect(isResearchSearchTool(name)).toBe(false);
    }
  });
});

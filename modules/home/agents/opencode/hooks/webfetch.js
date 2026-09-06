// webfetch-redirect-guard
// Upstream: packages/omo-opencode/src/hooks/webfetch-redirect-guard/hook.ts
// Resolves redirects up to 5 hops with manual fetch and AbortSignal timeout.
// Limits/loops/network errors record a pending failure and let the native tool
// run, which the after-hook converts to a clean error message.

export const MAX_WEBFETCH_REDIRECTS = 5;
export const STALE_TIMEOUT_MS = 10 * 60 * 1000;
export const REDIRECT_ERROR_REGEX = /redirected too many times|too many redirects/i;
export const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export const pendingFailures = new Map();

function makeKey(sessionID, callID) {
  return `${sessionID ?? ""}:${callID ?? ""}`;
}

function pruneStaleFailures() {
  const now = Date.now();
  for (const [key, entry] of pendingFailures) {
    if (now - entry.at > STALE_TIMEOUT_MS) {
      pendingFailures.delete(key);
    }
  }
}

function buildRedirectErrorMessage(url) {
  return url
    ? `Error: WebFetch failed: exceeded maximum redirects (${MAX_WEBFETCH_REDIRECTS}) for ${url}`
    : `Error: WebFetch failed: exceeded maximum redirects (${MAX_WEBFETCH_REDIRECTS})`;
}

export function createWebfetchRedirectGuardHook(options = {}) {
  return {
    "tool.execute.before": async (input, output) => {
      pruneStaleFailures();

      if (input?.tool?.toLowerCase() !== "webfetch") return;
      const originalUrl = output?.args?.url;
      if (typeof originalUrl !== "string") return;

      const key = makeKey(input?.sessionID, input?.callID);

      try {
        const fetchFn = options?.fetch ?? globalThis.fetch;
        let currentUrl = originalUrl;
        let hops = 0;
        const visited = new Set([currentUrl]);

        while (true) {
          const response = await fetchFn(currentUrl, {
            redirect: "manual",
            signal: AbortSignal.timeout(8000),
          });

          const isRedirect =
            REDIRECT_STATUSES.has(response.status) ||
            (response.status >= 300 && response.status < 400 && response.status !== 304);

          const location = isRedirect ? response.headers.get("location") : null;
          try {
            await response.body?.cancel?.();
          } catch {}

          if (!location) {
            // Mutate in place: output.args shares the tool's live args reference, so
            // only property assignment propagates (see session/tools.ts).
            output.args.url = currentUrl;
            return;
          }

          if (hops >= MAX_WEBFETCH_REDIRECTS) {
            pendingFailures.set(key, { originalUrl, at: Date.now() });
            return;
          }

          const nextUrl = new URL(location, currentUrl).toString();
          if (visited.has(nextUrl)) {
            pendingFailures.set(key, { originalUrl, at: Date.now() });
            return;
          }

          visited.add(nextUrl);
          currentUrl = nextUrl;
          hops++;
        }
      } catch {
        pendingFailures.set(key, { originalUrl, at: Date.now() });
      }
    },

    "tool.execute.after": async (input, output) => {
      if (input?.tool?.toLowerCase() !== "webfetch") return;
      if (typeof output?.output !== "string") return;

      const key = makeKey(input?.sessionID, input?.callID);
      const pending = pendingFailures.get(key);
      if (pending) {
        pendingFailures.delete(key);
        output.output = buildRedirectErrorMessage(pending.originalUrl);
        return;
      }

      if (REDIRECT_ERROR_REGEX.test(output.output)) {
        const url = output?.args?.url || input?.args?.url || output.output.match(/https?:\/\/[^\s"'<>]+/)?.[0];
        output.output = buildRedirectErrorMessage(url);
      }
    },

    event: async (input) => {
      const evt = input?.event ?? input;
      if (evt?.type === "session.deleted") {
        const sessionID = evt?.properties?.id ?? evt?.properties?.sessionID;
        if (sessionID) {
          const prefix = `${sessionID}:`;
          for (const key of pendingFailures.keys()) {
            if (key.startsWith(prefix)) {
              pendingFailures.delete(key);
            }
          }
        }
      }
    },
  };
}

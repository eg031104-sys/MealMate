/** Bounded public-directory failover. No arbitrary URLs, auth or household data. */
export type DirectorySource = "photon" | "vk-overpass" | "private-coffee";
export type DirectoryAttempt = {
  id: DirectorySource;
  label: string;
  url: string;
  init?: RequestInit;
};
type Health = Partial<
  Record<DirectorySource, { until: number; reason: string }>
>;
type StorageLike = Pick<Storage, "getItem" | "setItem">;
const KEY = "mealmate-directory-health-v1";
export const DIRECTORY_TIMEOUT_MS = 12000;
export const DIRECTORY_COOLDOWN_MS = 5 * 60000;
export function browserHealthStorage(): StorageLike | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
export function createDirectoryClient(
  options: {
    fetcher?: typeof fetch;
    now?: () => number;
    pause?: (ms: number, signal?: AbortSignal) => Promise<void>;
    storage?: () => StorageLike | undefined;
  } = {},
) {
  const now = options.now ?? (() => Date.now());
  let health: Health = {},
    lastStarted = -Infinity,
    running = false;
  const storage = options.storage ?? browserHealthStorage;
  const pause =
    options.pause ??
    ((ms, signal) =>
      new Promise<void>((resolve, reject) => {
        if (signal?.aborted) {
          reject(new DOMException("Aborted", "AbortError"));
          return;
        }
        const done = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          clearTimeout(timer);
          signal?.removeEventListener("abort", abort);
          reject(new DOMException("Aborted", "AbortError"));
        };
        const timer = setTimeout(done, ms);
        signal?.addEventListener("abort", abort, { once: true });
      }));
  function loadHealth() {
    try {
      const raw = JSON.parse(storage()?.getItem(KEY) ?? "{}");
      for (const id of ["photon", "vk-overpass", "private-coffee"] as const) {
        const item = raw?.[id];
        if (
          item &&
          typeof item.until === "number" &&
          Number.isFinite(item.until) &&
          typeof item.reason === "string" &&
          item.reason.length < 1000
        )
          health[id] = item;
      }
    } catch {
      /* A blocked/corrupt optional health cache never affects household data. */
    }
  }
  function saveHealth() {
    try {
      storage()?.setItem(KEY, JSON.stringify(health));
    } catch {
      /* Memory cooldown still works. */
    }
  }
  return {
    async lookup<T>(
      attempts: DirectoryAttempt[],
      parse: (raw: unknown, id: DirectorySource) => T[],
      signal?: AbortSignal,
    ): Promise<T[]> {
      if (running)
        throw Error(
          "A store-directory search is already running. Please wait or cancel it.",
        );
      running = true;
      loadHealth();
      const failures: string[] = [];
      let validEmpty: T[] | undefined;
      try {
        // At most one call per configured source; never loop/retry a failed host.
        for (const attempt of attempts.slice(0, 3)) {
          if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
          const previous = health[attempt.id];
          if (previous && previous.until > now()) {
            failures.push(
              `${attempt.label}: cooling down (${Math.ceil((previous.until - now()) / 60000)} min). ${previous.reason}`,
            );
            continue;
          }
          const gap = Math.max(0, 1200 - (now() - lastStarted));
          if (gap) await pause(gap, signal);
          const controller = new AbortController();
          const abort = () => controller.abort();
          signal?.addEventListener("abort", abort, { once: true });
          if (signal?.aborted) controller.abort();
          const timer = setTimeout(abort, DIRECTORY_TIMEOUT_MS);
          let retryAfter = DIRECTORY_COOLDOWN_MS;
          try {
            lastStarted = now();
            const response = await (options.fetcher ?? fetch)(attempt.url, {
              ...attempt.init,
              credentials: "omit",
              referrerPolicy: "strict-origin-when-cross-origin",
              signal: controller.signal,
            });
            if (!response.ok) {
              const retry = response.headers?.get("Retry-After");
              if (retry) {
                const ms = /^\d+$/.test(retry)
                  ? Number(retry) * 1000
                  : Date.parse(retry) - now();
                if (Number.isFinite(ms) && ms > 0)
                  retryAfter = Math.max(retryAfter, ms);
              }
              if ([401, 403].includes(response.status))
                retryAfter = Math.max(retryAfter, 30 * 60000);
              throw Error(`HTTP ${response.status}`);
            }
            const result = parse(await response.json(), attempt.id);
            if (signal?.aborted)
              throw new DOMException("Aborted", "AbortError");
            delete health[attempt.id];
            saveHealth();
            if (result.length) return result;
            // A valid empty result is not an outage. Check other sources for
            // coverage (notably Photon's capped POI index) before reporting none.
            validEmpty = result;
          } catch (error) {
            if (signal?.aborted)
              throw new DOMException("Aborted", "AbortError");
            const reason = controller.signal.aborted
              ? "Request timed out after 12 seconds."
              : error instanceof TypeError
                ? "Network/browser-access failure; CORS, connectivity or an outage cannot be distinguished by the browser."
                : error instanceof SyntaxError
                  ? "Unreadable JSON response."
                  : error instanceof Error &&
                      /^(HTTP \d+|The store directory returned an incomplete)/.test(
                        error.message,
                      )
                    ? error.message
                    : "Invalid or incomplete directory response.";
            health[attempt.id] = { until: now() + retryAfter, reason };
            saveHealth();
            failures.push(`${attempt.label}: ${reason}`);
          } finally {
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
          }
        }
        // Never call a partial search a confirmed no-results search when some
        // sources failed. Keep the cached previous results on the screen.
        if (validEmpty && !failures.length) return validEmpty;
        throw Error(
          `Store directories unavailable or incomplete. ${failures.join(" ")} Failed sources will not be retried during cooldown. Saved stores are unchanged; use a saved store or the manual fallback.`,
        );
      } finally {
        running = false;
      }
    },
  };
}

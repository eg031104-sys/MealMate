import { afterEach, expect, it, vi } from "vitest";
import {
  createDirectoryClient,
  DIRECTORY_TIMEOUT_MS,
} from "./directory-network";
const attempts = [
  {
    id: "photon" as const,
    label: "Photon",
    url: "https://photon.komoot.io/reverse",
  },
  {
    id: "vk-overpass" as const,
    label: "VK Maps Overpass",
    url: "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  },
  {
    id: "private-coffee" as const,
    label: "Private.coffee",
    url: "https://overpass.private.coffee/api/interpreter",
  },
];
const good = (items = ["store"]) =>
  ({ ok: true, json: async () => items }) as Response;
const parse = (raw: unknown) => {
  if (!Array.isArray(raw)) throw Error("invalid");
  return raw as string[];
};
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
it("tries each independent source at most once, then stops on validated genuine data", async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("Failed to fetch"))
    .mockResolvedValueOnce(good());
  const pause = vi.fn().mockResolvedValue(undefined);
  const client = createDirectoryClient({
    fetcher,
    pause,
    storage: () => undefined,
  });
  expect(await client.lookup(attempts, parse)).toEqual(["store"]);
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(pause).toHaveBeenCalledWith(expect.any(Number), undefined);
  expect(fetcher.mock.calls[1][0]).toContain("maps.mail.ru");
  expect(fetcher.mock.calls[1][1].credentials).toBe("omit");
});
it("persists failure cooldown across reloads and skips failed endpoints", async () => {
  let stored = "{}",
    time = 100000;
  const storage = {
    getItem: () => stored,
    setItem: (_key: string, value: string) => {
      stored = value;
    },
  };
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError("offline"))
    .mockResolvedValue(good());
  const options = {
    fetcher,
    now: () => time,
    pause: async () => {},
    storage: () => storage,
  };
  await createDirectoryClient(options).lookup(attempts, parse);
  fetcher.mockClear();
  await createDirectoryClient(options).lookup(attempts, parse);
  expect(fetcher.mock.calls[0][0]).toContain("maps.mail.ru");
  expect(fetcher).toHaveBeenCalledTimes(1);
  time += 300001;
  fetcher.mockClear();
  await createDirectoryClient(options).lookup(attempts, parse);
  expect(fetcher.mock.calls[0][0]).toContain("photon");
});
it("honours a server Retry-After and performs no requests if all services are cooling down", async () => {
  let time = 1_000_000,
    stored = "{}";
  const fetcher = vi.fn().mockResolvedValue({
    ok: false,
    status: 429,
    headers: new Headers({ "Retry-After": "900" }),
  });
  const client = createDirectoryClient({
    fetcher,
    now: () => time,
    pause: async () => {},
    storage: () => ({
      getItem: () => stored,
      setItem: (_k, v) => {
        stored = v;
      },
    }),
  });
  await expect(client.lookup(attempts, parse)).rejects.toThrow(/HTTP 429/);
  expect(fetcher).toHaveBeenCalledTimes(3);
  time += 5 * 60000 + 1;
  fetcher.mockClear();
  await expect(client.lookup(attempts, parse)).rejects.toThrow(/cooling down/);
  expect(fetcher).not.toHaveBeenCalled();
});
it("bounds slow requests at 12 seconds before using a different service", async () => {
  vi.useFakeTimers();
  const fetcher = vi
    .fn()
    .mockImplementationOnce(
      (_url, _init) =>
        new Promise((_resolve, reject) => {
          _init.signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    )
    .mockResolvedValue(good());
  const client = createDirectoryClient({ fetcher, storage: () => undefined });
  const result = client.lookup(attempts, parse);
  await vi.advanceTimersByTimeAsync(DIRECTORY_TIMEOUT_MS + 10);
  expect(await result).toEqual(["store"]);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("never falls back or penalises a source after a user cancellation", async () => {
  const controller = new AbortController();
  const fetcher = vi.fn(
    (_url, _init) =>
      new Promise<Response>((_resolve, reject) => {
        _init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      }),
  );
  const client = createDirectoryClient({ fetcher, storage: () => undefined });
  const result = client.lookup(attempts, parse, controller.signal);
  const checked = expect(result).rejects.toMatchObject({ name: "AbortError" });
  controller.abort();
  await checked;
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejects malformed, partial and HTTP failures without turning them into zero stores", async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(good([]))
    .mockResolvedValueOnce({ ok: false, status: 503, headers: new Headers() })
    .mockResolvedValueOnce({ ok: true, json: async () => ({ error: "bad" }) });
  const client = createDirectoryClient({
    fetcher,
    pause: async () => {},
    storage: () => undefined,
  });
  await expect(client.lookup(attempts, parse)).rejects.toThrow(
    /unavailable or incomplete/,
  );
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("returns a confirmed empty result only if every available source completed without failures", async () => {
  const fetcher = vi.fn().mockResolvedValue(good([]));
  expect(
    await createDirectoryClient({
      fetcher,
      pause: async () => {},
      storage: () => undefined,
    }).lookup(attempts, parse),
  ).toEqual([]);
  expect(fetcher).toHaveBeenCalledTimes(3);
});
it("works with blocked/corrupt optional health storage and blocks concurrent lookups", async () => {
  let finish!: (response: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        finish = resolve;
      }),
  );
  const client = createDirectoryClient({
    fetcher,
    storage: () => ({
      getItem: () => {
        throw Error("blocked");
      },
      setItem: () => {
        throw Error("blocked");
      },
    }),
  });
  const first = client.lookup(attempts, parse);
  await expect(client.lookup(attempts, parse)).rejects.toThrow(
    /already running/,
  );
  finish(good());
  expect(await first).toEqual(["store"]);
});

const OLX_HOST_RE = /(^|\.)olx\.ba$/i;

const GUARD_FLAG = "__olxNetGuardRegistered";

export function isOlxHost(hostname: string): boolean {
  return OLX_HOST_RE.test(hostname);
}

export function isOlxAllowedEnv(): boolean {
  return process.env.GITHUB_ACTIONS === "true";
}

export function assertOlxAllowed(context: string): void {
  if (!isOlxAllowedEnv()) {
    throw new Error(
      `[OLX-GUARD] Blokiran OLX zahtjev (${context}). ` +
        `OLX pozivi su dozvoljeni ISKLJUČIVO iz GitHub Actions.`,
    );
  }
}

function hostnameFromInput(input: unknown): string | null {
  try {
    if (typeof input === "string") return new URL(input).hostname;
    if (input instanceof URL) return input.hostname;
    if (typeof Request !== "undefined" && input instanceof Request) {
      return new URL(input.url).hostname;
    }
    if (input && typeof input === "object" && "url" in input) {
      return new URL(String((input as { url: unknown }).url)).hostname;
    }
  } catch {
    return null;
  }
  return null;
}

function assertUrlAllowed(input: unknown, context: string): void {
  const hostname = hostnameFromInput(input);
  if (hostname && isOlxHost(hostname)) {
    assertOlxAllowed(context);
  }
}

export function registerOlxNetGuard(): void {
  const g = globalThis as typeof globalThis & {
    [GUARD_FLAG]?: boolean;
  };
  if (g[GUARD_FLAG]) return;
  g[GUARD_FLAG] = true;

  const originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    assertUrlAllowed(input, "fetch");
    return originalFetch(input, init);
  }) as typeof fetch;

  void import("undici")
    .then((undici) => {
      const inner = undici.getGlobalDispatcher();
      const dispatch = inner.dispatch.bind(inner);
      undici.setGlobalDispatcher(
        new Proxy(inner, {
          get(target, prop, receiver) {
            if (prop === "dispatch") {
              return (
                opts: { origin?: string | URL },
                handler: unknown,
              ) => {
                if (opts?.origin) {
                  assertUrlAllowed(String(opts.origin), "undici");
                }
                return dispatch(
                  opts as Parameters<typeof dispatch>[0],
                  handler as Parameters<typeof dispatch>[1],
                );
              };
            }
            return Reflect.get(target, prop, receiver);
          },
        }),
      );
    })
    .catch(() => {
      // undici nije dostupan (Edge) — fetch wrap je dovoljan.
    });
}

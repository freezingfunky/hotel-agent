export class RateLimiter {
  private timestamps: number[] = [];
  constructor(
    private maxRequests: number,
    private windowMs: number,
  ) {}

  async wait(): Promise<void> {
    const now = Date.now();
    this.timestamps = this.timestamps.filter((t) => now - t < this.windowMs);
    if (this.timestamps.length >= this.maxRequests) {
      const oldest = this.timestamps[0]!;
      const delay = this.windowMs - (now - oldest) + 50;
      await new Promise((r) => setTimeout(r, delay));
    }
    this.timestamps.push(Date.now());
  }
}

export class SimpleCache {
  private store = new Map<string, { data: unknown; expiresAt: number }>();

  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.data as T;
  }

  set(key: string, data: unknown, ttlMs: number = 300_000): void {
    this.store.set(key, { data, expiresAt: Date.now() + ttlMs });
  }
}

export async function httpGet(
  url: string,
  headers: Record<string, string>,
  rateLimiter: RateLimiter,
  retries = 3,
): Promise<unknown> {
  await rateLimiter.wait();

  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, { headers });

    if (res.status === 429) {
      const backoff = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Auth failed (${res.status}). Check your API key in config.json. ` +
            `Response: ${body.slice(0, 200)}`,
        );
      }
      throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
    }

    return res.json();
  }

  throw new Error("Rate limited after 3 retries. Try again in 60 seconds.");
}

export async function httpPost(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  rateLimiter: RateLimiter,
  retries = 3,
): Promise<unknown> {
  await rateLimiter.wait();

  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      const backoff = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, backoff));
      continue;
    }

    if (!res.ok) {
      const respBody = await res.text().catch(() => "");
      if (res.status === 401 || res.status === 403) {
        throw new Error(
          `Auth failed (${res.status}). Check your credentials. ` +
            `Response: ${respBody.slice(0, 200)}`,
        );
      }
      throw new Error(`HTTP ${res.status}: ${respBody.slice(0, 300)}`);
    }

    return res.json();
  }

  throw new Error("Rate limited after 3 retries. Try again in 60 seconds.");
}

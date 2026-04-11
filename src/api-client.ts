import type { PmsAdapter, Property, Reservation, PmsConfig } from "./types.js";

// ── Rate limiter ─────────────────────────────────────────────────────

class RateLimiter {
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

// ── In-memory cache ──────────────────────────────────────────────────

class SimpleCache {
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

// ── HTTP helper ──────────────────────────────────────────────────────

async function httpGet(
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

// ── Guesty adapter ───────────────────────────────────────────────────

export class GuestyAdapter implements PmsAdapter {
  name = "Guesty";
  private baseUrl = "https://open-api.guesty.com/v1";
  private headers: Record<string, string>;
  private limiter = new RateLimiter(8, 1000);
  private cache = new SimpleCache();

  constructor(config: PmsConfig) {
    this.headers = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
  }

  async fetchProperties(): Promise<Property[]> {
    const cached = this.cache.get<Property[]>("properties");
    if (cached) return cached;

    const properties: Property[] = [];
    let skip = 0;
    const limit = 100;

    while (true) {
      const url = `${this.baseUrl}/listings?skip=${skip}&limit=${limit}&fields=_id title address.full bedrooms bathrooms accommodates active timezone`;
      const data = (await httpGet(url, this.headers, this.limiter)) as {
        results: Array<Record<string, unknown>>;
        count: number;
      };

      for (const item of data.results ?? []) {
        properties.push({
          id: String(item._id ?? ""),
          name: String(item.title ?? "Unnamed"),
          address: String(
            (item.address as Record<string, unknown>)?.full ?? "",
          ),
          bedrooms: Number(item.bedrooms ?? 0),
          bathrooms: Number(item.bathrooms ?? 0),
          maxGuests: Number(item.accommodates ?? 0),
          status: item.active ? "active" : "inactive",
          timezone: String(item.timezone ?? "UTC"),
        });
      }

      if (data.results.length < limit) break;
      skip += limit;
    }

    this.cache.set("properties", properties);
    return properties;
  }

  async fetchReservations(params: {
    startDate: string;
    endDate: string;
    status?: string;
    propertyId?: string;
    limit?: number;
  }): Promise<Reservation[]> {
    const cacheKey = `reservations:${JSON.stringify(params)}`;
    const cached = this.cache.get<Reservation[]>(cacheKey);
    if (cached) return cached;

    const reservations: Reservation[] = [];
    let skip = 0;
    const pageSize = params.limit ?? 100;

    while (true) {
      let url =
        `${this.baseUrl}/reservations?` +
        `checkInDateLocalized[$gte]=${params.startDate}&` +
        `checkOutDateLocalized[$lte]=${params.endDate}&` +
        `skip=${skip}&limit=${pageSize}&` +
        `fields=_id checkInDateLocalized checkOutDateLocalized nightsCount status guest.fullName listing._id listing.title money.totalPaid money.currency source canceledAt specialRequests createdAt`;

      if (params.status) url += `&status=${params.status}`;
      if (params.propertyId) url += `&listingId=${params.propertyId}`;

      const data = (await httpGet(url, this.headers, this.limiter)) as {
        results: Array<Record<string, unknown>>;
        count: number;
      };

      for (const item of data.results ?? []) {
        const guest = (item.guest as Record<string, unknown>) ?? {};
        const listing = (item.listing as Record<string, unknown>) ?? {};
        const money = (item.money as Record<string, unknown>) ?? {};
        const nights = Number(item.nightsCount ?? 1);
        const totalPrice = Number(money.totalPaid ?? 0);

        reservations.push({
          id: String(item._id ?? ""),
          propertyId: String(listing._id ?? ""),
          propertyName: String(listing.title ?? "Unknown"),
          guestName: String(guest.fullName ?? "Unknown Guest"),
          checkIn: String(item.checkInDateLocalized ?? ""),
          checkOut: String(item.checkOutDateLocalized ?? ""),
          nights,
          status: String(item.status ?? "unknown"),
          totalPrice,
          nightlyRate: nights > 0 ? Math.round((totalPrice / nights) * 100) / 100 : 0,
          currency: String(money.currency ?? "USD"),
          cancelledAt: item.canceledAt ? String(item.canceledAt) : undefined,
          specialRequests: item.specialRequests ? String(item.specialRequests) : undefined,
          source: item.source ? String(item.source) : undefined,
          createdAt: String(item.createdAt ?? ""),
        });
      }

      if (data.results.length < pageSize) break;
      skip += pageSize;
      if (params.limit && reservations.length >= params.limit) break;
    }

    this.cache.set(cacheKey, reservations);
    return reservations;
  }
}

// ── Hostaway adapter ─────────────────────────────────────────────────

export class HostawayAdapter implements PmsAdapter {
  name = "Hostaway";
  private baseUrl = "https://api.hostaway.com/v1";
  private headers: Record<string, string>;
  private limiter = new RateLimiter(12, 10_000);
  private cache = new SimpleCache();

  constructor(config: PmsConfig) {
    this.headers = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
      "Cache-Control": "no-cache",
    };
  }

  async fetchProperties(): Promise<Property[]> {
    const cached = this.cache.get<Property[]>("properties");
    if (cached) return cached;

    const properties: Property[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const url = `${this.baseUrl}/listings?offset=${offset}&limit=${limit}`;
      const data = (await httpGet(url, this.headers, this.limiter)) as {
        status: string;
        result: Array<Record<string, unknown>>;
        count: number;
      };

      for (const item of data.result ?? []) {
        properties.push({
          id: String(item.id ?? ""),
          name: String(item.name ?? "Unnamed"),
          address: [item.address, item.city, item.state, item.countryCode]
            .filter(Boolean)
            .join(", "),
          bedrooms: Number(item.bedroomsNumber ?? 0),
          bathrooms: Number(item.bathroomsNumber ?? 0),
          maxGuests: Number(item.personCapacity ?? 0),
          status: item.isActive ? "active" : "inactive",
          timezone: String(item.timezone ?? "UTC"),
        });
      }

      if ((data.result ?? []).length < limit) break;
      offset += limit;
    }

    this.cache.set("properties", properties);
    return properties;
  }

  async fetchReservations(params: {
    startDate: string;
    endDate: string;
    status?: string;
    propertyId?: string;
    limit?: number;
  }): Promise<Reservation[]> {
    const cacheKey = `reservations:${JSON.stringify(params)}`;
    const cached = this.cache.get<Reservation[]>(cacheKey);
    if (cached) return cached;

    const reservations: Reservation[] = [];
    let offset = 0;
    const pageSize = params.limit ?? 100;

    while (true) {
      let url =
        `${this.baseUrl}/reservations?` +
        `startDate=${params.startDate}&endDate=${params.endDate}&` +
        `offset=${offset}&limit=${pageSize}&sortOrder=arrivalDate`;

      if (params.status) url += `&status=${params.status}`;
      if (params.propertyId) url += `&listingId=${params.propertyId}`;

      const data = (await httpGet(url, this.headers, this.limiter)) as {
        status: string;
        result: Array<Record<string, unknown>>;
        count: number;
      };

      for (const item of data.result ?? []) {
        const arrivalDate = String(item.arrivalDate ?? "");
        const departureDate = String(item.departureDate ?? "");
        const nights = Number(item.nights ?? 1);
        const totalPrice = Number(item.totalPrice ?? 0);

        reservations.push({
          id: String(item.id ?? ""),
          propertyId: String(item.listingMapId ?? ""),
          propertyName: String(item.listingName ?? "Unknown"),
          guestName: String(item.guestName ?? "Unknown Guest"),
          checkIn: arrivalDate,
          checkOut: departureDate,
          nights,
          status: String(item.status ?? "unknown"),
          totalPrice,
          nightlyRate: nights > 0 ? Math.round((totalPrice / nights) * 100) / 100 : 0,
          currency: String(item.currency ?? "USD"),
          cancelledAt: item.cancelledOn ? String(item.cancelledOn) : undefined,
          cancellationReason: item.cancellationReason
            ? String(item.cancellationReason)
            : undefined,
          specialRequests: item.guestNote ? String(item.guestNote) : undefined,
          source: item.channelName ? String(item.channelName) : undefined,
          createdAt: String(item.insertedOn ?? ""),
        });
      }

      if ((data.result ?? []).length < pageSize) break;
      offset += pageSize;
      if (params.limit && reservations.length >= params.limit) break;
    }

    this.cache.set(cacheKey, reservations);
    return reservations;
  }
}

// ── Factory ──────────────────────────────────────────────────────────

export function createAdapter(config: PmsConfig): PmsAdapter {
  switch (config.pms) {
    case "guesty":
      return new GuestyAdapter(config);
    case "hostaway":
      return new HostawayAdapter(config);
    default:
      throw new Error(
        `Unsupported PMS: "${config.pms}". Supported: guesty, hostaway`,
      );
  }
}

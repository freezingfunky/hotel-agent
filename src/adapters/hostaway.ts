import type { PmsAdapter, Property, Reservation, PmsConfig } from "../types.js";
import { RateLimiter, SimpleCache, httpGet } from "../http.js";

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
        const nights = Number(item.nights ?? 1);
        const totalPrice = Number(item.totalPrice ?? 0);

        reservations.push({
          id: String(item.id ?? ""),
          propertyId: String(item.listingMapId ?? ""),
          propertyName: String(item.listingName ?? "Unknown"),
          guestName: String(item.guestName ?? "Unknown Guest"),
          checkIn: String(item.arrivalDate ?? ""),
          checkOut: String(item.departureDate ?? ""),
          nights,
          status: String(item.status ?? "unknown"),
          totalPrice,
          nightlyRate: nights > 0 ? Math.round((totalPrice / nights) * 100) / 100 : 0,
          currency: String(item.currency ?? "USD"),
          cancelledAt: item.cancelledOn ? String(item.cancelledOn) : undefined,
          cancellationReason: item.cancellationReason ? String(item.cancellationReason) : undefined,
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

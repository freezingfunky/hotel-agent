import type { PmsAdapter, Property, Reservation, PmsConfig } from "../types.js";
import { RateLimiter, SimpleCache, httpGet } from "../http.js";

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
          address: String((item.address as Record<string, unknown>)?.full ?? ""),
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

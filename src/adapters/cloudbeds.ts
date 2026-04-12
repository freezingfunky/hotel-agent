import type { PmsAdapter, Property, Reservation, PmsConfig } from "../types.js";
import { RateLimiter, SimpleCache, httpGet } from "../http.js";

export class CloudbedsAdapter implements PmsAdapter {
  name = "Cloudbeds";
  private baseUrl = "https://api.cloudbeds.com/api/v1.3";
  private headers: Record<string, string>;
  private limiter = new RateLimiter(4, 1000);
  private cache = new SimpleCache();
  private propertyIds: string[];

  constructor(config: PmsConfig & { propertyIds?: string[] }) {
    this.headers = {
      "x-api-key": config.apiKey,
      Accept: "application/json",
    };
    this.propertyIds = config.propertyIds ?? [];
  }

  private headersForProperty(propertyId: string): Record<string, string> {
    return { ...this.headers, "X-PROPERTY-ID": propertyId };
  }

  async fetchProperties(): Promise<Property[]> {
    const cached = this.cache.get<Property[]>("properties");
    if (cached) return cached;

    if (this.propertyIds.length === 0) {
      const data = (await httpGet(
        `${this.baseUrl}/getHotels`,
        this.headers,
        this.limiter,
      )) as { success: boolean; data: Array<Record<string, unknown>> };
      this.propertyIds = (data.data ?? []).map((h) => String(h.propertyID ?? ""));
    }

    const properties: Property[] = [];
    for (const pid of this.propertyIds) {
      const data = (await httpGet(
        `${this.baseUrl}/getHotelDetails`,
        this.headersForProperty(pid),
        this.limiter,
      )) as { success: boolean; data: Record<string, unknown> };

      const hotel = data.data ?? {};
      properties.push({
        id: String(hotel.propertyID ?? pid),
        name: String(hotel.propertyName ?? "Unnamed"),
        address: [hotel.propertyAddress, hotel.propertyCity, hotel.propertyState, hotel.propertyCountry]
          .filter(Boolean)
          .join(", "),
        bedrooms: Number(hotel.numberOfRooms ?? 0),
        bathrooms: 0,
        maxGuests: Number(hotel.maxGuests ?? 0),
        status: "active",
        timezone: String(hotel.propertyTimezone ?? "UTC"),
      });
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

    const properties = await this.fetchProperties();
    const targetIds = params.propertyId
      ? [params.propertyId]
      : properties.map((p) => p.id);

    const reservations: Reservation[] = [];

    for (const pid of targetIds) {
      const propName = properties.find((p) => p.id === pid)?.name ?? "Unknown";
      let url =
        `${this.baseUrl}/getReservations?` +
        `checkInFrom=${params.startDate}&checkInTo=${params.endDate}`;
      if (params.status) url += `&status=${params.status}`;

      const data = (await httpGet(
        url,
        this.headersForProperty(pid),
        this.limiter,
      )) as { success: boolean; data: Array<Record<string, unknown>> };

      for (const item of data.data ?? []) {
        const startDate = String(item.startDate ?? "");
        const endDate = String(item.endDate ?? "");
        const nights = daysBetween(startDate, endDate);
        const total = Number(item.total ?? 0);

        const assigned = (item.assigned as Array<Record<string, unknown>>) ?? [];
        const dailyRates = assigned.flatMap(
          (a) => (a.dailyRates as Array<Record<string, unknown>>) ?? [],
        );
        const avgRate = dailyRates.length > 0
          ? dailyRates.reduce((s, d) => s + Number(d.rate ?? 0), 0) / dailyRates.length
          : nights > 0 ? total / nights : 0;

        // Cloudbeds has native no_show status
        const rawStatus = String(item.status ?? "unknown").toLowerCase();
        const status =
          rawStatus === "no_show" ? "no-show" :
          rawStatus === "canceled" ? "cancelled" :
          rawStatus === "checked_in" ? "checked-in" :
          rawStatus === "checked_out" ? "checked-out" :
          rawStatus;

        reservations.push({
          id: String(item.reservationID ?? ""),
          propertyId: pid,
          propertyName: propName,
          guestName: String(item.guestName ?? "Unknown Guest"),
          checkIn: startDate,
          checkOut: endDate,
          nights,
          status,
          totalPrice: total,
          nightlyRate: Math.round(avgRate * 100) / 100,
          currency: String(item.currency ?? "USD"),
          cancelledAt: rawStatus === "canceled" ? String(item.dateModified ?? "") : undefined,
          specialRequests: item.specialRequests ? String(item.specialRequests) : undefined,
          source: item.source ? String(item.source) : undefined,
          createdAt: String(item.dateCreated ?? ""),
        });
      }
    }

    this.cache.set(cacheKey, reservations);
    return reservations;
  }
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

import type { PmsAdapter, Property, Reservation, PmsConfig } from "../types.js";
import { RateLimiter, SimpleCache, httpGet } from "../http.js";

/**
 * Apaleo is a RESTful hotel PMS with OAuth 2.0 Bearer auth.
 * Properties are "properties", reservations are "bookings" or "reservations".
 */
export class ApaleoAdapter implements PmsAdapter {
  name = "Apaleo";
  private baseUrl = "https://api.apaleo.com";
  private headers: Record<string, string>;
  private limiter = new RateLimiter(8, 1000);
  private cache = new SimpleCache();

  constructor(config: PmsConfig) {
    this.headers = {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    };
  }

  async fetchProperties(): Promise<Property[]> {
    const cached = this.cache.get<Property[]>("properties");
    if (cached) return cached;

    const properties: Property[] = [];
    let pageToken: string | undefined;

    while (true) {
      let url = `${this.baseUrl}/inventory/v1/properties?pageSize=100`;
      if (pageToken) url += `&pageToken=${pageToken}`;

      const data = (await httpGet(url, this.headers, this.limiter)) as {
        properties: Array<Record<string, unknown>>;
        nextPageToken?: string;
      };

      for (const item of data.properties ?? []) {
        const location = (item.location as Record<string, unknown>) ?? {};
        const address = (location.address as Record<string, unknown>) ?? {};

        properties.push({
          id: String(item.id ?? ""),
          name: String(item.name ?? "Unnamed"),
          address: [address.addressLine1, address.city, address.countryCode]
            .filter(Boolean)
            .join(", "),
          bedrooms: Number(item.numberOfRooms ?? 0),
          bathrooms: 0,
          maxGuests: 0,
          status: String(item.status ?? "").toLowerCase() === "live" ? "active" : "inactive",
          timezone: String(item.timeZone ?? "UTC"),
        });
      }

      pageToken = data.nextPageToken;
      if (!pageToken || (data.properties ?? []).length === 0) break;
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
    const reservations: Reservation[] = [];
    let pageToken: string | undefined;

    while (true) {
      let url =
        `${this.baseUrl}/booking/v1/reservations?` +
        `dateFilter=Arrival&from=${params.startDate}&to=${params.endDate}` +
        `&pageSize=${params.limit ?? 100}&expand=booker`;
      if (params.propertyId) url += `&propertyId=${params.propertyId}`;
      if (params.status) url += `&status=${mapApaleoStatus(params.status)}`;
      if (pageToken) url += `&pageToken=${pageToken}`;

      const data = (await httpGet(url, this.headers, this.limiter)) as {
        reservations: Array<Record<string, unknown>>;
        nextPageToken?: string;
      };

      for (const item of data.reservations ?? []) {
        const arrival = String(item.arrival ?? "").split("T")[0] ?? "";
        const departure = String(item.departure ?? "").split("T")[0] ?? "";
        const nights = daysBetween(arrival, departure);
        const property = (item.property as Record<string, unknown>) ?? {};
        const propId = String(property.id ?? item.propertyId ?? "");
        const propName = properties.find((p) => p.id === propId)?.name ?? "Unknown";

        const totalAmount = item.totalGrossAmount as Record<string, unknown> | undefined;
        const totalPrice = Number(totalAmount?.amount ?? 0);
        const currency = String(totalAmount?.currency ?? "EUR");

        const rawStatus = String(item.status ?? "").toLowerCase();
        const status =
          rawStatus === "canceled" ? "cancelled" :
          rawStatus === "noshow" ? "no-show" :
          rawStatus === "inhouse" ? "checked-in" :
          rawStatus === "checkedout" ? "checked-out" :
          rawStatus === "confirmed" ? "confirmed" :
          rawStatus;

        const booker = (item.booker as Record<string, unknown>) ?? {};
        const guestName = [booker.firstName, booker.lastName]
          .filter(Boolean)
          .join(" ") || "Unknown Guest";

        reservations.push({
          id: String(item.id ?? ""),
          propertyId: propId,
          propertyName: propName,
          guestName,
          checkIn: arrival,
          checkOut: departure,
          nights,
          status,
          totalPrice,
          nightlyRate: nights > 0 ? Math.round((totalPrice / nights) * 100) / 100 : 0,
          currency,
          cancelledAt:
            status === "cancelled" ? String(item.modified ?? "") : undefined,
          source: item.channelCode ? String(item.channelCode) : undefined,
          createdAt: String(item.created ?? ""),
        });
      }

      pageToken = data.nextPageToken;
      if (!pageToken || (data.reservations ?? []).length === 0) break;
      if (params.limit && reservations.length >= params.limit) break;
    }

    this.cache.set(cacheKey, reservations);
    return reservations;
  }
}

function mapApaleoStatus(status: string): string {
  const map: Record<string, string> = {
    confirmed: "Confirmed",
    cancelled: "Canceled",
    "checked-in": "InHouse",
    "checked-out": "CheckedOut",
    "no-show": "NoShow",
  };
  return map[status.toLowerCase()] ?? status;
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

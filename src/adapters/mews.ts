import type { PmsAdapter, Property, Reservation, PmsConfig } from "../types.js";
import { RateLimiter, SimpleCache, httpPost } from "../http.js";

/**
 * Mews uses a POST-based Connector API.
 * Auth is via ClientToken + AccessToken passed in every request body.
 * Properties are "enterprises", rooms are "spaces", reservations are "reservations".
 */
export class MewsAdapter implements PmsAdapter {
  name = "Mews";
  private baseUrl = "https://api.mews.com/api/connector/v1";
  private clientToken: string;
  private accessToken: string;
  private limiter = new RateLimiter(10, 1000);
  private cache = new SimpleCache();

  constructor(config: PmsConfig & { clientToken?: string }) {
    this.clientToken = config.clientToken ?? "";
    this.accessToken = config.apiKey;
  }

  private authBody() {
    return {
      ClientToken: this.clientToken,
      AccessToken: this.accessToken,
    };
  }

  async fetchProperties(): Promise<Property[]> {
    const cached = this.cache.get<Property[]>("properties");
    if (cached) return cached;

    const data = (await httpPost(
      `${this.baseUrl}/enterprises/getAll`,
      { ...this.authBody() },
      {},
      this.limiter,
    )) as { Enterprises: Array<Record<string, unknown>> };

    const properties: Property[] = [];
    for (const ent of data.Enterprises ?? []) {
      properties.push({
        id: String(ent.Id ?? ""),
        name: String(ent.Name ?? "Unnamed"),
        address: formatMewsAddress(ent.Address as Record<string, unknown> | undefined),
        bedrooms: 0,
        bathrooms: 0,
        maxGuests: 0,
        status: "active",
        timezone: String(ent.TimeZoneIdentifier ?? "UTC"),
      });
    }

    // Enrich with space (room) counts
    for (const prop of properties) {
      try {
        const spacesData = (await httpPost(
          `${this.baseUrl}/spaces/getAll`,
          { ...this.authBody(), EnterpriseId: prop.id },
          {},
          this.limiter,
        )) as { Spaces: Array<Record<string, unknown>> };
        const activeSpaces = (spacesData.Spaces ?? []).filter(
          (s) => String(s.IsActive) === "true",
        );
        prop.bedrooms = activeSpaces.length;
      } catch {
        // Space count is supplementary; don't fail on it
      }
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
    const targetEnterprises = params.propertyId
      ? [params.propertyId]
      : properties.map((p) => p.id);

    const reservations: Reservation[] = [];

    for (const entId of targetEnterprises) {
      const propName = properties.find((p) => p.id === entId)?.name ?? "Unknown";

      const body: Record<string, unknown> = {
        ...this.authBody(),
        EnterpriseId: entId,
        StartUtc: `${params.startDate}T00:00:00Z`,
        EndUtc: `${params.endDate}T23:59:59Z`,
        Limitation: { Count: params.limit ?? 1000 },
      };

      const data = (await httpPost(
        `${this.baseUrl}/reservations/getAll`,
        body,
        {},
        this.limiter,
      )) as { Reservations: Array<Record<string, unknown>> };

      for (const item of data.Reservations ?? []) {
        const startUtc = String(item.StartUtc ?? "");
        const endUtc = String(item.EndUtc ?? "");
        const checkIn = startUtc.split("T")[0] ?? "";
        const checkOut = endUtc.split("T")[0] ?? "";
        const nights = daysBetween(checkIn, checkOut);

        const rawState = String(item.State ?? "").toLowerCase();
        const status =
          rawState === "canceled" || rawState === "cancelled" ? "cancelled" :
          rawState === "started" ? "checked-in" :
          rawState === "processed" ? "checked-out" :
          rawState === "confirmed" ? "confirmed" :
          rawState;

        // Mews financials come from accountingItems; approximate from TotalAmount if available
        const totalAmountObj = (item.TotalAmount as Record<string, unknown>) ?? {};
        const totalPrice = Number(totalAmountObj.Value ?? totalAmountObj ?? 0);

        const companionIds = (item.CompanionIds as string[]) ?? [];
        reservations.push({
          id: String(item.Id ?? ""),
          propertyId: entId,
          propertyName: propName,
          guestName: String(item.CustomerName ?? companionIds[0] ?? "Unknown Guest"),
          checkIn,
          checkOut,
          nights,
          status,
          totalPrice,
          nightlyRate: nights > 0 ? Math.round((totalPrice / nights) * 100) / 100 : 0,
          currency: String(totalAmountObj.Currency ?? "EUR"),
          cancelledAt:
            status === "cancelled" ? String(item.UpdatedUtc ?? "") : undefined,
          source: item.ChannelManagerNumber ? String(item.ChannelManagerNumber) : undefined,
          createdAt: String(item.CreatedUtc ?? ""),
        });
      }
    }

    this.cache.set(cacheKey, reservations);
    return reservations;
  }
}

function formatMewsAddress(addr: Record<string, unknown> | undefined): string {
  if (!addr) return "";
  return [addr.Line1, addr.City, addr.CountryCode].filter(Boolean).join(", ");
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

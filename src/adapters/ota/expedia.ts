import type { OtaAdapter, OtaSourceConfig, ChannelBooking, ChannelCommission } from "../../types.js";
import { RateLimiter, SimpleCache, httpGet } from "../../http.js";
import { createHash } from "node:crypto";

/**
 * Expedia EPS Rapid API adapter — signature auth (API key + shared secret + SHA-512).
 * Docs: https://developers.expediagroup.com/rapid
 * Requires partner application.
 */
export class ExpediaAdapter implements OtaAdapter {
  name = "Expedia";
  private baseUrl = "https://api.ean.com/v3";
  private apiKey: string;
  private secret: string;
  private limiter = new RateLimiter(3, 1000);
  private cache = new SimpleCache();

  constructor(config: OtaSourceConfig) {
    this.apiKey = config.apiKey;
    this.secret = config.clientSecret ?? "";
  }

  private getAuthHeaders(): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const toHash = this.apiKey + this.secret + timestamp;
    const signature = createHash("sha512").update(toHash).digest("hex");

    return {
      Authorization: `EAN apikey=${this.apiKey},signature=${signature},timestamp=${timestamp}`,
      Accept: "application/json",
    };
  }

  async fetchBookingsByChannel(params: {
    startDate: string;
    endDate: string;
  }): Promise<ChannelBooking[]> {
    const cacheKey = `exp-bookings-${params.startDate}-${params.endDate}`;
    const cached = this.cache.get<ChannelBooking[]>(cacheKey);
    if (cached) return cached;

    const qs = new URLSearchParams({
      checkin: params.startDate,
      checkout: params.endDate,
    });

    const data = await httpGet(
      `${this.baseUrl}/itineraries?${qs}`,
      this.getAuthHeaders(),
      this.limiter,
    ) as { itineraries?: Array<Record<string, unknown>> };

    const items = data.itineraries ?? [];
    const totalRevenue = items.reduce(
      (s, r) => s + Number((r.rooms as Array<Record<string, unknown>>)?.[0]?.total ?? r.total ?? 0), 0,
    );
    const totalNights = items.reduce(
      (s, r) => s + Number(r.nights ?? 1), 0,
    );
    const cancelledCount = items.filter(
      (r) => String(r.status).toLowerCase() === "cancelled",
    ).length;

    const result: ChannelBooking[] = [{
      channel: "Expedia",
      reservationCount: items.length,
      totalRevenue: Math.round(totalRevenue),
      avgNightlyRate: totalNights > 0 ? Math.round(totalRevenue / totalNights) : 0,
      avgLeadTimeDays: 18,
      avgLengthOfStay: items.length > 0 ? round(totalNights / items.length, 1) : 0,
      cancellationRate: items.length > 0 ? round(cancelledCount / items.length, 3) : 0,
    }];

    this.cache.set(cacheKey, result);
    return result;
  }

  async fetchChannelCommissions(params: {
    startDate: string;
    endDate: string;
  }): Promise<ChannelCommission[]> {
    const bookings = await this.fetchBookingsByChannel(params);
    const commissionPct = 18;

    return bookings.map((b) => {
      const paid = Math.round(b.totalRevenue * commissionPct / 100);
      return {
        channel: "Expedia",
        commissionPct,
        totalCommissionPaid: paid,
        netRevenue: b.totalRevenue - paid,
        grossRevenue: b.totalRevenue,
        bookingCount: b.reservationCount,
      };
    });
  }
}

function round(n: number, d: number): number {
  const f = Math.pow(10, d);
  return Math.round(n * f) / f;
}

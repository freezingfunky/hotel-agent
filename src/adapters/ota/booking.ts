import type { OtaAdapter, OtaSourceConfig, ChannelBooking, ChannelCommission } from "../../types.js";
import { RateLimiter, SimpleCache, httpGet } from "../../http.js";

/**
 * Booking.com Connectivity Partner API adapter — token auth.
 * Docs: https://developers.booking.com/connectivity/docs
 * Requires Connectivity Partner certification.
 */
export class BookingComAdapter implements OtaAdapter {
  name = "Booking.com";
  private baseUrl = "https://supply-xml.booking.com/json";
  private headers: Record<string, string>;
  private limiter = new RateLimiter(3, 1000);
  private cache = new SimpleCache();

  constructor(config: OtaSourceConfig) {
    this.headers = {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    };
  }

  async fetchBookingsByChannel(params: {
    startDate: string;
    endDate: string;
  }): Promise<ChannelBooking[]> {
    const cacheKey = `bcom-bookings-${params.startDate}-${params.endDate}`;
    const cached = this.cache.get<ChannelBooking[]>(cacheKey);
    if (cached) return cached;

    const qs = new URLSearchParams({
      checkin_from: params.startDate,
      checkin_to: params.endDate,
    });

    const data = await httpGet(
      `${this.baseUrl}/reservations?${qs}`,
      this.headers,
      this.limiter,
    ) as { reservations?: Array<Record<string, unknown>> };

    const reservations = data.reservations ?? [];
    const totalRevenue = reservations.reduce(
      (s, r) => s + Number(r.total_price ?? 0), 0,
    );
    const totalNights = reservations.reduce(
      (s, r) => s + Number(r.nights ?? 1), 0,
    );
    const cancelledCount = reservations.filter(
      (r) => String(r.status).toLowerCase() === "cancelled",
    ).length;

    const result: ChannelBooking[] = [{
      channel: "Booking.com",
      reservationCount: reservations.length,
      totalRevenue: Math.round(totalRevenue),
      avgNightlyRate: totalNights > 0 ? Math.round(totalRevenue / totalNights) : 0,
      avgLeadTimeDays: 14,
      avgLengthOfStay: reservations.length > 0 ? round(totalNights / reservations.length, 1) : 0,
      cancellationRate: reservations.length > 0 ? round(cancelledCount / reservations.length, 3) : 0,
    }];

    this.cache.set(cacheKey, result);
    return result;
  }

  async fetchChannelCommissions(params: {
    startDate: string;
    endDate: string;
  }): Promise<ChannelCommission[]> {
    const bookings = await this.fetchBookingsByChannel(params);
    const commissionPct = 15;

    return bookings.map((b) => {
      const paid = Math.round(b.totalRevenue * commissionPct / 100);
      return {
        channel: "Booking.com",
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

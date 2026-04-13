import type { OtaAdapter, ChannelBooking, ChannelCommission } from "../../types.js";

/**
 * Deterministic mock OTA data with realistic channel distribution:
 *   Direct: 35% of bookings, 0% commission
 *   Booking.com: 30%, 15% commission
 *   Expedia: 20%, 18% commission
 *   Airbnb: 15%, 3% host fee
 */
export class MockOtaAdapter implements OtaAdapter {
  name = "Demo OTA (Mock Data)";

  private channels = [
    { channel: "Direct", share: 0.35, commission: 0, avgRate: 225, cancelRate: 0.05, leadTime: 21, los: 3.8 },
    { channel: "Booking.com", share: 0.30, commission: 0.15, avgRate: 210, cancelRate: 0.12, leadTime: 14, los: 2.9 },
    { channel: "Expedia", share: 0.20, commission: 0.18, avgRate: 205, cancelRate: 0.10, leadTime: 18, los: 3.2 },
    { channel: "Airbnb", share: 0.15, commission: 0.03, avgRate: 240, cancelRate: 0.04, leadTime: 28, los: 4.5 },
  ];

  async fetchBookingsByChannel(params: {
    startDate: string;
    endDate: string;
  }): Promise<ChannelBooking[]> {
    const days = daysBetween(params.startDate, params.endDate);
    const totalBookings = Math.round(days * 8.5); // ~8.5 bookings/day across portfolio

    return this.channels.map((ch) => {
      const count = Math.round(totalBookings * ch.share);
      const totalRevenue = Math.round(count * ch.avgRate * ch.los);
      return {
        channel: ch.channel,
        reservationCount: count,
        totalRevenue,
        avgNightlyRate: ch.avgRate,
        avgLeadTimeDays: ch.leadTime,
        avgLengthOfStay: ch.los,
        cancellationRate: ch.cancelRate,
      };
    });
  }

  async fetchChannelCommissions(params: {
    startDate: string;
    endDate: string;
  }): Promise<ChannelCommission[]> {
    const bookings = await this.fetchBookingsByChannel(params);

    return bookings.map((b) => {
      const ch = this.channels.find((c) => c.channel === b.channel)!;
      const commissionPaid = Math.round(b.totalRevenue * ch.commission);
      return {
        channel: b.channel,
        commissionPct: ch.commission * 100,
        totalCommissionPaid: commissionPaid,
        netRevenue: b.totalRevenue - commissionPaid,
        grossRevenue: b.totalRevenue,
        bookingCount: b.reservationCount,
      };
    });
  }
}

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

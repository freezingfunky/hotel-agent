import { describe, it, expect } from "vitest";
import { MockOtaAdapter } from "../adapters/ota/mock-ota.js";
import { createOtaAdapter } from "../adapters/ota/index.js";

describe("OTA adapter factory", () => {
  it("creates MockOtaAdapter for demo", () => {
    const adapter = createOtaAdapter({ provider: "demo", apiKey: "" });
    expect(adapter).toBeInstanceOf(MockOtaAdapter);
    expect(adapter.name).toBe("Demo OTA (Mock Data)");
  });

  it("throws for unsupported provider", () => {
    expect(() => createOtaAdapter({ provider: "unknown" as never, apiKey: "" }))
      .toThrow(/Unsupported OTA/);
  });
});

describe("MockOtaAdapter", () => {
  const adapter = new MockOtaAdapter();

  it("returns bookings for all 4 channels", async () => {
    const bookings = await adapter.fetchBookingsByChannel({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(bookings.length).toBe(4);
    const channels = bookings.map((b) => b.channel);
    expect(channels).toContain("Direct");
    expect(channels).toContain("Booking.com");
    expect(channels).toContain("Expedia");
    expect(channels).toContain("Airbnb");
  });

  it("channel shares sum to ~100% of total bookings", async () => {
    const bookings = await adapter.fetchBookingsByChannel({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    const total = bookings.reduce((s, b) => s + b.reservationCount, 0);
    expect(total).toBeGreaterThan(100);

    for (const b of bookings) {
      expect(b.reservationCount).toBeGreaterThan(0);
      expect(b.totalRevenue).toBeGreaterThan(0);
      expect(b.avgNightlyRate).toBeGreaterThan(0);
      expect(b.avgLeadTimeDays).toBeGreaterThan(0);
      expect(b.avgLengthOfStay).toBeGreaterThan(0);
      expect(b.cancellationRate).toBeGreaterThanOrEqual(0);
      expect(b.cancellationRate).toBeLessThan(1);
    }
  });

  it("returns commission data per channel", async () => {
    const commissions = await adapter.fetchChannelCommissions({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(commissions.length).toBe(4);

    const direct = commissions.find((c) => c.channel === "Direct")!;
    expect(direct.commissionPct).toBe(0);
    expect(direct.totalCommissionPaid).toBe(0);
    expect(direct.netRevenue).toBe(direct.grossRevenue);

    const booking = commissions.find((c) => c.channel === "Booking.com")!;
    expect(booking.commissionPct).toBe(15);
    expect(booking.totalCommissionPaid).toBeGreaterThan(0);
    expect(booking.netRevenue).toBeLessThan(booking.grossRevenue);
  });

  it("net revenue = gross - commission for every channel", async () => {
    const commissions = await adapter.fetchChannelCommissions({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    for (const c of commissions) {
      expect(c.netRevenue).toBe(c.grossRevenue - c.totalCommissionPaid);
    }
  });

  it("Direct channel has lower cancellation rate than OTA channels", async () => {
    const bookings = await adapter.fetchBookingsByChannel({
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    const direct = bookings.find((b) => b.channel === "Direct")!;
    const bookingCom = bookings.find((b) => b.channel === "Booking.com")!;
    expect(direct.cancellationRate).toBeLessThan(bookingCom.cancellationRate);
  });
});

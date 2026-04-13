import { describe, it, expect } from "vitest";
import { MockRmsAdapter } from "../adapters/rms/mock-rms.js";
import { createRmsAdapter } from "../adapters/rms/index.js";

describe("RMS adapter factory", () => {
  it("creates MockRmsAdapter for demo", () => {
    const adapter = createRmsAdapter({ provider: "demo", apiKey: "" });
    expect(adapter).toBeInstanceOf(MockRmsAdapter);
    expect(adapter.name).toBe("Demo RMS (Mock Data)");
  });

  it("throws for unsupported provider", () => {
    expect(() => createRmsAdapter({ provider: "unknown" as never, apiKey: "" }))
      .toThrow(/Unsupported RMS/);
  });
});

describe("MockRmsAdapter", () => {
  const adapter = new MockRmsAdapter();

  it("returns rate recommendations for a date range", async () => {
    const rates = await adapter.fetchCurrentRates({
      startDate: "2026-04-01",
      endDate: "2026-04-07",
    });

    expect(rates.length).toBeGreaterThan(0);

    for (const r of rates) {
      expect(r.propertyId).toBeTruthy();
      expect(r.propertyName).toBeTruthy();
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.currentRate).toBeGreaterThan(0);
      expect(r.recommendedRate).toBeGreaterThan(0);
      expect(r.minRate).toBeGreaterThan(0);
      expect(r.maxRate).toBeGreaterThan(r.minRate);
      expect(["high", "medium", "low"]).toContain(r.confidence);
      expect(r.reason).toBeTruthy();
      expect(r.currency).toBe("USD");
    }
  });

  it("filters by propertyId", async () => {
    const rates = await adapter.fetchCurrentRates({
      propertyId: "prop_001",
      startDate: "2026-04-01",
      endDate: "2026-04-03",
    });

    expect(rates.length).toBe(3); // 3 days
    for (const r of rates) {
      expect(r.propertyId).toBe("prop_001");
    }
  });

  it("returns pricing history", async () => {
    const history = await adapter.fetchPricingHistory({
      startDate: "2026-04-01",
      endDate: "2026-04-03",
    });

    expect(history.length).toBeGreaterThan(0);

    for (const h of history) {
      expect(h.propertyId).toBeTruthy();
      expect(h.rateSet).toBeGreaterThan(0);
      expect(h.rateRecommended).toBeGreaterThan(0);
      expect(h.occupancyForecast).toBeGreaterThanOrEqual(0);
      expect(h.occupancyForecast).toBeLessThanOrEqual(1);
      expect(["low", "medium", "high", "peak"]).toContain(h.demandLevel);
    }
  });

  it("generates different rates for weekdays vs weekends", async () => {
    // 2026-04-04 is a Saturday, 2026-04-06 is a Monday
    const rates = await adapter.fetchCurrentRates({
      propertyId: "prop_001",
      startDate: "2026-04-04",
      endDate: "2026-04-06",
    });

    const saturday = rates.find((r) => r.date === "2026-04-04");
    const monday = rates.find((r) => r.date === "2026-04-06");
    expect(saturday).toBeDefined();
    expect(monday).toBeDefined();
    // Weekend rate should be higher than weekday
    expect(saturday!.currentRate).toBeGreaterThan(monday!.currentRate);
  });
});

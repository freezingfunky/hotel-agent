import { describe, it, expect } from "vitest";
import { MockStrAdapter } from "../adapters/str/mock-str.js";
import { createStrAdapter } from "../adapters/str/index.js";

describe("STR adapter factory", () => {
  it("creates MockStrAdapter for demo", () => {
    const adapter = createStrAdapter({ provider: "demo", apiKey: "" });
    expect(adapter).toBeInstanceOf(MockStrAdapter);
    expect(adapter.name).toBe("Demo STR (Mock Data)");
  });

  it("throws for unsupported provider", () => {
    expect(() => createStrAdapter({ provider: "unknown" as never, apiKey: "" }))
      .toThrow(/Unsupported STR/);
  });
});

describe("MockStrAdapter", () => {
  const adapter = new MockStrAdapter();

  it("returns market metrics for Austin", async () => {
    const metrics = await adapter.fetchMarketMetrics({
      market: "Austin",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(metrics.market).toBe("Austin");
    expect(metrics.period.start).toBe("2026-03-01");
    expect(metrics.period.end).toBe("2026-03-31");
    expect(metrics.occupancyRate).toBeGreaterThan(0);
    expect(metrics.occupancyRate).toBeLessThan(100);
    expect(metrics.avgDailyRate).toBeGreaterThan(0);
    expect(metrics.revPAR).toBeGreaterThan(0);
    expect(metrics.activeListings).toBeGreaterThan(0);
    expect(metrics.demandScore).toBeGreaterThan(0);
  });

  it("returns different metrics per market", async () => {
    const austin = await adapter.fetchMarketMetrics({ market: "Austin", startDate: "2026-03-01", endDate: "2026-03-31" });
    const nashville = await adapter.fetchMarketMetrics({ market: "Nashville", startDate: "2026-03-01", endDate: "2026-03-31" });

    expect(austin.avgDailyRate).not.toBe(nashville.avgDailyRate);
    expect(austin.activeListings).not.toBe(nashville.activeListings);
  });

  it("returns supply/demand data", async () => {
    const sd = await adapter.fetchSupplyDemand({
      market: "Nashville",
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(sd.market).toBe("Nashville");
    expect(sd.totalListings).toBeGreaterThan(0);
    expect(sd.newListings).toBeGreaterThan(0);
    expect(sd.newListings).toBeLessThan(sd.totalListings);
    expect(sd.delistedCount).toBeGreaterThanOrEqual(0);
    expect(sd.avgBookedNights).toBeGreaterThan(0);
    expect(typeof sd.demandGrowthPct).toBe("number");
    expect(typeof sd.supplyGrowthPct).toBe("number");
  });

  it("revPAR equals occupancyRate * ADR / 100", async () => {
    const m = await adapter.fetchMarketMetrics({ market: "Scottsdale", startDate: "2026-03-01", endDate: "2026-03-31" });
    const expected = Math.round(((m.occupancyRate / 100) * m.avgDailyRate) * 100) / 100;
    expect(m.revPAR).toBeCloseTo(expected, 1);
  });
});

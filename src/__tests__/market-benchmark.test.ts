import { describe, it, expect } from "vitest";
import { marketBenchmark } from "../tools/market-benchmark.js";
import { MockAdapter } from "../mock-adapter.js";
import { MockStrAdapter } from "../adapters/str/mock-str.js";

describe("market_benchmark tool", () => {
  const pms = new MockAdapter();
  const str = new MockStrAdapter();

  it("returns benchmark data for all 3 markets", async () => {
    const result = await marketBenchmark(pms, str, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.dateRange.start).toBe("2026-03-01");
    expect(result.dateRange.end).toBe("2026-03-31");
    expect(result.markets.length).toBe(3);

    const marketNames = result.markets.map((m) => m.market);
    expect(marketNames).toContain("Austin");
    expect(marketNames).toContain("Nashville");
    expect(marketNames).toContain("Scottsdale");
  });

  it("each market has your metrics and market metrics", async () => {
    const result = await marketBenchmark(pms, str, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    for (const m of result.markets) {
      expect(m.yourOccupancy).toBeGreaterThanOrEqual(0);
      expect(m.yourOccupancy).toBeLessThanOrEqual(100);
      expect(m.marketOccupancy).toBeGreaterThan(0);
      expect(m.yourADR).toBeGreaterThanOrEqual(0);
      expect(m.marketADR).toBeGreaterThan(0);
      expect(m.yourRevPAR).toBeGreaterThanOrEqual(0);
      expect(m.marketRevPAR).toBeGreaterThan(0);
      expect(m.activeListings).toBeGreaterThan(0);
    }
  });

  it("gaps are correctly calculated (your - market)", async () => {
    const result = await marketBenchmark(pms, str, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    for (const m of result.markets) {
      expect(m.occupancyGap).toBeCloseTo(m.yourOccupancy - m.marketOccupancy, 0);
      expect(m.adrGap).toBeCloseTo(m.yourADR - m.marketADR, 0);
      expect(m.revparGap).toBeCloseTo(m.yourRevPAR - m.marketRevPAR, 0);
    }
  });

  it("provides an overall assessment string", async () => {
    const result = await marketBenchmark(pms, str, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.overallAssessment).toBeTruthy();
    expect(typeof result.overallAssessment).toBe("string");
  });

  it("verification has HIGH confidence", async () => {
    const result = await marketBenchmark(pms, str, {
      startDate: "2026-03-01",
      endDate: "2026-03-31",
    });

    expect(result.verification.confidence).toBe("HIGH");
    expect(result.verification.corrected).toBe(0);
  });

  it("defaults to 30-day window when no dates provided", async () => {
    const result = await marketBenchmark(pms, str, {});
    const start = new Date(result.dateRange.start);
    const end = new Date(result.dateRange.end);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(days).toBe(30);
  });
});

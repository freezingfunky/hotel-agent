import { describe, it, expect } from "vitest";
import { pricingIntel } from "../tools/pricing-intel.js";
import { MockAdapter } from "../mock-adapter.js";
import { MockRmsAdapter } from "../adapters/rms/mock-rms.js";

describe("pricing_intel tool", () => {
  const pms = new MockAdapter();
  const rms = new MockRmsAdapter();

  it("returns underpriced and overpriced properties", async () => {
    const result = await pricingIntel(pms, rms, {
      startDate: "2026-04-01",
      endDate: "2026-04-14",
    });

    expect(result.dateRange.start).toBe("2026-04-01");
    expect(result.dateRange.end).toBe("2026-04-14");
    expect(result.totalProperties).toBeGreaterThan(0);

    // Should have at least some pricing discrepancies
    const totalFlags = result.underpriced.length + result.overpriced.length;
    expect(totalFlags).toBeGreaterThan(0);
  });

  it("underpriced properties have positive dailyUpsideLost", async () => {
    const result = await pricingIntel(pms, rms, {
      startDate: "2026-04-01",
      endDate: "2026-04-14",
    });

    for (const p of result.underpriced) {
      expect(p.dailyUpsideLost).toBeGreaterThan(0);
      expect(p.recommendedRate).toBeGreaterThan(p.currentRate);
      expect(p.propertyName).toBeTruthy();
      expect(p.confidence).toBeTruthy();
      expect(p.reason).toBeTruthy();
    }
  });

  it("overpriced properties have recommended < current", async () => {
    const result = await pricingIntel(pms, rms, {
      startDate: "2026-04-01",
      endDate: "2026-04-14",
    });

    for (const p of result.overpriced) {
      expect(p.recommendedRate).toBeLessThan(p.currentRate);
      expect(["HIGH", "MEDIUM", "LOW"]).toContain(p.riskLevel);
    }
  });

  it("totalDailyRevenueGap sums underpriced gaps", async () => {
    const result = await pricingIntel(pms, rms, {
      startDate: "2026-04-01",
      endDate: "2026-04-14",
    });

    const sum = result.underpriced.reduce((s, p) => s + p.dailyUpsideLost, 0);
    expect(result.totalDailyRevenueGap).toBe(sum);
  });

  it("underpriced sorted by dailyUpsideLost descending", async () => {
    const result = await pricingIntel(pms, rms, {
      startDate: "2026-04-01",
      endDate: "2026-04-14",
    });

    for (let i = 1; i < result.underpriced.length; i++) {
      expect(result.underpriced[i - 1]!.dailyUpsideLost)
        .toBeGreaterThanOrEqual(result.underpriced[i]!.dailyUpsideLost);
    }
  });

  it("verification has HIGH confidence", async () => {
    const result = await pricingIntel(pms, rms, {
      startDate: "2026-04-01",
      endDate: "2026-04-14",
    });

    expect(result.verification.confidence).toBe("HIGH");
    expect(result.verification.corrected).toBe(0);
    expect(result.verification.propertiesIncluded).toBeGreaterThan(0);
  });

  it("defaults to 30-day window when no dates provided", async () => {
    const result = await pricingIntel(pms, rms, {});
    expect(result.dateRange.start).toBeTruthy();
    expect(result.dateRange.end).toBeTruthy();

    const start = new Date(result.dateRange.start);
    const end = new Date(result.dateRange.end);
    const days = Math.round((end.getTime() - start.getTime()) / 86_400_000);
    expect(days).toBe(30);
  });
});

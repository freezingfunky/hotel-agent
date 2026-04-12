import { describe, it, expect } from "vitest";
import { discoverSchema } from "../tools/discover.js";
import { portfolioHealth } from "../tools/portfolio-health.js";
import { revenueLeaks } from "../tools/revenue-leaks.js";
import { FixtureAdapter } from "./fixtures.js";

const adapter = new FixtureAdapter();

describe("tools integration", () => {
  describe("discoverSchema", () => {
    it("returns correct PMS name and property count", async () => {
      const schema = await discoverSchema(adapter);
      expect(schema.pms).toBe("Test Fixtures");
      expect(schema.propertiesCount).toBe(5); // includes inactive
    });

    it("lists all available tools", async () => {
      const schema = await discoverSchema(adapter);
      const toolNames = schema.tools.map((t) => t.name);
      expect(toolNames).toContain("discover_schema");
      expect(toolNames).toContain("portfolio_health");
      expect(toolNames).toContain("revenue_leaks");
      expect(toolNames).toContain("raw_query");
    });

    it("shows sample property names", async () => {
      const schema = await discoverSchema(adapter);
      expect(schema.samplePropertyNames.length).toBeGreaterThan(0);
      expect(schema.samplePropertyNames.length).toBeLessThanOrEqual(5);
    });
  });

  describe("full portfolio_health flow", () => {
    it("returns complete output shape", async () => {
      const result = await portfolioHealth(adapter, {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      });

      expect(result).toHaveProperty("totalProperties");
      expect(result).toHaveProperty("dateRange");
      expect(result).toHaveProperty("occupancyRate");
      expect(result).toHaveProperty("avgDailyRate");
      expect(result).toHaveProperty("revPAR");
      expect(result).toHaveProperty("totalRevenue");
      expect(result).toHaveProperty("properties");
      expect(result).toHaveProperty("outliers");
      expect(result).toHaveProperty("verification");

      expect(result.dateRange.start).toBe("2026-03-01");
      expect(result.dateRange.end).toBe("2026-03-31");
      expect(result.verification.totalClaims).toBeGreaterThan(0);
    });

    it("all property entries have required fields", async () => {
      const result = await portfolioHealth(adapter, {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      });

      for (const prop of result.properties) {
        expect(prop.propertyId).toBeTruthy();
        expect(prop.propertyName).toBeTruthy();
        expect(typeof prop.occupancyRate).toBe("number");
        expect(typeof prop.avgDailyRate).toBe("number");
        expect(typeof prop.revPAR).toBe("number");
        expect(typeof prop.totalRevenue).toBe("number");
        expect(prop.occupancyRate).toBeGreaterThanOrEqual(0);
        expect(prop.occupancyRate).toBeLessThanOrEqual(100);
      }
    });
  });

  describe("full revenue_leaks flow", () => {
    it("returns complete output shape", async () => {
      const result = await revenueLeaks(adapter, {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      });

      expect(result).toHaveProperty("dateRange");
      expect(result).toHaveProperty("leaks");
      expect(result).toHaveProperty("totalEstimatedLoss");
      expect(result).toHaveProperty("byType");
      expect(result).toHaveProperty("topLeakingProperties");
      expect(result).toHaveProperty("verification");

      expect(result.byType).toHaveProperty("cancellations");
      expect(result.byType).toHaveProperty("noShows");
      expect(result.byType).toHaveProperty("gapNights");
    });

    it("all leak entries have required fields", async () => {
      const result = await revenueLeaks(adapter, {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      });

      for (const leak of result.leaks) {
        expect(["cancellation", "no-show", "gap-night"]).toContain(leak.type);
        expect(leak.propertyId).toBeTruthy();
        expect(leak.propertyName).toBeTruthy();
        expect(leak.estimatedLoss).toBeGreaterThan(0);
        expect(leak.details).toBeTruthy();
      }
    });
  });

  describe("date range filtering", () => {
    it("excludes reservations entirely outside window", async () => {
      const result = await portfolioHealth(adapter, {
        startDate: "2020-01-01",
        endDate: "2020-01-31",
      });
      expect(result.totalBookedNights).toBe(0);
      expect(result.totalRevenue).toBe(0);
    });

    it("different date ranges produce different results", async () => {
      const march = await portfolioHealth(adapter, {
        startDate: "2026-03-01",
        endDate: "2026-03-31",
      });
      const narrow = await portfolioHealth(adapter, {
        startDate: "2026-03-01",
        endDate: "2026-03-10",
      });
      expect(march.totalRevenue).toBeGreaterThan(narrow.totalRevenue);
    });
  });
});

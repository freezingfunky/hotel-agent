import { describe, it, expect } from "vitest";
import { portfolioHealth } from "../tools/portfolio-health.js";
import {
  FixtureAdapter,
  TEST_START,
  TEST_END,
  TEST_ACTIVE_PROPERTIES,
  TEST_AVAILABLE_NIGHTS,
  EXPECTED_BOOKED_NIGHTS,
  EXPECTED_REVENUE,
  EXPECTED_OCCUPANCY,
  EXPECTED_ADR,
  EXPECTED_REVPAR,
} from "./fixtures.js";

const adapter = new FixtureAdapter();

describe("portfolioHealth", () => {
  it("calculates correct occupancy rate", async () => {
    const result = await portfolioHealth(adapter, { startDate: TEST_START, endDate: TEST_END });
    expect(result.occupancyRate).toBeCloseTo(EXPECTED_OCCUPANCY, 0);
  });

  it("calculates correct ADR", async () => {
    const result = await portfolioHealth(adapter, { startDate: TEST_START, endDate: TEST_END });
    expect(result.avgDailyRate).toBeCloseTo(EXPECTED_ADR, 0);
  });

  it("calculates correct RevPAR", async () => {
    const result = await portfolioHealth(adapter, { startDate: TEST_START, endDate: TEST_END });
    expect(result.revPAR).toBeCloseTo(EXPECTED_REVPAR, 0);
  });

  it("counts only active properties", async () => {
    const result = await portfolioHealth(adapter, { startDate: TEST_START, endDate: TEST_END });
    expect(result.totalProperties).toBe(TEST_ACTIVE_PROPERTIES);
    expect(result.totalAvailableNights).toBe(TEST_AVAILABLE_NIGHTS);
  });

  it("returns per-property breakdown", async () => {
    const result = await portfolioHealth(adapter, { startDate: TEST_START, endDate: TEST_END });
    expect(result.properties).toHaveLength(TEST_ACTIVE_PROPERTIES);

    const prop001 = result.properties.find((p) => p.propertyId === "prop_001");
    expect(prop001).toBeDefined();
    expect(prop001!.reservationCount).toBeGreaterThan(0);
    expect(prop001!.bookedNights).toBeGreaterThan(0);
  });

  it("detects outliers", async () => {
    const result = await portfolioHealth(adapter, { startDate: TEST_START, endDate: TEST_END });
    // prop_003 has only 10 booked nights (32% occ) vs others around 50-80%
    // prop_004 has low ADR ($100) vs others ($200-300)
    expect(result.outliers.length).toBeGreaterThan(0);
    const outlierIds = result.outliers.map((o) => o.propertyId);
    expect(outlierIds).toContain("prop_004"); // ADR outlier ($100 vs $200+ avg)
  });

  it("verification passes with HIGH confidence", async () => {
    const result = await portfolioHealth(adapter, { startDate: TEST_START, endDate: TEST_END });
    expect(result.verification.confidence).toBe("HIGH");
    expect(result.verification.verified).toBe(result.verification.totalClaims);
  });

  it("handles empty date range gracefully", async () => {
    const result = await portfolioHealth(adapter, {
      startDate: "2020-01-01",
      endDate: "2020-01-31",
    });
    expect(result.occupancyRate).toBe(0);
    expect(result.totalRevenue).toBe(0);
    expect(result.totalProperties).toBe(TEST_ACTIVE_PROPERTIES);
  });

  it("includes pro-rated boundary reservations", async () => {
    const result = await portfolioHealth(adapter, { startDate: TEST_START, endDate: TEST_END });
    const prop003 = result.properties.find((p) => p.propertyId === "prop_003");
    expect(prop003).toBeDefined();
    // prop_003: res_007 (5n) + res_008 (5n) + res_019 (4n pro-rated from 8n boundary) = 14
    expect(prop003!.bookedNights).toBe(14);
    // Revenue: $1500 + $1500 + $1200 (pro-rated 4/8 of $2400) = $4200
    expect(prop003!.totalRevenue).toBe(4200);
  });
});

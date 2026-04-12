import { describe, it, expect } from "vitest";
import { revenueLeaks } from "../tools/revenue-leaks.js";
import {
  FixtureAdapter,
  TEST_START,
  TEST_END,
  EXPECTED_CANCELLATION_COUNT,
  EXPECTED_NOSHOW_COUNT,
  EXPECTED_GAP_COUNT,
} from "./fixtures.js";

const adapter = new FixtureAdapter();

describe("revenueLeaks", () => {
  it("finds all cancellations", async () => {
    const result = await revenueLeaks(adapter, { startDate: TEST_START, endDate: TEST_END });
    expect(result.byType.cancellations.count).toBe(EXPECTED_CANCELLATION_COUNT);
  });

  it("finds all no-shows", async () => {
    const result = await revenueLeaks(adapter, { startDate: TEST_START, endDate: TEST_END });
    expect(result.byType.noShows.count).toBe(EXPECTED_NOSHOW_COUNT);
  });

  it("finds gap nights (1-7 day gaps only)", async () => {
    const result = await revenueLeaks(adapter, { startDate: TEST_START, endDate: TEST_END });
    // prop_001: 2 gaps (2 nights + 2 nights), prop_002: 1 gap (4 nights)
    // prop_003 gap is 10 days (excluded), prop_004 has no gaps
    expect(result.byType.gapNights.count).toBe(EXPECTED_GAP_COUNT);
  });

  it("calculates total estimated loss", async () => {
    const result = await revenueLeaks(adapter, { startDate: TEST_START, endDate: TEST_END });
    expect(result.totalEstimatedLoss).toBeGreaterThan(0);
    // Sum of all three types
    const typeSum =
      result.byType.cancellations.loss +
      result.byType.noShows.loss +
      result.byType.gapNights.loss;
    expect(result.totalEstimatedLoss).toBe(typeSum);
  });

  it("ranks leaks by dollar impact descending", async () => {
    const result = await revenueLeaks(adapter, { startDate: TEST_START, endDate: TEST_END });
    for (let i = 1; i < result.leaks.length; i++) {
      expect(result.leaks[i - 1]!.estimatedLoss).toBeGreaterThanOrEqual(
        result.leaks[i]!.estimatedLoss,
      );
    }
  });

  it("identifies top leaking properties", async () => {
    const result = await revenueLeaks(adapter, { startDate: TEST_START, endDate: TEST_END });
    expect(result.topLeakingProperties.length).toBeGreaterThan(0);
    // Top leaker should have the highest total loss
    for (let i = 1; i < result.topLeakingProperties.length; i++) {
      expect(result.topLeakingProperties[i - 1]!.totalLoss).toBeGreaterThanOrEqual(
        result.topLeakingProperties[i]!.totalLoss,
      );
    }
  });

  it("filters by minimum impact", async () => {
    const result = await revenueLeaks(adapter, {
      startDate: TEST_START,
      endDate: TEST_END,
      minImpact: 1000,
    });
    for (const leak of result.leaks) {
      expect(leak.estimatedLoss).toBeGreaterThanOrEqual(1000);
    }
  });

  it("returns zero loss for clean date range", async () => {
    const result = await revenueLeaks(adapter, {
      startDate: "2020-01-01",
      endDate: "2020-01-31",
    });
    expect(result.totalEstimatedLoss).toBe(0);
    expect(result.leaks).toHaveLength(0);
  });

  it("verification passes", async () => {
    const result = await revenueLeaks(adapter, { startDate: TEST_START, endDate: TEST_END });
    expect(result.verification.confidence).toBe("HIGH");
  });

  it("includes cancellation reason in details", async () => {
    const result = await revenueLeaks(adapter, { startDate: TEST_START, endDate: TEST_END });
    const cancellation = result.leaks.find((l) => l.type === "cancellation");
    expect(cancellation).toBeDefined();
    expect(cancellation!.details).toBeTruthy();
  });
});

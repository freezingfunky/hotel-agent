import { describe, it, expect } from "vitest";
import { verifyPortfolioHealth, verifyLeaks, sanityCheck } from "../verify.js";
import {
  TEST_PROPERTIES,
  TEST_RESERVATIONS,
  TEST_START,
  TEST_END,
  EXPECTED_OCCUPANCY,
  EXPECTED_ADR,
  EXPECTED_REVPAR,
  EXPECTED_REVENUE,
  EXPECTED_BOOKED_NIGHTS,
  TEST_AVAILABLE_NIGHTS,
} from "./fixtures.js";

describe("verifyPortfolioHealth", () => {
  const confirmedReservations = TEST_RESERVATIONS.filter((r) =>
    ["confirmed", "checked-in", "checked-out", "reserved"].includes(r.status.toLowerCase()),
  );

  it("returns HIGH confidence when numbers are correct", () => {
    const { corrected, verification } = verifyPortfolioHealth(
      {
        occupancyRate: EXPECTED_OCCUPANCY,
        avgDailyRate: EXPECTED_ADR,
        revPAR: EXPECTED_REVPAR,
        totalRevenue: EXPECTED_REVENUE,
        totalBookedNights: EXPECTED_BOOKED_NIGHTS,
        totalAvailableNights: TEST_AVAILABLE_NIGHTS,
      },
      confirmedReservations,
      TEST_PROPERTIES,
      TEST_START,
      TEST_END,
    );

    expect(verification.confidence).toBe("HIGH");
    expect(verification.corrected).toBe(0);
    expect(verification.corrections).toHaveLength(0);
    expect(corrected.occupancyRate).toBeCloseTo(EXPECTED_OCCUPANCY, 0);
    expect(corrected.avgDailyRate).toBeCloseTo(EXPECTED_ADR, 0);
  });

  it("catches and corrects wrong occupancy rate", () => {
    const { corrected, verification } = verifyPortfolioHealth(
      {
        occupancyRate: 90.0, // intentionally wrong
        avgDailyRate: EXPECTED_ADR,
        revPAR: EXPECTED_REVPAR,
        totalRevenue: EXPECTED_REVENUE,
        totalBookedNights: EXPECTED_BOOKED_NIGHTS,
        totalAvailableNights: TEST_AVAILABLE_NIGHTS,
      },
      confirmedReservations,
      TEST_PROPERTIES,
      TEST_START,
      TEST_END,
    );

    expect(verification.corrected).toBeGreaterThan(0);
    expect(verification.corrections.some((c) => c.includes("Occupancy"))).toBe(true);
    expect(corrected.occupancyRate).not.toBe(90.0);
  });

  it("catches and corrects wrong revenue", () => {
    const { corrected, verification } = verifyPortfolioHealth(
      {
        occupancyRate: EXPECTED_OCCUPANCY,
        avgDailyRate: EXPECTED_ADR,
        revPAR: EXPECTED_REVPAR,
        totalRevenue: 99999, // intentionally wrong
        totalBookedNights: EXPECTED_BOOKED_NIGHTS,
        totalAvailableNights: TEST_AVAILABLE_NIGHTS,
      },
      confirmedReservations,
      TEST_PROPERTIES,
      TEST_START,
      TEST_END,
    );

    expect(verification.corrections.some((c) => c.includes("Revenue"))).toBe(true);
    expect(corrected.totalRevenue).not.toBe(99999);
  });

  it("excludes inactive properties from available nights", () => {
    const { corrected } = verifyPortfolioHealth(
      {
        occupancyRate: 0,
        avgDailyRate: 0,
        revPAR: 0,
        totalRevenue: 0,
        totalBookedNights: 0,
        totalAvailableNights: 0,
      },
      confirmedReservations,
      TEST_PROPERTIES,
      TEST_START,
      TEST_END,
    );

    // 4 active properties x 31 days = 124 (not 5 x 31 = 155)
    expect(corrected.totalAvailableNights).toBe(TEST_AVAILABLE_NIGHTS);
  });

  it("excludes cancelled/no-show reservations from booked nights", () => {
    const allReservations = TEST_RESERVATIONS; // includes cancelled + no-show
    const { corrected } = verifyPortfolioHealth(
      {
        occupancyRate: 0,
        avgDailyRate: 0,
        revPAR: 0,
        totalRevenue: 0,
        totalBookedNights: 0,
        totalAvailableNights: 0,
      },
      allReservations,
      TEST_PROPERTIES,
      TEST_START,
      TEST_END,
    );

    // Only confirmed/checked-in/checked-out count
    expect(corrected.totalBookedNights).toBe(EXPECTED_BOOKED_NIGHTS);
  });

  it("pro-rates revenue for reservations spanning window boundary", () => {
    // res_019 spans Feb 25 - Mar 5 (8 nights, $2400)
    // Only 4 nights fall within Mar 1-31, so $1200 pro-rated
    const boundaryRes = TEST_RESERVATIONS.filter((r) => r.id === "res_019");
    const { corrected } = verifyPortfolioHealth(
      { occupancyRate: 0, avgDailyRate: 0, revPAR: 0, totalRevenue: 0, totalBookedNights: 0, totalAvailableNights: 0 },
      boundaryRes,
      TEST_PROPERTIES.slice(0, 1),
      TEST_START,
      TEST_END,
    );

    expect(corrected.totalBookedNights).toBe(4);
    expect(corrected.totalRevenue).toBe(1200);
  });
});

describe("verifyLeaks", () => {
  it("returns HIGH confidence when total matches", () => {
    const leaks = [
      { estimatedLoss: 500, type: "cancellation" },
      { estimatedLoss: 300, type: "gap-night" },
    ];
    const { correctedTotal, verification } = verifyLeaks(800, leaks);

    expect(verification.confidence).toBe("HIGH");
    expect(correctedTotal).toBe(800);
    expect(verification.corrected).toBe(0);
  });

  it("corrects mismatched total", () => {
    const leaks = [
      { estimatedLoss: 500, type: "cancellation" },
      { estimatedLoss: 300, type: "gap-night" },
    ];
    const { correctedTotal, verification } = verifyLeaks(9999, leaks);

    expect(correctedTotal).toBe(800);
    expect(verification.corrected).toBe(1);
    expect(verification.corrections!.some((c) => c.includes("9999"))).toBe(true);
  });
});

describe("sanityCheck", () => {
  it("flags occupancy over 100%", () => {
    const warnings = sanityCheck({ occupancyRate: 105 });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("exceeds 100%");
  });

  it("flags negative occupancy", () => {
    const warnings = sanityCheck({ occupancyRate: -5 });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("negative");
  });

  it("flags unusually high ADR", () => {
    const warnings = sanityCheck({ avgDailyRate: 15000 });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("unusually high");
  });

  it("flags unusually low ADR", () => {
    const warnings = sanityCheck({ avgDailyRate: 5 });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain("unusually low");
  });

  it("returns no warnings for normal values", () => {
    const warnings = sanityCheck({ occupancyRate: 75, avgDailyRate: 200 });
    expect(warnings).toHaveLength(0);
  });
});

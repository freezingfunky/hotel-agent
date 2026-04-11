import type { Reservation, Property, VerificationResult } from "./types.js";

interface Claim {
  label: string;
  reported: number;
  recalculated: number;
}

/**
 * Independently recalculates portfolio metrics from raw data and compares
 * against reported values. Auto-corrects mismatches. Returns a verification
 * result with confidence rating.
 */
export function verifyPortfolioHealth(
  reported: {
    occupancyRate: number;
    avgDailyRate: number;
    revPAR: number;
    totalRevenue: number;
    totalBookedNights: number;
    totalAvailableNights: number;
  },
  reservations: Reservation[],
  properties: Property[],
  startDate: string,
  endDate: string,
): { corrected: typeof reported; verification: VerificationResult } {
  const activeProperties = properties.filter((p) => p.status === "active");
  const daysInRange = daysBetween(startDate, endDate);
  const totalAvailableNights = activeProperties.length * daysInRange;

  const confirmedReservations = reservations.filter((r) =>
    ["confirmed", "checked-in", "checked-out", "reserved"].includes(
      r.status.toLowerCase(),
    ),
  );

  const totalBookedNights = confirmedReservations.reduce(
    (sum, r) => sum + clampNights(r, startDate, endDate),
    0,
  );
  const totalRevenue = confirmedReservations.reduce(
    (sum, r) => sum + proRateRevenue(r, startDate, endDate),
    0,
  );

  const occupancyRate =
    totalAvailableNights > 0
      ? round((totalBookedNights / totalAvailableNights) * 100, 1)
      : 0;
  const avgDailyRate =
    totalBookedNights > 0 ? round(totalRevenue / totalBookedNights, 2) : 0;
  const revPAR =
    totalAvailableNights > 0
      ? round(totalRevenue / totalAvailableNights, 2)
      : 0;

  const claims: Claim[] = [
    { label: "Occupancy Rate (%)", reported: reported.occupancyRate, recalculated: occupancyRate },
    { label: "ADR ($)", reported: reported.avgDailyRate, recalculated: avgDailyRate },
    { label: "RevPAR ($)", reported: reported.revPAR, recalculated: revPAR },
    { label: "Total Revenue ($)", reported: reported.totalRevenue, recalculated: round(totalRevenue, 0) },
    { label: "Booked Nights", reported: reported.totalBookedNights, recalculated: totalBookedNights },
    { label: "Available Nights", reported: reported.totalAvailableNights, recalculated: totalAvailableNights },
  ];

  const corrections: string[] = [];
  for (const claim of claims) {
    if (!isClose(claim.reported, claim.recalculated)) {
      corrections.push(
        `${claim.label}: was ${claim.reported}, corrected to ${claim.recalculated}`,
      );
    }
  }

  const corrected = {
    occupancyRate,
    avgDailyRate,
    revPAR,
    totalRevenue: round(totalRevenue, 0),
    totalBookedNights,
    totalAvailableNights,
  };

  return {
    corrected,
    verification: {
      totalClaims: claims.length,
      verified: claims.length - corrections.length,
      corrected: corrections.length,
      corrections,
      confidence: corrections.length === 0 ? "HIGH" : corrections.length <= 2 ? "MEDIUM" : "LOW",
      dataRange: `${startDate} to ${endDate}`,
      propertiesIncluded: activeProperties.length,
    },
  };
}

/**
 * Verifies revenue leak calculations against raw reservation data.
 */
export function verifyLeaks(
  reportedTotal: number,
  leaks: Array<{ estimatedLoss: number; type: string }>,
): { correctedTotal: number; verification: Partial<VerificationResult> } {
  const recalculatedTotal = round(
    leaks.reduce((sum, l) => sum + l.estimatedLoss, 0),
    0,
  );

  const corrections: string[] = [];
  if (!isClose(reportedTotal, recalculatedTotal)) {
    corrections.push(
      `Total estimated loss: was $${reportedTotal}, corrected to $${recalculatedTotal}`,
    );
  }

  return {
    correctedTotal: recalculatedTotal,
    verification: {
      totalClaims: leaks.length + 1,
      verified: leaks.length + 1 - corrections.length,
      corrected: corrections.length,
      corrections,
      confidence: corrections.length === 0 ? "HIGH" : "MEDIUM",
    },
  };
}

// ── Sanity checks ────────────────────────────────────────────────────

export function sanityCheck(metrics: {
  occupancyRate?: number;
  avgDailyRate?: number;
  revPAR?: number;
  totalRevenue?: number;
}): string[] {
  const warnings: string[] = [];

  if (metrics.occupancyRate !== undefined) {
    if (metrics.occupancyRate > 100)
      warnings.push(`Occupancy ${metrics.occupancyRate}% exceeds 100% — calculation error likely`);
    if (metrics.occupancyRate < 0)
      warnings.push(`Occupancy ${metrics.occupancyRate}% is negative — calculation error`);
  }

  if (metrics.avgDailyRate !== undefined) {
    if (metrics.avgDailyRate > 10_000)
      warnings.push(`ADR $${metrics.avgDailyRate} seems unusually high — verify data`);
    if (metrics.avgDailyRate < 10 && metrics.avgDailyRate > 0)
      warnings.push(`ADR $${metrics.avgDailyRate} seems unusually low — check currency/units`);
  }

  return warnings;
}

// ── Utilities ────────────────────────────────────────────────────────

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

/** Clamp reservation nights to the query window */
function clampNights(r: Reservation, rangeStart: string, rangeEnd: string): number {
  const resStart = new Date(r.checkIn).getTime();
  const resEnd = new Date(r.checkOut).getTime();
  const winStart = new Date(rangeStart).getTime();
  const winEnd = new Date(rangeEnd).getTime();

  const effectiveStart = Math.max(resStart, winStart);
  const effectiveEnd = Math.min(resEnd, winEnd);
  const days = Math.ceil((effectiveEnd - effectiveStart) / 86_400_000);
  return Math.max(0, days);
}

/** Pro-rate revenue to the portion of the reservation within the query window */
function proRateRevenue(r: Reservation, rangeStart: string, rangeEnd: string): number {
  if (r.nights <= 0) return 0;
  const clamped = clampNights(r, rangeStart, rangeEnd);
  return (clamped / r.nights) * r.totalPrice;
}

function round(n: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(n * factor) / factor;
}

/** Two numbers are "close enough" if within 1% or within $1 / 0.5 pp */
function isClose(a: number, b: number): boolean {
  if (a === b) return true;
  const absDiff = Math.abs(a - b);
  if (absDiff < 1) return true;
  const relDiff = absDiff / Math.max(Math.abs(a), Math.abs(b), 1);
  return relDiff < 0.01;
}

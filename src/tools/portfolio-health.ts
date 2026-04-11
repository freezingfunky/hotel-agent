import type {
  PmsAdapter,
  PropertyHealth,
  PortfolioHealthResult,
  Reservation,
  Property,
} from "../types.js";
import { verifyPortfolioHealth, sanityCheck } from "../verify.js";

interface HealthParams {
  startDate?: string;
  endDate?: string;
  compareWith?: "previous-period" | "same-period-last-year";
}

export async function portfolioHealth(
  adapter: PmsAdapter,
  params: HealthParams,
): Promise<PortfolioHealthResult> {
  const now = new Date();
  const endDate = params.endDate ?? toISO(now);
  const startDate =
    params.startDate ?? toISO(new Date(now.getTime() - 30 * 86_400_000));

  const [properties, reservations] = await Promise.all([
    adapter.fetchProperties(),
    adapter.fetchReservations({ startDate, endDate }),
  ]);

  const activeProperties = properties.filter((p) => p.status === "active");
  const daysInRange = daysBetween(startDate, endDate);
  const confirmed = reservations.filter((r) =>
    ["confirmed", "checked-in", "checked-out", "reserved"].includes(
      r.status.toLowerCase(),
    ),
  );

  const perProperty = computePerProperty(
    activeProperties,
    confirmed,
    daysInRange,
    startDate,
    endDate,
  );

  const totalAvailableNights = activeProperties.length * daysInRange;
  const totalBookedNights = perProperty.reduce(
    (s, p) => s + p.bookedNights,
    0,
  );
  const totalRevenue = perProperty.reduce((s, p) => s + p.totalRevenue, 0);

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

  // Verify all numbers independently
  const { corrected, verification } = verifyPortfolioHealth(
    { occupancyRate, avgDailyRate, revPAR, totalRevenue, totalBookedNights, totalAvailableNights },
    confirmed,
    properties,
    startDate,
    endDate,
  );

  const warnings = sanityCheck(corrected);
  if (warnings.length > 0) {
    verification.corrections.push(...warnings);
    verification.confidence = "LOW";
  }

  // Find outliers (>1 std dev from mean occupancy or ADR)
  const outliers = findOutliers(perProperty);

  // Optional comparison
  let comparison: PortfolioHealthResult["comparison"];
  if (params.compareWith) {
    comparison = await computeComparison(
      adapter,
      properties,
      startDate,
      endDate,
      params.compareWith,
      corrected,
    );
  }

  return {
    totalProperties: activeProperties.length,
    dateRange: { start: startDate, end: endDate },
    occupancyRate: corrected.occupancyRate,
    avgDailyRate: corrected.avgDailyRate,
    revPAR: corrected.revPAR,
    totalRevenue: corrected.totalRevenue,
    totalBookedNights: corrected.totalBookedNights,
    totalAvailableNights: corrected.totalAvailableNights,
    properties: perProperty,
    outliers,
    comparison,
    verification,
  };
}

// ── Per-property computation ─────────────────────────────────────────

function computePerProperty(
  properties: Property[],
  reservations: Reservation[],
  daysInRange: number,
  rangeStart: string,
  rangeEnd: string,
): PropertyHealth[] {
  const resByProperty = new Map<string, Reservation[]>();
  for (const r of reservations) {
    const list = resByProperty.get(r.propertyId) ?? [];
    list.push(r);
    resByProperty.set(r.propertyId, list);
  }

  return properties.map((prop) => {
    const propReservations = resByProperty.get(prop.id) ?? [];
    const bookedNights = propReservations.reduce(
      (sum, r) => sum + clampNights(r, rangeStart, rangeEnd),
      0,
    );
    const totalRevenue = propReservations.reduce(
      (sum, r) => sum + proRateRevenue(r, rangeStart, rangeEnd),
      0,
    );
    const availableNights = daysInRange;

    return {
      propertyId: prop.id,
      propertyName: prop.name,
      occupancyRate:
        availableNights > 0
          ? round((bookedNights / availableNights) * 100, 1)
          : 0,
      avgDailyRate:
        bookedNights > 0 ? round(totalRevenue / bookedNights, 2) : 0,
      revPAR:
        availableNights > 0
          ? round(totalRevenue / availableNights, 2)
          : 0,
      totalRevenue: round(totalRevenue, 0),
      bookedNights,
      availableNights,
      reservationCount: propReservations.length,
    };
  });
}

// ── Outlier detection ────────────────────────────────────────────────

function findOutliers(
  properties: PropertyHealth[],
): Array<PropertyHealth & { reason: string }> {
  if (properties.length < 3) return [];

  const occRates = properties.map((p) => p.occupancyRate);
  const adrValues = properties.map((p) => p.avgDailyRate);

  const occMean = mean(occRates);
  const occStd = stddev(occRates);
  const adrMean = mean(adrValues);
  const adrStd = stddev(adrValues);

  const outliers: Array<PropertyHealth & { reason: string }> = [];

  for (const prop of properties) {
    const reasons: string[] = [];

    if (occStd > 0 && Math.abs(prop.occupancyRate - occMean) > occStd) {
      const dir = prop.occupancyRate < occMean ? "below" : "above";
      const diff = round(Math.abs(prop.occupancyRate - occMean), 1);
      reasons.push(`Occupancy ${diff}pp ${dir} portfolio average (${round(occMean, 1)}%)`);
    }

    if (adrStd > 0 && Math.abs(prop.avgDailyRate - adrMean) > adrStd) {
      const dir = prop.avgDailyRate < adrMean ? "below" : "above";
      const diff = round(Math.abs(prop.avgDailyRate - adrMean), 0);
      reasons.push(`ADR $${diff} ${dir} portfolio average ($${round(adrMean, 0)})`);
    }

    if (reasons.length > 0) {
      outliers.push({ ...prop, reason: reasons.join("; ") });
    }
  }

  return outliers.sort(
    (a, b) => a.occupancyRate - b.occupancyRate,
  );
}

// ── Comparison ───────────────────────────────────────────────────────

async function computeComparison(
  adapter: PmsAdapter,
  properties: Property[],
  startDate: string,
  endDate: string,
  mode: "previous-period" | "same-period-last-year",
  current: { occupancyRate: number; avgDailyRate: number; revPAR: number; totalRevenue: number },
): Promise<PortfolioHealthResult["comparison"]> {
  const days = daysBetween(startDate, endDate);
  let compStart: string;
  let compEnd: string;

  if (mode === "previous-period") {
    const s = new Date(startDate);
    s.setDate(s.getDate() - days);
    compStart = toISO(s);
    compEnd = startDate;
  } else {
    const s = new Date(startDate);
    s.setFullYear(s.getFullYear() - 1);
    const e = new Date(endDate);
    e.setFullYear(e.getFullYear() - 1);
    compStart = toISO(s);
    compEnd = toISO(e);
  }

  const compReservations = await adapter.fetchReservations({
    startDate: compStart,
    endDate: compEnd,
  });

  const activeProps = properties.filter((p) => p.status === "active");
  const confirmed = compReservations.filter((r) =>
    ["confirmed", "checked-in", "checked-out", "reserved"].includes(r.status.toLowerCase()),
  );

  const compDays = daysBetween(compStart, compEnd);
  const compAvailable = activeProps.length * compDays;
  const compBooked = confirmed.reduce(
    (sum, r) => sum + clampNights(r, compStart, compEnd),
    0,
  );
  const compRevenue = confirmed.reduce(
    (sum, r) => sum + proRateRevenue(r, compStart, compEnd),
    0,
  );

  const compOcc = compAvailable > 0 ? round((compBooked / compAvailable) * 100, 1) : 0;
  const compAdr = compBooked > 0 ? round(compRevenue / compBooked, 2) : 0;
  const compRevPAR = compAvailable > 0 ? round(compRevenue / compAvailable, 2) : 0;

  return {
    period: `${compStart} to ${compEnd}`,
    occupancyChange: round(current.occupancyRate - compOcc, 1),
    adrChange: round(current.avgDailyRate - compAdr, 2),
    revPARChange: round(current.revPAR - compRevPAR, 2),
    revenueChange: round(current.totalRevenue - compRevenue, 0),
  };
}

// ── Utilities ────────────────────────────────────────────────────────

function daysBetween(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

function clampNights(r: Reservation, rangeStart: string, rangeEnd: string): number {
  const resStart = new Date(r.checkIn).getTime();
  const resEnd = new Date(r.checkOut).getTime();
  const winStart = new Date(rangeStart).getTime();
  const winEnd = new Date(rangeEnd).getTime();
  const effectiveStart = Math.max(resStart, winStart);
  const effectiveEnd = Math.min(resEnd, winEnd);
  return Math.max(0, Math.ceil((effectiveEnd - effectiveStart) / 86_400_000));
}

function proRateRevenue(r: Reservation, rangeStart: string, rangeEnd: string): number {
  if (r.nights <= 0) return 0;
  return (clampNights(r, rangeStart, rangeEnd) / r.nights) * r.totalPrice;
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function mean(arr: number[]): number {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

function toISO(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

import type {
  PmsAdapter,
  Reservation,
  RevenueLeak,
  RevenueLeaksResult,
  VerificationResult,
} from "../types.js";
import { verifyLeaks, sanityCheck } from "../verify.js";

interface LeakParams {
  startDate?: string;
  endDate?: string;
  minImpact?: number;
}

export async function revenueLeaks(
  adapter: PmsAdapter,
  params: LeakParams,
): Promise<RevenueLeaksResult> {
  const now = new Date();
  const endDate = params.endDate ?? toISO(now);
  const startDate =
    params.startDate ?? toISO(new Date(now.getTime() - 30 * 86_400_000));

  const [properties, allReservations] = await Promise.all([
    adapter.fetchProperties(),
    adapter.fetchReservations({ startDate, endDate }),
  ]);

  // Compute average nightly rate per property for loss estimation
  const avgRateByProperty = computeAvgRates(allReservations);
  const portfolioAvgRate = computePortfolioAvgRate(allReservations);

  const leaks: RevenueLeak[] = [];

  // 1. Cancellations
  const cancellations = allReservations.filter((r) =>
    r.status.toLowerCase().includes("cancel"),
  );
  for (const res of cancellations) {
    const rate = avgRateByProperty.get(res.propertyId) ?? portfolioAvgRate;
    const estimatedLoss = round(rate * res.nights, 0);
    leaks.push({
      type: "cancellation",
      propertyId: res.propertyId,
      propertyName: res.propertyName,
      estimatedLoss,
      details:
        `Cancelled reservation for ${res.guestName}: ${res.checkIn} to ${res.checkOut} (${res.nights} nights). ` +
        `Estimated loss at $${round(rate, 0)}/night avg rate.` +
        (res.cancellationReason ? ` Reason: ${res.cancellationReason}` : ""),
      date: res.cancelledAt ?? res.checkIn,
      nights: res.nights,
    });
  }

  // 2. No-shows
  const noShows = allReservations.filter(
    (r) =>
      r.status.toLowerCase().includes("no-show") ||
      r.status.toLowerCase().includes("noshow"),
  );
  for (const res of noShows) {
    const rate = avgRateByProperty.get(res.propertyId) ?? portfolioAvgRate;
    const estimatedLoss = round(rate * res.nights, 0);
    leaks.push({
      type: "no-show",
      propertyId: res.propertyId,
      propertyName: res.propertyName,
      estimatedLoss,
      details:
        `No-show: ${res.guestName} was expected ${res.checkIn} to ${res.checkOut} (${res.nights} nights). ` +
        `Estimated loss at $${round(rate, 0)}/night avg rate.`,
      date: res.checkIn,
      nights: res.nights,
    });
  }

  // 3. Gap nights (empty nights between consecutive bookings at the same property)
  const gapLeaks = findGapNights(
    allReservations,
    properties,
    avgRateByProperty,
    portfolioAvgRate,
    startDate,
    endDate,
  );
  leaks.push(...gapLeaks);

  // Apply minimum impact filter
  const minImpact = params.minImpact ?? 0;
  const filteredLeaks = leaks.filter((l) => l.estimatedLoss >= minImpact);

  // Sort by dollar impact descending
  filteredLeaks.sort((a, b) => b.estimatedLoss - a.estimatedLoss);

  // Aggregate by type
  const cancellationLeaks = filteredLeaks.filter((l) => l.type === "cancellation");
  const noShowLeaks = filteredLeaks.filter((l) => l.type === "no-show");
  const gapNightLeaks = filteredLeaks.filter((l) => l.type === "gap-night");

  const rawTotal = filteredLeaks.reduce((s, l) => s + l.estimatedLoss, 0);

  // Verify
  const { correctedTotal, verification: partialVerification } = verifyLeaks(
    rawTotal,
    filteredLeaks,
  );

  const verification: VerificationResult = {
    totalClaims: partialVerification.totalClaims ?? filteredLeaks.length + 1,
    verified: partialVerification.verified ?? filteredLeaks.length + 1,
    corrected: partialVerification.corrected ?? 0,
    corrections: partialVerification.corrections ?? [],
    confidence: partialVerification.confidence ?? "HIGH",
    dataRange: `${startDate} to ${endDate}`,
    propertiesIncluded: properties.filter((p) => p.status === "active").length,
  };

  // Top leaking properties
  const lossByProperty = new Map<string, { name: string; loss: number }>();
  for (const leak of filteredLeaks) {
    const existing = lossByProperty.get(leak.propertyId) ?? {
      name: leak.propertyName,
      loss: 0,
    };
    existing.loss += leak.estimatedLoss;
    lossByProperty.set(leak.propertyId, existing);
  }
  const topLeaking = Array.from(lossByProperty.entries())
    .map(([id, { name, loss }]) => ({ propertyId: id, propertyName: name, totalLoss: round(loss, 0) }))
    .sort((a, b) => b.totalLoss - a.totalLoss)
    .slice(0, 10);

  return {
    dateRange: { start: startDate, end: endDate },
    leaks: filteredLeaks,
    totalEstimatedLoss: correctedTotal,
    byType: {
      cancellations: {
        count: cancellationLeaks.length,
        loss: round(cancellationLeaks.reduce((s, l) => s + l.estimatedLoss, 0), 0),
      },
      noShows: {
        count: noShowLeaks.length,
        loss: round(noShowLeaks.reduce((s, l) => s + l.estimatedLoss, 0), 0),
      },
      gapNights: {
        count: gapNightLeaks.length,
        loss: round(gapNightLeaks.reduce((s, l) => s + l.estimatedLoss, 0), 0),
      },
    },
    topLeakingProperties: topLeaking,
    verification,
  };
}

// ── Gap night detection ──────────────────────────────────────────────

function findGapNights(
  reservations: Reservation[],
  properties: Array<{ id: string; name: string; status: string }>,
  avgRates: Map<string, number>,
  portfolioAvgRate: number,
  rangeStart: string,
  rangeEnd: string,
): RevenueLeak[] {
  const leaks: RevenueLeak[] = [];
  const activePropertyIds = new Set(
    properties.filter((p) => p.status === "active").map((p) => p.id),
  );

  const confirmed = reservations.filter(
    (r) =>
      activePropertyIds.has(r.propertyId) &&
      ["confirmed", "checked-in", "checked-out", "reserved"].includes(
        r.status.toLowerCase(),
      ),
  );

  // Group by property and sort by check-in date
  const byProperty = new Map<string, Reservation[]>();
  for (const r of confirmed) {
    const list = byProperty.get(r.propertyId) ?? [];
    list.push(r);
    byProperty.set(r.propertyId, list);
  }

  for (const [propertyId, propReservations] of byProperty) {
    const sorted = propReservations.sort(
      (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime(),
    );

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i]!;
      const next = sorted[i + 1]!;

      const gapStart = new Date(current.checkOut);
      const gapEnd = new Date(next.checkIn);
      const gapDays = Math.ceil(
        (gapEnd.getTime() - gapStart.getTime()) / 86_400_000,
      );

      // Only flag gaps of 1-7 days (likely bookable gaps, not seasonal closures)
      if (gapDays >= 1 && gapDays <= 7) {
        const gapStartStr = toISO(gapStart);
        const gapEndStr = toISO(gapEnd);

        // Only count if gap falls within our query range
        if (gapStartStr >= rangeStart && gapEndStr <= rangeEnd) {
          const rate = avgRates.get(propertyId) ?? portfolioAvgRate;
          leaks.push({
            type: "gap-night",
            propertyId,
            propertyName: current.propertyName,
            estimatedLoss: round(rate * gapDays, 0),
            details:
              `${gapDays} empty night${gapDays > 1 ? "s" : ""} between bookings: ` +
              `${current.guestName} checks out ${current.checkOut}, ` +
              `${next.guestName} checks in ${next.checkIn}. ` +
              `Estimated loss at $${round(rate, 0)}/night avg rate.`,
            date: gapStartStr,
            nights: gapDays,
          });
        }
      }
    }
  }

  return leaks;
}

// ── Helpers ──────────────────────────────────────────────────────────

function computeAvgRates(reservations: Reservation[]): Map<string, number> {
  const rates = new Map<string, { total: number; nights: number }>();
  for (const r of reservations) {
    if (
      r.nightlyRate > 0 &&
      ["confirmed", "checked-in", "checked-out", "reserved"].includes(
        r.status.toLowerCase(),
      )
    ) {
      const existing = rates.get(r.propertyId) ?? { total: 0, nights: 0 };
      existing.total += r.totalPrice;
      existing.nights += r.nights;
      rates.set(r.propertyId, existing);
    }
  }

  const result = new Map<string, number>();
  for (const [id, { total, nights }] of rates) {
    if (nights > 0) result.set(id, round(total / nights, 2));
  }
  return result;
}

function computePortfolioAvgRate(reservations: Reservation[]): number {
  const confirmed = reservations.filter((r) =>
    ["confirmed", "checked-in", "checked-out", "reserved"].includes(
      r.status.toLowerCase(),
    ),
  );
  const totalRevenue = confirmed.reduce((s, r) => s + r.totalPrice, 0);
  const totalNights = confirmed.reduce((s, r) => s + r.nights, 0);
  return totalNights > 0 ? round(totalRevenue / totalNights, 2) : 100;
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function toISO(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

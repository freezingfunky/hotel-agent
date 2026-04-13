import type { RmsAdapter, RateRecommendation, PricingSnapshot } from "../../types.js";

const MARKETS: Record<string, number> = {
  Austin: 185,
  Nashville: 210,
  Scottsdale: 165,
};

/**
 * Deterministic mock RMS data that creates interesting pricing insights.
 * Some properties are underpriced (recommended > current), some overpriced.
 */
export class MockRmsAdapter implements RmsAdapter {
  name = "Demo RMS (Mock Data)";

  async fetchCurrentRates(params: {
    propertyId?: string;
    startDate: string;
    endDate: string;
  }): Promise<RateRecommendation[]> {
    const recs: RateRecommendation[] = [];
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);

    const properties = getPropertyStubs(params.propertyId);

    for (const prop of properties) {
      const cursor = new Date(start);
      while (cursor <= end) {
        const date = toISO(cursor);
        const dayOfWeek = cursor.getDay();
        const month = cursor.getMonth();
        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
        const isSeason = month >= 5 && month <= 8;

        const baseRate = prop.baseRate;
        const currentRate = Math.round(baseRate * (isWeekend ? 1.15 : 0.95));

        const demandMultiplier = isSeason ? 1.3 : isWeekend ? 1.2 : 0.9;
        const recommendedRate = Math.round(baseRate * demandMultiplier * (0.95 + seededRandom(prop.id + date) * 0.15));
        const gap = recommendedRate - currentRate;

        let reason: string;
        let confidence: "high" | "medium" | "low";
        if (gap > 20) {
          reason = `High demand detected — ${isSeason ? "peak season" : "weekend surge"}. Raise rate to capture $${gap}/night.`;
          confidence = "high";
        } else if (gap < -20) {
          reason = `Low demand forecast — consider reducing to avoid vacancy.`;
          confidence = "medium";
        } else {
          reason = `Rate is well-positioned for current demand.`;
          confidence = "high";
        }

        recs.push({
          propertyId: prop.id,
          propertyName: prop.name,
          date,
          currentRate,
          recommendedRate,
          minRate: Math.round(baseRate * 0.7),
          maxRate: Math.round(baseRate * 1.8),
          confidence,
          reason,
          currency: "USD",
        });

        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return recs;
  }

  async fetchPricingHistory(params: {
    propertyId?: string;
    startDate: string;
    endDate: string;
  }): Promise<PricingSnapshot[]> {
    const snapshots: PricingSnapshot[] = [];
    const start = new Date(params.startDate);
    const end = new Date(params.endDate);
    const properties = getPropertyStubs(params.propertyId);

    for (const prop of properties) {
      const cursor = new Date(start);
      while (cursor <= end) {
        const date = toISO(cursor);
        const month = cursor.getMonth();
        const dayOfWeek = cursor.getDay();
        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
        const isSeason = month >= 5 && month <= 8;

        const rateSet = Math.round(prop.baseRate * (isWeekend ? 1.15 : 0.95));
        const rateRec = Math.round(prop.baseRate * (isSeason ? 1.3 : isWeekend ? 1.2 : 0.9));
        const occupancyForecast = isSeason ? 0.85 : isWeekend ? 0.75 : 0.55;

        const demandLevel: PricingSnapshot["demandLevel"] =
          isSeason && isWeekend ? "peak" :
          isSeason ? "high" :
          isWeekend ? "medium" : "low";

        snapshots.push({
          propertyId: prop.id,
          date,
          rateSet,
          rateRecommended: rateRec,
          occupancyForecast,
          demandLevel,
        });

        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return snapshots;
  }
}

interface PropStub { id: string; name: string; baseRate: number; market: string }

function getPropertyStubs(filterPropId?: string): PropStub[] {
  const stubs: PropStub[] = [
    { id: "prop_001", name: "The Zilker Bungalow", baseRate: 185, market: "Austin" },
    { id: "prop_003", name: "East Austin Studio", baseRate: 145, market: "Austin" },
    { id: "prop_005", name: "Downtown Penthouse", baseRate: 265, market: "Austin" },
    { id: "prop_011", name: "The Gulch Apartment", baseRate: 210, market: "Nashville" },
    { id: "prop_015", name: "Midtown High-Rise", baseRate: 290, market: "Nashville" },
    { id: "prop_021", name: "Old Town Casita", baseRate: 165, market: "Scottsdale" },
    { id: "prop_025", name: "McDowell Mountain View", baseRate: 205, market: "Scottsdale" },
  ];
  if (filterPropId) return stubs.filter((s) => s.id === filterPropId);
  return stubs;
}

function seededRandom(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return Math.abs(h % 1000) / 1000;
}

function toISO(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

import type { StrAdapter, MarketMetrics, SupplyDemand } from "../../types.js";

/**
 * Deterministic mock STR data.
 * Market metrics are set slightly above the mock PMS portfolio so
 * benchmarking produces meaningful comparisons (your portfolio vs. market).
 */
export class MockStrAdapter implements StrAdapter {
  name = "Demo STR (Mock Data)";

  private marketData: Record<string, { occupancy: number; adr: number; listings: number; demand: number }> = {
    Austin: { occupancy: 72.5, adr: 215, listings: 4800, demand: 78 },
    Nashville: { occupancy: 68.3, adr: 245, listings: 6200, demand: 82 },
    Scottsdale: { occupancy: 64.1, adr: 195, listings: 3100, demand: 65 },
  };

  async fetchMarketMetrics(params: {
    market: string;
    startDate: string;
    endDate: string;
  }): Promise<MarketMetrics> {
    const key = findMarketKey(params.market, this.marketData);
    const data = this.marketData[key] ?? { occupancy: 65, adr: 200, listings: 3000, demand: 70 };

    const revPAR = round((data.occupancy / 100) * data.adr, 2);

    return {
      market: key,
      period: { start: params.startDate, end: params.endDate },
      occupancyRate: data.occupancy,
      avgDailyRate: data.adr,
      revPAR,
      activeListings: data.listings,
      demandScore: data.demand,
    };
  }

  async fetchSupplyDemand(params: {
    market: string;
    startDate: string;
    endDate: string;
  }): Promise<SupplyDemand> {
    const key = findMarketKey(params.market, this.marketData);
    const data = this.marketData[key] ?? { listings: 3000 };

    return {
      market: key,
      period: { start: params.startDate, end: params.endDate },
      totalListings: data.listings,
      newListings: Math.round(data.listings * 0.03),
      delistedCount: Math.round(data.listings * 0.015),
      avgBookedNights: 22,
      demandGrowthPct: 4.2,
      supplyGrowthPct: 1.5,
    };
  }
}

function findMarketKey(input: string, data: Record<string, unknown>): string {
  const lower = input.toLowerCase();
  for (const key of Object.keys(data)) {
    if (key.toLowerCase() === lower || lower.includes(key.toLowerCase())) return key;
  }
  return input;
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

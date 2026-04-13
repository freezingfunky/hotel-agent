import type { StrAdapter, StrSourceConfig, MarketMetrics, SupplyDemand } from "../../types.js";
import { RateLimiter, SimpleCache, httpGet } from "../../http.js";

/**
 * AirDNA Enterprise API v2 adapter — Bearer token auth.
 * Docs: https://docs.airdna.co/
 */
export class AirDnaAdapter implements StrAdapter {
  name = "AirDNA";
  private baseUrl = "https://api.airdna.co/api/v2";
  private headers: Record<string, string>;
  private limiter = new RateLimiter(5, 1000);
  private cache = new SimpleCache();

  constructor(config: StrSourceConfig) {
    this.headers = {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    };
  }

  async fetchMarketMetrics(params: {
    market: string;
    startDate: string;
    endDate: string;
  }): Promise<MarketMetrics> {
    const cacheKey = `airdna-market-${params.market}-${params.startDate}-${params.endDate}`;
    const cached = this.cache.get<MarketMetrics>(cacheKey);
    if (cached) return cached;

    const qs = new URLSearchParams({
      market: params.market,
      start_date: params.startDate,
      end_date: params.endDate,
    });

    const data = await httpGet(
      `${this.baseUrl}/market/metrics?${qs}`,
      this.headers,
      this.limiter,
    ) as Record<string, unknown>;

    const result: MarketMetrics = {
      market: String(data.market_name ?? params.market),
      period: { start: params.startDate, end: params.endDate },
      occupancyRate: Number(data.occupancy_rate ?? 0),
      avgDailyRate: Number(data.adr ?? 0),
      revPAR: Number(data.revpar ?? 0),
      activeListings: Number(data.active_listings ?? 0),
      demandScore: Number(data.demand_score ?? 0),
    };

    this.cache.set(cacheKey, result);
    return result;
  }

  async fetchSupplyDemand(params: {
    market: string;
    startDate: string;
    endDate: string;
  }): Promise<SupplyDemand> {
    const cacheKey = `airdna-supply-${params.market}-${params.startDate}-${params.endDate}`;
    const cached = this.cache.get<SupplyDemand>(cacheKey);
    if (cached) return cached;

    const qs = new URLSearchParams({
      market: params.market,
      start_date: params.startDate,
      end_date: params.endDate,
    });

    const data = await httpGet(
      `${this.baseUrl}/market/supply-demand?${qs}`,
      this.headers,
      this.limiter,
    ) as Record<string, unknown>;

    const result: SupplyDemand = {
      market: String(data.market_name ?? params.market),
      period: { start: params.startDate, end: params.endDate },
      totalListings: Number(data.total_listings ?? 0),
      newListings: Number(data.new_listings ?? 0),
      delistedCount: Number(data.delisted ?? 0),
      avgBookedNights: Number(data.avg_booked_nights ?? 0),
      demandGrowthPct: Number(data.demand_growth_pct ?? 0),
      supplyGrowthPct: Number(data.supply_growth_pct ?? 0),
    };

    this.cache.set(cacheKey, result);
    return result;
  }
}

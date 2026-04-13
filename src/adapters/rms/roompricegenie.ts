import type { RmsAdapter, RmsSourceConfig, RateRecommendation, PricingSnapshot } from "../../types.js";
import { RateLimiter, SimpleCache, httpGet } from "../../http.js";

/**
 * RoomPriceGenie adapter — Open API with API key auth.
 * Docs: https://postman.roompricegenie.com/
 */
export class RoomPriceGenieAdapter implements RmsAdapter {
  name = "RoomPriceGenie";
  private baseUrl = "https://api.roompricegenie.com/api/v1";
  private headers: Record<string, string>;
  private limiter = new RateLimiter(5, 1000);
  private cache = new SimpleCache();

  constructor(config: RmsSourceConfig) {
    this.headers = {
      Authorization: `Bearer ${config.apiKey}`,
      Accept: "application/json",
    };
  }

  async fetchCurrentRates(params: {
    propertyId?: string;
    startDate: string;
    endDate: string;
  }): Promise<RateRecommendation[]> {
    const cacheKey = `rpg-rates-${params.propertyId ?? "all"}-${params.startDate}-${params.endDate}`;
    const cached = this.cache.get<RateRecommendation[]>(cacheKey);
    if (cached) return cached;

    const qs = new URLSearchParams({
      start_date: params.startDate,
      end_date: params.endDate,
    });
    if (params.propertyId) qs.set("property_id", params.propertyId);

    const data = await httpGet(
      `${this.baseUrl}/recommendations?${qs}`,
      this.headers,
      this.limiter,
    ) as { results?: Array<Record<string, unknown>> };

    const results = (data.results ?? []).map((item): RateRecommendation => ({
      propertyId: String(item.property_id ?? ""),
      propertyName: String(item.property_name ?? ""),
      date: String(item.date ?? ""),
      currentRate: Number(item.current_rate ?? 0),
      recommendedRate: Number(item.recommended_rate ?? 0),
      minRate: Number(item.min_rate ?? 0),
      maxRate: Number(item.max_rate ?? 0),
      confidence: normalizeConfidence(item.confidence),
      reason: String(item.reason ?? ""),
      currency: String(item.currency ?? "USD"),
    }));

    this.cache.set(cacheKey, results);
    return results;
  }

  async fetchPricingHistory(params: {
    propertyId?: string;
    startDate: string;
    endDate: string;
  }): Promise<PricingSnapshot[]> {
    const cacheKey = `rpg-history-${params.propertyId ?? "all"}-${params.startDate}-${params.endDate}`;
    const cached = this.cache.get<PricingSnapshot[]>(cacheKey);
    if (cached) return cached;

    const qs = new URLSearchParams({
      start_date: params.startDate,
      end_date: params.endDate,
    });
    if (params.propertyId) qs.set("property_id", params.propertyId);

    const data = await httpGet(
      `${this.baseUrl}/pricing-history?${qs}`,
      this.headers,
      this.limiter,
    ) as { results?: Array<Record<string, unknown>> };

    const results = (data.results ?? []).map((item): PricingSnapshot => ({
      propertyId: String(item.property_id ?? ""),
      date: String(item.date ?? ""),
      rateSet: Number(item.rate_set ?? 0),
      rateRecommended: Number(item.rate_recommended ?? 0),
      occupancyForecast: Number(item.occupancy_forecast ?? 0),
      demandLevel: normalizeDemand(item.demand_level),
    }));

    this.cache.set(cacheKey, results);
    return results;
  }
}

function normalizeConfidence(val: unknown): "high" | "medium" | "low" {
  const s = String(val ?? "medium").toLowerCase();
  if (s === "high") return "high";
  if (s === "low") return "low";
  return "medium";
}

function normalizeDemand(val: unknown): "low" | "medium" | "high" | "peak" {
  const s = String(val ?? "medium").toLowerCase();
  if (s === "low") return "low";
  if (s === "high") return "high";
  if (s === "peak") return "peak";
  return "medium";
}

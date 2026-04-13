import type { RmsAdapter, RmsSourceConfig, RateRecommendation, PricingSnapshot } from "../../types.js";
import { RateLimiter, SimpleCache, httpGet } from "../../http.js";

/**
 * IDeaS G3 RMS adapter — REST API with API key auth.
 * Docs: https://developers.ideas.com/
 */
export class IdeasAdapter implements RmsAdapter {
  name = "IDeaS";
  private baseUrl = "https://api.ideas.com/api/public/v1";
  private headers: Record<string, string>;
  private limiter = new RateLimiter(5, 1000);
  private cache = new SimpleCache();

  constructor(config: RmsSourceConfig) {
    this.headers = {
      "X-API-Key": config.apiKey,
      Accept: "application/json",
    };
  }

  async fetchCurrentRates(params: {
    propertyId?: string;
    startDate: string;
    endDate: string;
  }): Promise<RateRecommendation[]> {
    const cacheKey = `ideas-rates-${params.propertyId ?? "all"}-${params.startDate}-${params.endDate}`;
    const cached = this.cache.get<RateRecommendation[]>(cacheKey);
    if (cached) return cached;

    const qs = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
    });
    if (params.propertyId) qs.set("propertyId", params.propertyId);

    const data = await httpGet(
      `${this.baseUrl}/rate-recommendations?${qs}`,
      this.headers,
      this.limiter,
    ) as { data?: Array<Record<string, unknown>> };

    const results = (data.data ?? []).map((item): RateRecommendation => ({
      propertyId: String(item.propertyId ?? ""),
      propertyName: String(item.propertyName ?? ""),
      date: String(item.date ?? ""),
      currentRate: Number(item.currentRate ?? 0),
      recommendedRate: Number(item.recommendedRate ?? 0),
      minRate: Number(item.floorRate ?? 0),
      maxRate: Number(item.ceilingRate ?? 0),
      confidence: normalizeConfidence(item.confidenceLevel),
      reason: String(item.rationale ?? ""),
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
    const cacheKey = `ideas-history-${params.propertyId ?? "all"}-${params.startDate}-${params.endDate}`;
    const cached = this.cache.get<PricingSnapshot[]>(cacheKey);
    if (cached) return cached;

    const qs = new URLSearchParams({
      startDate: params.startDate,
      endDate: params.endDate,
    });
    if (params.propertyId) qs.set("propertyId", params.propertyId);

    const data = await httpGet(
      `${this.baseUrl}/pricing-history?${qs}`,
      this.headers,
      this.limiter,
    ) as { data?: Array<Record<string, unknown>> };

    const results = (data.data ?? []).map((item): PricingSnapshot => ({
      propertyId: String(item.propertyId ?? ""),
      date: String(item.date ?? ""),
      rateSet: Number(item.actualRate ?? 0),
      rateRecommended: Number(item.recommendedRate ?? 0),
      occupancyForecast: Number(item.occupancyForecast ?? 0),
      demandLevel: normalizeDemand(item.demandLevel),
    }));

    this.cache.set(cacheKey, results);
    return results;
  }
}

function normalizeConfidence(val: unknown): "high" | "medium" | "low" {
  const s = String(val ?? "medium").toLowerCase();
  if (s === "high" || s === "3") return "high";
  if (s === "low" || s === "1") return "low";
  return "medium";
}

function normalizeDemand(val: unknown): "low" | "medium" | "high" | "peak" {
  const s = String(val ?? "medium").toLowerCase();
  if (s === "low") return "low";
  if (s === "high") return "high";
  if (s === "peak" || s === "very_high") return "peak";
  return "medium";
}

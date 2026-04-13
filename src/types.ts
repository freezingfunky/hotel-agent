// ── Multi-source configuration ───────────────────────────────────────

export interface PmsSourceConfig {
  provider: "demo" | "guesty" | "hostaway" | "cloudbeds" | "mews" | "apaleo";
  apiKey: string;
  clientSecret?: string;
  clientToken?: string;
  propertyIds?: string[];
}

export interface RmsSourceConfig {
  provider: "demo" | "roompricegenie" | "ideas";
  apiKey: string;
  clientSecret?: string;
}

export interface StrSourceConfig {
  provider: "demo" | "airdna";
  apiKey: string;
}

export interface OtaSourceConfig {
  provider: "demo" | "booking" | "expedia";
  apiKey: string;
  clientSecret?: string;
}

export interface HotelAgentConfig {
  pms?: PmsSourceConfig;
  rms?: RmsSourceConfig;
  str?: StrSourceConfig;
  ota?: OtaSourceConfig;
}

/** Legacy flat config — auto-detected and upgraded to HotelAgentConfig */
export interface PmsConfig {
  pms: "demo" | "guesty" | "hostaway" | "cloudbeds" | "mews" | "apaleo";
  apiKey: string;
  clientSecret?: string;
  clientToken?: string;
  propertyIds?: string[];
}

export function isLegacyConfig(raw: unknown): raw is PmsConfig {
  return typeof raw === "object" && raw !== null && typeof (raw as Record<string, unknown>).pms === "string";
}

export function upgradeLegacyConfig(legacy: PmsConfig): HotelAgentConfig {
  return {
    pms: {
      provider: legacy.pms,
      apiKey: legacy.apiKey,
      clientSecret: legacy.clientSecret,
      clientToken: legacy.clientToken,
      propertyIds: legacy.propertyIds,
    },
  };
}

// ── Normalized PMS entities ──────────────────────────────────────────

export interface Property {
  id: string;
  name: string;
  address: string;
  bedrooms: number;
  bathrooms: number;
  maxGuests: number;
  status: string;
  timezone: string;
}

export interface Reservation {
  id: string;
  propertyId: string;
  propertyName: string;
  guestName: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  status: string;
  totalPrice: number;
  nightlyRate: number;
  currency: string;
  cancelledAt?: string;
  cancellationReason?: string;
  specialRequests?: string;
  source?: string;
  createdAt: string;
}

// ── Normalized RMS entities ──────────────────────────────────────────

export interface RateRecommendation {
  propertyId: string;
  propertyName: string;
  date: string;
  currentRate: number;
  recommendedRate: number;
  minRate: number;
  maxRate: number;
  confidence: "high" | "medium" | "low";
  reason: string;
  currency: string;
}

export interface PricingSnapshot {
  propertyId: string;
  date: string;
  rateSet: number;
  rateRecommended: number;
  occupancyForecast: number;
  demandLevel: "low" | "medium" | "high" | "peak";
}

// ── Normalized STR entities ──────────────────────────────────────────

export interface MarketMetrics {
  market: string;
  period: { start: string; end: string };
  occupancyRate: number;
  avgDailyRate: number;
  revPAR: number;
  activeListings: number;
  demandScore: number;
}

export interface SupplyDemand {
  market: string;
  period: { start: string; end: string };
  totalListings: number;
  newListings: number;
  delistedCount: number;
  avgBookedNights: number;
  demandGrowthPct: number;
  supplyGrowthPct: number;
}

// ── Normalized OTA entities ──────────────────────────────────────────

export interface ChannelBooking {
  channel: string;
  reservationCount: number;
  totalRevenue: number;
  avgNightlyRate: number;
  avgLeadTimeDays: number;
  avgLengthOfStay: number;
  cancellationRate: number;
}

export interface ChannelCommission {
  channel: string;
  commissionPct: number;
  totalCommissionPaid: number;
  netRevenue: number;
  grossRevenue: number;
  bookingCount: number;
}

// ── PMS adapter interface ────────────────────────────────────────────

export interface PmsAdapter {
  name: string;
  fetchProperties(): Promise<Property[]>;
  fetchReservations(params: {
    startDate: string;
    endDate: string;
    status?: string;
    propertyId?: string;
    limit?: number;
  }): Promise<Reservation[]>;
}

// ── RMS adapter interface ────────────────────────────────────────────

export interface RmsAdapter {
  name: string;
  fetchCurrentRates(params: {
    propertyId?: string;
    startDate: string;
    endDate: string;
  }): Promise<RateRecommendation[]>;
  fetchPricingHistory(params: {
    propertyId?: string;
    startDate: string;
    endDate: string;
  }): Promise<PricingSnapshot[]>;
}

// ── STR adapter interface ────────────────────────────────────────────

export interface StrAdapter {
  name: string;
  fetchMarketMetrics(params: {
    market: string;
    startDate: string;
    endDate: string;
  }): Promise<MarketMetrics>;
  fetchSupplyDemand(params: {
    market: string;
    startDate: string;
    endDate: string;
  }): Promise<SupplyDemand>;
}

// ── OTA adapter interface ────────────────────────────────────────────

export interface OtaAdapter {
  name: string;
  fetchBookingsByChannel(params: {
    startDate: string;
    endDate: string;
  }): Promise<ChannelBooking[]>;
  fetchChannelCommissions(params: {
    startDate: string;
    endDate: string;
  }): Promise<ChannelCommission[]>;
}

// ── Tool outputs ─────────────────────────────────────────────────────

export interface VerificationResult {
  totalClaims: number;
  verified: number;
  corrected: number;
  corrections: string[];
  confidence: "HIGH" | "MEDIUM" | "LOW";
  dataRange: string;
  propertiesIncluded: number;
}

export interface PropertyHealth {
  propertyId: string;
  propertyName: string;
  occupancyRate: number;
  avgDailyRate: number;
  revPAR: number;
  totalRevenue: number;
  bookedNights: number;
  availableNights: number;
  reservationCount: number;
}

export interface PortfolioHealthResult {
  totalProperties: number;
  dateRange: { start: string; end: string };
  occupancyRate: number;
  avgDailyRate: number;
  revPAR: number;
  totalRevenue: number;
  totalBookedNights: number;
  totalAvailableNights: number;
  properties: PropertyHealth[];
  outliers: Array<PropertyHealth & { reason: string }>;
  comparison?: {
    period: string;
    occupancyChange: number;
    adrChange: number;
    revPARChange: number;
    revenueChange: number;
  };
  verification: VerificationResult;
}

export interface RevenueLeak {
  type: "cancellation" | "no-show" | "gap-night";
  propertyId: string;
  propertyName: string;
  estimatedLoss: number;
  details: string;
  date?: string;
  nights?: number;
}

export interface RevenueLeaksResult {
  dateRange: { start: string; end: string };
  leaks: RevenueLeak[];
  totalEstimatedLoss: number;
  byType: {
    cancellations: { count: number; loss: number };
    noShows: { count: number; loss: number };
    gapNights: { count: number; loss: number };
  };
  topLeakingProperties: Array<{ propertyId: string; propertyName: string; totalLoss: number }>;
  verification: VerificationResult;
}

export interface PricingIntelResult {
  dateRange: { start: string; end: string };
  totalProperties: number;
  underpriced: Array<{
    propertyId: string;
    propertyName: string;
    currentRate: number;
    recommendedRate: number;
    dailyUpsideLost: number;
    confidence: string;
    reason: string;
  }>;
  overpriced: Array<{
    propertyId: string;
    propertyName: string;
    currentRate: number;
    recommendedRate: number;
    riskLevel: string;
    reason: string;
  }>;
  totalDailyRevenueGap: number;
  verification: VerificationResult;
}

export interface MarketBenchmarkResult {
  dateRange: { start: string; end: string };
  markets: Array<{
    market: string;
    yourOccupancy: number;
    marketOccupancy: number;
    occupancyGap: number;
    yourADR: number;
    marketADR: number;
    adrGap: number;
    yourRevPAR: number;
    marketRevPAR: number;
    revparGap: number;
    demandScore: number;
    activeListings: number;
  }>;
  overallAssessment: string;
  verification: VerificationResult;
}

export interface ChannelMixResult {
  dateRange: { start: string; end: string };
  channels: Array<{
    channel: string;
    bookings: number;
    grossRevenue: number;
    commissionPct: number;
    commissionPaid: number;
    netRevenue: number;
    avgRate: number;
    cancellationRate: number;
    avgLeadTime: number;
    profitabilityRank: number;
  }>;
  totalGrossRevenue: number;
  totalCommissions: number;
  totalNetRevenue: number;
  bestChannel: string;
  worstChannel: string;
  verification: VerificationResult;
}

export interface SchemaInfo {
  pms: string;
  rms?: string;
  str?: string;
  ota?: string;
  propertiesCount: number;
  dataAvailable: string[];
  tools: Array<{ name: string; description: string }>;
  samplePropertyNames: string[];
}

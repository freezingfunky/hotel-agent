export interface PmsConfig {
  pms: "guesty" | "hostaway";
  apiKey: string;
  /** Guesty-only: OAuth client secret for token exchange */
  clientSecret?: string;
}

// ── Normalized entities ──────────────────────────────────────────────

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

export interface SchemaInfo {
  pms: string;
  propertiesCount: number;
  dataAvailable: string[];
  tools: Array<{ name: string; description: string }>;
  samplePropertyNames: string[];
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

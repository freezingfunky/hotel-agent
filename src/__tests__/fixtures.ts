import type { Property, Reservation, PmsAdapter } from "../types.js";

// ── 5 properties with known IDs ──────────────────────────────────────
// All active except prop_005 which is inactive.

export const TEST_PROPERTIES: Property[] = [
  {
    id: "prop_001",
    name: "Downtown Loft",
    address: "100 Main St, Austin, TX",
    bedrooms: 2,
    bathrooms: 1,
    maxGuests: 4,
    status: "active",
    timezone: "America/Chicago",
  },
  {
    id: "prop_002",
    name: "Beachfront Condo",
    address: "200 Ocean Dr, Miami, FL",
    bedrooms: 3,
    bathrooms: 2,
    maxGuests: 6,
    status: "active",
    timezone: "America/New_York",
  },
  {
    id: "prop_003",
    name: "Mountain Cabin",
    address: "300 Pine Rd, Aspen, CO",
    bedrooms: 4,
    bathrooms: 3,
    maxGuests: 8,
    status: "active",
    timezone: "America/Denver",
  },
  {
    id: "prop_004",
    name: "City Studio",
    address: "400 Broadway, Nashville, TN",
    bedrooms: 1,
    bathrooms: 1,
    maxGuests: 2,
    status: "active",
    timezone: "America/Chicago",
  },
  {
    id: "prop_005",
    name: "Closed Villa",
    address: "500 Sunset Blvd, LA, CA",
    bedrooms: 5,
    bathrooms: 4,
    maxGuests: 10,
    status: "inactive",
    timezone: "America/Los_Angeles",
  },
];

// ── Date range for tests: 2026-03-01 to 2026-03-31 (31 days) ────────
// 4 active properties x 31 days = 124 available nights

export const TEST_START = "2026-03-01";
export const TEST_END = "2026-03-31";
export const TEST_DAYS = 30; // daysBetween("2026-03-01", "2026-03-31") = ceil(30d) = 30
export const TEST_ACTIVE_PROPERTIES = 4;
export const TEST_AVAILABLE_NIGHTS = TEST_ACTIVE_PROPERTIES * TEST_DAYS; // 120

// ── 20 reservations with hand-calculated numbers ─────────────────────
//
// Booking summary for the 30-day window (Mar 1 to Mar 31 = 30 days):
//   prop_001: res_001(7) + res_002(8) + res_003(5) = 20 nights, $4,000
//   prop_002: res_004(5) + res_005(5) + res_006(5) = 15 nights, $4,500
//   prop_003: res_007(5) + res_008(5) + res_019(4 pro-rated) = 14 nights, $4,200
//   prop_004: res_009(9) + res_010(8) + res_011(8) + res_020(2) = 27 nights, $2,700
//
// Plus: 3 cancelled, 2 no-shows (not counted in occupancy/revenue)
// Note: res_019 spans Feb25-Mar5 (8 nights), only 4 in window => $2400*4/8 = $1200
//
// Totals for confirmed only:
//   Booked nights: 20 + 15 + 14 + 27 = 76
//   Revenue:       4000 + 4500 + 4200 + 2700 = 15400
//   Occupancy:     round(76/120*100, 1) = 63.3%
//   ADR:           round(15400/76, 2) = 202.63
//   RevPAR:        round(15400/120, 2) = 128.33

export const EXPECTED_BOOKED_NIGHTS = 76;
export const EXPECTED_REVENUE = 15400;
export const EXPECTED_OCCUPANCY = 63.3;
export const EXPECTED_ADR = 202.63;
export const EXPECTED_REVPAR = 128.33;

export const TEST_RESERVATIONS: Reservation[] = [
  // ── prop_001: 20 booked nights, $4,000 ─────────────────────────────
  {
    id: "res_001", propertyId: "prop_001", propertyName: "Downtown Loft",
    guestName: "Alice Smith", checkIn: "2026-03-01", checkOut: "2026-03-08",
    nights: 7, status: "checked-out", totalPrice: 1400, nightlyRate: 200,
    currency: "USD", createdAt: "2026-02-15",
  },
  {
    id: "res_002", propertyId: "prop_001", propertyName: "Downtown Loft",
    guestName: "Bob Johnson", checkIn: "2026-03-10", checkOut: "2026-03-18",
    nights: 8, status: "checked-out", totalPrice: 1600, nightlyRate: 200,
    currency: "USD", createdAt: "2026-02-20",
  },
  // Gap: Mar 8 -> Mar 10 = 2 gap nights for prop_001
  {
    id: "res_003", propertyId: "prop_001", propertyName: "Downtown Loft",
    guestName: "Carol Williams", checkIn: "2026-03-20", checkOut: "2026-03-25",
    nights: 5, status: "confirmed", totalPrice: 1000, nightlyRate: 200,
    currency: "USD", createdAt: "2026-03-01",
  },
  // Gap: Mar 18 -> Mar 20 = 2 gap nights for prop_001

  // ── prop_002: 15 booked nights, $4,500 ─────────────────────────────
  {
    id: "res_004", propertyId: "prop_002", propertyName: "Beachfront Condo",
    guestName: "David Brown", checkIn: "2026-03-01", checkOut: "2026-03-06",
    nights: 5, status: "checked-out", totalPrice: 1500, nightlyRate: 300,
    currency: "USD", createdAt: "2026-02-10",
  },
  {
    id: "res_005", propertyId: "prop_002", propertyName: "Beachfront Condo",
    guestName: "Eve Davis", checkIn: "2026-03-06", checkOut: "2026-03-11",
    nights: 5, status: "checked-out", totalPrice: 1500, nightlyRate: 300,
    currency: "USD", createdAt: "2026-02-18",
  },
  // No gap between res_004 and res_005 (checkout = checkin)
  {
    id: "res_006", propertyId: "prop_002", propertyName: "Beachfront Condo",
    guestName: "Frank Miller", checkIn: "2026-03-15", checkOut: "2026-03-20",
    nights: 5, status: "confirmed", totalPrice: 1500, nightlyRate: 300,
    currency: "USD", createdAt: "2026-03-01",
  },
  // Gap: Mar 11 -> Mar 15 = 4 gap nights for prop_002

  // ── prop_003: 10 booked nights, $3,000 (underperformer) ────────────
  {
    id: "res_007", propertyId: "prop_003", propertyName: "Mountain Cabin",
    guestName: "Grace Wilson", checkIn: "2026-03-05", checkOut: "2026-03-10",
    nights: 5, status: "checked-out", totalPrice: 1500, nightlyRate: 300,
    currency: "USD", createdAt: "2026-02-20",
  },
  {
    id: "res_008", propertyId: "prop_003", propertyName: "Mountain Cabin",
    guestName: "Henry Moore", checkIn: "2026-03-20", checkOut: "2026-03-25",
    nights: 5, status: "confirmed", totalPrice: 1500, nightlyRate: 300,
    currency: "USD", createdAt: "2026-03-10",
  },
  // Gap: Mar 10 -> Mar 20 = 10 gap nights for prop_003 (but >7 so won't be flagged as bookable gap)

  // ── prop_004: 25 booked nights, $2,500 ─────────────────────────────
  {
    id: "res_009", propertyId: "prop_004", propertyName: "City Studio",
    guestName: "Ivy Taylor", checkIn: "2026-03-01", checkOut: "2026-03-10",
    nights: 9, status: "checked-out", totalPrice: 900, nightlyRate: 100,
    currency: "USD", createdAt: "2026-02-15",
  },
  {
    id: "res_010", propertyId: "prop_004", propertyName: "City Studio",
    guestName: "Jack Anderson", checkIn: "2026-03-10", checkOut: "2026-03-18",
    nights: 8, status: "checked-out", totalPrice: 800, nightlyRate: 100,
    currency: "USD", createdAt: "2026-02-25",
  },
  {
    id: "res_011", propertyId: "prop_004", propertyName: "City Studio",
    guestName: "Karen Thomas", checkIn: "2026-03-18", checkOut: "2026-03-26",
    nights: 8, status: "confirmed", totalPrice: 800, nightlyRate: 100,
    currency: "USD", createdAt: "2026-03-05",
  },
  // No gaps at prop_004 — all back-to-back

  // ── Cancellations (3) ──────────────────────────────────────────────
  {
    id: "res_012", propertyId: "prop_001", propertyName: "Downtown Loft",
    guestName: "Leo Martinez", checkIn: "2026-03-25", checkOut: "2026-03-28",
    nights: 3, status: "cancelled", totalPrice: 600, nightlyRate: 200,
    currency: "USD", cancelledAt: "2026-03-20", cancellationReason: "Change of plans",
    createdAt: "2026-03-10",
  },
  {
    id: "res_013", propertyId: "prop_002", propertyName: "Beachfront Condo",
    guestName: "Mia Garcia", checkIn: "2026-03-22", checkOut: "2026-03-27",
    nights: 5, status: "cancelled", totalPrice: 1500, nightlyRate: 300,
    currency: "USD", cancelledAt: "2026-03-15", cancellationReason: "Flight cancelled",
    createdAt: "2026-03-05",
  },
  {
    id: "res_014", propertyId: "prop_003", propertyName: "Mountain Cabin",
    guestName: "Noah Lee", checkIn: "2026-03-12", checkOut: "2026-03-15",
    nights: 3, status: "cancelled", totalPrice: 900, nightlyRate: 300,
    currency: "USD", cancelledAt: "2026-03-10", cancellationReason: "Personal emergency",
    createdAt: "2026-03-01",
  },

  // ── No-shows (2) ──────────────────────────────────────────────────
  {
    id: "res_015", propertyId: "prop_001", propertyName: "Downtown Loft",
    guestName: "Olivia Harris", checkIn: "2026-03-28", checkOut: "2026-03-31",
    nights: 3, status: "no-show", totalPrice: 600, nightlyRate: 200,
    currency: "USD", createdAt: "2026-03-15",
  },
  {
    id: "res_016", propertyId: "prop_004", propertyName: "City Studio",
    guestName: "Paul Clark", checkIn: "2026-03-27", checkOut: "2026-03-31",
    nights: 4, status: "no-show", totalPrice: 400, nightlyRate: 100,
    currency: "USD", createdAt: "2026-03-20",
  },

  // ── Reservations outside the test window (should be excluded) ──────
  {
    id: "res_017", propertyId: "prop_001", propertyName: "Downtown Loft",
    guestName: "Quinn Roberts", checkIn: "2026-02-20", checkOut: "2026-02-25",
    nights: 5, status: "checked-out", totalPrice: 1000, nightlyRate: 200,
    currency: "USD", createdAt: "2026-02-01",
  },
  {
    id: "res_018", propertyId: "prop_002", propertyName: "Beachfront Condo",
    guestName: "Rosa Sanchez", checkIn: "2026-04-05", checkOut: "2026-04-10",
    nights: 5, status: "confirmed", totalPrice: 1500, nightlyRate: 300,
    currency: "USD", createdAt: "2026-03-25",
  },

  // ── Reservation spanning the window boundary (should be pro-rated) ─
  {
    id: "res_019", propertyId: "prop_003", propertyName: "Mountain Cabin",
    guestName: "Sam Turner", checkIn: "2026-02-25", checkOut: "2026-03-05",
    nights: 8, status: "checked-out", totalPrice: 2400, nightlyRate: 300,
    currency: "USD", createdAt: "2026-02-15",
  },
  // 4 nights fall within Mar 1-31 (Mar 1-5), so 4/8 of $2400 = $1200 pro-rated

  // ── Reservation with special requests ──────────────────────────────
  {
    id: "res_020", propertyId: "prop_004", propertyName: "City Studio",
    guestName: "Tina Walker", checkIn: "2026-03-26", checkOut: "2026-03-28",
    nights: 2, status: "confirmed", totalPrice: 200, nightlyRate: 100,
    currency: "USD", specialRequests: "Early check-in requested",
    createdAt: "2026-03-20",
  },
];

// Cancellation expected losses (using property avg nightly rates):
//   res_012: 3 nights at prop_001 avg rate ($200) = $600
//   res_013: 5 nights at prop_002 avg rate ($300) = $1500
//   res_014: 3 nights at prop_003 avg rate ($300) = $900
// Total cancellation loss = $3,000
export const EXPECTED_CANCELLATION_COUNT = 3;
export const EXPECTED_CANCELLATION_LOSS = 3000;

// No-show expected losses:
//   res_015: 3 nights at prop_001 avg rate ($200) = $600
//   res_016: 4 nights at prop_004 avg rate ($100) = $400
// Total no-show loss = $1,000
export const EXPECTED_NOSHOW_COUNT = 2;
export const EXPECTED_NOSHOW_LOSS = 1000;

// Gap nights (1-7 day gaps only):
//   prop_001: Mar 8-10 = 2 nights at $200 = $400
//   prop_001: Mar 18-20 = 2 nights at $200 = $400
//   prop_002: Mar 11-15 = 4 nights at $300 = $1200
// (prop_003 gap is 10 days, excluded as >7)
// Total gap loss = $2,000
export const EXPECTED_GAP_COUNT = 3;
export const EXPECTED_GAP_LOSS = 2000;

// ── Test adapter using deterministic fixtures ────────────────────────

export class FixtureAdapter implements PmsAdapter {
  name = "Test Fixtures";

  async fetchProperties(): Promise<Property[]> {
    return TEST_PROPERTIES;
  }

  async fetchReservations(params: {
    startDate: string;
    endDate: string;
    status?: string;
    propertyId?: string;
  }): Promise<Reservation[]> {
    const start = new Date(params.startDate).getTime();
    const end = new Date(params.endDate).getTime();

    return TEST_RESERVATIONS.filter((r) => {
      const checkIn = new Date(r.checkIn).getTime();
      const checkOut = new Date(r.checkOut).getTime();
      if (checkOut < start || checkIn > end) return false;
      if (params.status && r.status.toLowerCase() !== params.status.toLowerCase()) return false;
      if (params.propertyId && r.propertyId !== params.propertyId) return false;
      return true;
    });
  }
}

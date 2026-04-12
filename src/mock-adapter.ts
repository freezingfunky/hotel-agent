import type { PmsAdapter, Property, Reservation } from "./types.js";

/**
 * Generates a realistic hotel portfolio with mock data for demos and testing.
 * 30 properties across 3 markets, ~6 months of reservation history,
 * with realistic cancellations, no-shows, and gap nights baked in.
 */
export class MockAdapter implements PmsAdapter {
  name = "Demo (Mock Data)";

  private properties: Property[];
  private reservations: Reservation[];

  constructor() {
    this.properties = generateProperties();
    this.reservations = generateReservations(this.properties);
  }

  async fetchProperties(): Promise<Property[]> {
    return this.properties;
  }

  async fetchReservations(params: {
    startDate: string;
    endDate: string;
    status?: string;
    propertyId?: string;
  }): Promise<Reservation[]> {
    const start = new Date(params.startDate).getTime();
    const end = new Date(params.endDate).getTime();

    return this.reservations.filter((r) => {
      const checkIn = new Date(r.checkIn).getTime();
      const checkOut = new Date(r.checkOut).getTime();
      if (checkOut < start || checkIn > end) return false;
      if (params.status && r.status.toLowerCase() !== params.status.toLowerCase()) return false;
      if (params.propertyId && r.propertyId !== params.propertyId) return false;
      return true;
    });
  }
}

// ── Property generation ──────────────────────────────────────────────

const MARKETS = [
  {
    city: "Austin",
    state: "TX",
    baseRate: 185,
    properties: [
      "The Zilker Bungalow",
      "South Congress Loft",
      "East Austin Studio",
      "Barton Creek Retreat",
      "Downtown Penthouse",
      "Rainey Street Condo",
      "Mueller Modern",
      "Travis Heights Cottage",
      "Domain Tower Suite",
      "Lake Austin Villa",
    ],
  },
  {
    city: "Nashville",
    state: "TN",
    baseRate: 210,
    properties: [
      "The Gulch Apartment",
      "Music Row Suite",
      "East Nashville Bungalow",
      "Germantown Loft",
      "12 South Cottage",
      "Midtown High-Rise",
      "Wedgewood-Houston Studio",
      "Sylvan Park House",
      "The Nations Flat",
      "Berry Hill Retreat",
    ],
  },
  {
    city: "Scottsdale",
    state: "AZ",
    baseRate: 165,
    properties: [
      "Old Town Casita",
      "Desert Ridge Villa",
      "Camelback Suite",
      "Scottsdale Quarter Loft",
      "McDowell Mountain View",
      "Gainey Ranch Retreat",
      "Kierland Condo",
      "DC Ranch House",
      "Arcadia Bungalow",
      "McCormick Ranch Pool Home",
    ],
  },
];

function generateProperties(): Property[] {
  const properties: Property[] = [];
  let id = 1;

  for (const market of MARKETS) {
    for (const name of market.properties) {
      properties.push({
        id: `prop_${String(id).padStart(3, "0")}`,
        name,
        address: `${100 + id} Main St, ${market.city}, ${market.state}`,
        bedrooms: pick([1, 1, 2, 2, 2, 3, 3, 4]),
        bathrooms: pick([1, 1, 1.5, 2, 2, 2.5]),
        maxGuests: pick([2, 4, 4, 6, 6, 8]),
        status: id === 28 ? "inactive" : "active", // one inactive property
        timezone: market.state === "AZ" ? "America/Phoenix" : "America/Chicago",
      });
      id++;
    }
  }

  return properties;
}

// ── Reservation generation ───────────────────────────────────────────

const GUEST_FIRST = [
  "James", "Sarah", "Michael", "Emma", "David", "Olivia", "Robert", "Sophia",
  "William", "Isabella", "Thomas", "Mia", "Daniel", "Charlotte", "Joseph",
  "Amelia", "Charles", "Harper", "Christopher", "Evelyn", "Andrew", "Abigail",
  "Matthew", "Emily", "Anthony", "Elizabeth", "Mark", "Sofia", "Steven", "Avery",
  "Richard", "Ella", "Kevin", "Scarlett", "Brian", "Grace", "George", "Chloe",
  "Timothy", "Victoria", "Jason", "Riley", "Ryan", "Aria", "Nathan", "Lily",
  "Eric", "Aubrey", "Carlos", "Zoey",
];

const GUEST_LAST = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson",
  "Thomas", "Taylor", "Moore", "Jackson", "Martin", "Lee", "Perez", "Thompson",
  "White", "Harris", "Sanchez", "Clark", "Ramirez", "Lewis", "Robinson",
  "Walker", "Young", "Allen", "King", "Wright", "Scott", "Torres", "Nguyen",
  "Hill", "Flores", "Green", "Adams", "Nelson", "Baker", "Hall", "Rivera",
  "Campbell", "Mitchell", "Carter", "Roberts",
];

const SOURCES = ["Airbnb", "Booking.com", "VRBO", "Direct", "Direct", "Airbnb", "Airbnb", "Booking.com"];

function generateReservations(properties: Property[]): Reservation[] {
  const reservations: Reservation[] = [];
  const activeProperties = properties.filter((p) => p.status === "active");

  // Generate 6 months of history
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  startDate.setDate(1);

  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1);

  let resId = 1;

  for (const prop of activeProperties) {
    const market = MARKETS.find((m) =>
      m.properties.includes(prop.name),
    )!;
    const baseRate = market.baseRate + (prop.bedrooms - 2) * 40;

    let cursor = new Date(startDate);

    while (cursor < endDate) {
      // Occupancy varies: ~75% average with some properties higher/lower
      const occupancyBias = prop.id === "prop_003" ? 0.45 :  // underperformer
                           prop.id === "prop_015" ? 0.92 :   // top performer
                           prop.id === "prop_022" ? 0.50 :   // underperformer
                           0.70 + Math.random() * 0.15;

      if (Math.random() > occupancyBias) {
        // Gap: skip 1-4 days
        cursor.setDate(cursor.getDate() + pick([1, 1, 2, 2, 3, 4]));
        continue;
      }

      const nights = pick([1, 2, 2, 3, 3, 3, 4, 4, 5, 5, 7, 7, 7, 10, 14]);
      const checkIn = toISO(cursor);
      cursor.setDate(cursor.getDate() + nights);
      const checkOut = toISO(cursor);

      // Rate varies by season and day of week
      const month = new Date(checkIn).getMonth();
      const seasonMultiplier =
        month >= 5 && month <= 8 ? 1.25 :  // summer premium
        month === 11 || month === 0 ? 1.15 : // holiday premium
        0.9;
      const nightlyRate = Math.round(baseRate * seasonMultiplier * (0.85 + Math.random() * 0.3));
      const totalPrice = nightlyRate * nights;

      // Status distribution: ~85% confirmed, ~8% cancelled, ~4% no-show, ~3% checked-out
      const statusRoll = Math.random();
      let status: string;
      let cancelledAt: string | undefined;
      let cancellationReason: string | undefined;

      if (statusRoll < 0.08) {
        status = "cancelled";
        const cancelDate = new Date(checkIn);
        cancelDate.setDate(cancelDate.getDate() - pick([0, 1, 2, 3, 5, 7, 14, 21]));
        cancelledAt = toISO(cancelDate);
        cancellationReason = pick([
          "Change of plans",
          "Found alternative accommodation",
          "Travel restrictions",
          "Personal emergency",
          "Flight cancelled",
          "Weather concerns",
        ]);
      } else if (statusRoll < 0.12) {
        status = "no-show";
      } else if (new Date(checkOut) < new Date()) {
        status = "checked-out";
      } else if (new Date(checkIn) <= new Date() && new Date(checkOut) >= new Date()) {
        status = "checked-in";
      } else {
        status = "confirmed";
      }

      const specialRequests = Math.random() < 0.15
        ? pick([
            "Early check-in requested (before 2pm)",
            "Late checkout if possible",
            "Need a pack-n-play for infant",
            "Celebrating anniversary - any special touches appreciated",
            "Allergic to down feathers - need hypoallergenic pillows",
            "Will be working remotely - strong WiFi is essential",
            "Arriving late (after 10pm)",
            "Need parking for two vehicles",
            "Bringing a small dog (under 20 lbs)",
          ])
        : undefined;

      const createdAt = new Date(checkIn);
      createdAt.setDate(createdAt.getDate() - pick([1, 3, 5, 7, 14, 21, 30, 45, 60]));

      reservations.push({
        id: `res_${String(resId).padStart(5, "0")}`,
        propertyId: prop.id,
        propertyName: prop.name,
        guestName: `${pick(GUEST_FIRST)} ${pick(GUEST_LAST)}`,
        checkIn,
        checkOut,
        nights,
        status,
        totalPrice,
        nightlyRate,
        currency: "USD",
        cancelledAt,
        cancellationReason,
        specialRequests,
        source: pick(SOURCES),
        createdAt: toISO(createdAt),
      });

      resId++;

      // Small gap between bookings sometimes (1 day turnaround)
      if (Math.random() < 0.3) {
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }

  return reservations;
}

// ── Utilities ────────────────────────────────────────────────────────

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function toISO(d: Date): string {
  return d.toISOString().split("T")[0]!;
}

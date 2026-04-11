import type { PmsAdapter, SchemaInfo } from "../types.js";

export async function discoverSchema(
  adapter: PmsAdapter,
): Promise<SchemaInfo> {
  const properties = await adapter.fetchProperties();

  return {
    pms: adapter.name,
    propertiesCount: properties.length,
    dataAvailable: [
      "properties/listings (name, address, bedrooms, capacity, status)",
      "reservations (guest, dates, nightly rate, total price, status, source)",
      "cancellations and no-shows",
      "gap nights between bookings",
    ],
    tools: [
      {
        name: "discover_schema",
        description:
          "Shows what PMS is connected, how many properties, and what data/tools are available. Call this first.",
      },
      {
        name: "portfolio_health",
        description:
          "Portfolio-wide snapshot: occupancy, ADR, RevPAR, total revenue across all properties. " +
          "Flags outliers. Optional date range and period comparison. All numbers verified against source data.",
      },
      {
        name: "revenue_leaks",
        description:
          "Finds cancellations, no-shows, and gap nights. Estimates dollar impact per property. " +
          "Ranks by loss amount. All numbers verified against source data.",
      },
      {
        name: "raw_query",
        description:
          "Direct API call to the PMS for anything the pre-built tools don't cover. " +
          "Provide an endpoint path and optional query parameters.",
      },
    ],
    samplePropertyNames: properties.slice(0, 5).map((p) => p.name),
  };
}

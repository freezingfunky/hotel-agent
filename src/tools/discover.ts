import type { PmsAdapter, RmsAdapter, StrAdapter, OtaAdapter, SchemaInfo } from "../types.js";

export async function discoverSchema(
  pmsAdapter: PmsAdapter,
  rmsAdapter?: RmsAdapter,
  strAdapter?: StrAdapter,
  otaAdapter?: OtaAdapter,
): Promise<SchemaInfo> {
  const properties = await pmsAdapter.fetchProperties();

  const dataAvailable: string[] = [
    "properties/listings (name, address, bedrooms, capacity, status)",
    "reservations (guest, dates, nightly rate, total price, status, source)",
    "cancellations and no-shows",
    "gap nights between bookings",
  ];

  if (rmsAdapter) dataAvailable.push("rate recommendations and pricing history (via RMS)");
  if (strAdapter) dataAvailable.push("market benchmarks — occupancy, ADR, RevPAR for comp set (via STR)");
  if (otaAdapter) dataAvailable.push("channel booking distribution and commission costs (via OTA)");

  const tools: SchemaInfo["tools"] = [
    {
      name: "discover_schema",
      description: "Shows connected data sources, property count, and available tools. Call this first.",
    },
    {
      name: "portfolio_health",
      description:
        "Portfolio-wide snapshot: occupancy, ADR, RevPAR, total revenue across all properties. " +
        "Flags outliers. Optional date range and period comparison. All numbers verified.",
    },
    {
      name: "revenue_leaks",
      description:
        "Finds cancellations, no-shows, and gap nights. Estimates dollar impact per property. " +
        "Ranks by loss amount. All numbers verified.",
    },
    {
      name: "raw_query",
      description:
        "Direct API call to the PMS for anything the pre-built tools don't cover.",
    },
  ];

  if (rmsAdapter) {
    tools.push({
      name: "pricing_intel",
      description:
        "Compares RMS rate recommendations vs actual rates. Flags underpriced (revenue left on table) " +
        "and overpriced (vacancy risk) properties. Shows daily revenue gap.",
    });
  }

  if (strAdapter) {
    tools.push({
      name: "market_benchmark",
      description:
        "Compares your portfolio metrics against market data (comp set). " +
        "Shows occupancy, ADR, RevPAR gaps per market. Overall performance assessment.",
    });
  }

  if (otaAdapter) {
    tools.push({
      name: "channel_mix",
      description:
        "Analyzes booking source distribution across channels. Shows gross revenue, commissions, " +
        "net revenue, and profitability ranking per channel.",
    });
  }

  const info: SchemaInfo = {
    pms: pmsAdapter.name,
    propertiesCount: properties.length,
    dataAvailable,
    tools,
    samplePropertyNames: properties.slice(0, 5).map((p) => p.name),
  };

  if (rmsAdapter) info.rms = rmsAdapter.name;
  if (strAdapter) info.str = strAdapter.name;
  if (otaAdapter) info.ota = otaAdapter.name;

  return info;
}

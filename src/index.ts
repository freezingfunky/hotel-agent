#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type {
  HotelAgentConfig,
  PmsAdapter,
  RmsAdapter,
  StrAdapter,
  OtaAdapter,
} from "./types.js";
import { isLegacyConfig, upgradeLegacyConfig } from "./types.js";
import { createAdapter } from "./adapters/index.js";
import { createRmsAdapter } from "./adapters/rms/index.js";
import { createStrAdapter } from "./adapters/str/index.js";
import { createOtaAdapter } from "./adapters/ota/index.js";
import { discoverSchema } from "./tools/discover.js";
import { portfolioHealth } from "./tools/portfolio-health.js";
import { revenueLeaks } from "./tools/revenue-leaks.js";
import { rawQuery } from "./tools/raw-query.js";
import { pricingIntel } from "./tools/pricing-intel.js";
import { marketBenchmark } from "./tools/market-benchmark.js";
import { channelMix } from "./tools/channel-mix.js";

// ── Load config ──────────────────────────────────────────────────────

function loadConfig(): { config: HotelAgentConfig; pmsAdapter: PmsAdapter; rmsAdapter?: RmsAdapter; strAdapter?: StrAdapter; otaAdapter?: OtaAdapter } {
  const dir = dirname(fileURLToPath(import.meta.url));
  const configPath = resolve(dir, "..", "config.json");

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch {
    console.error(
      `\nCannot read ${configPath}.\n` +
        `Copy config.example.json to config.json and add your credentials.\n`,
    );
    process.exit(1);
  }

  // Support both legacy flat format and new multi-source format
  let config: HotelAgentConfig;
  if (isLegacyConfig(raw)) {
    config = upgradeLegacyConfig(raw);
  } else {
    config = raw as HotelAgentConfig;
  }

  if (!config.pms) {
    console.error(`\nNo PMS configured in config.json. At minimum, set a "pms" source.\n`);
    process.exit(1);
  }

  const pmsSourceConfig = {
    pms: config.pms.provider,
    apiKey: config.pms.apiKey,
    clientSecret: config.pms.clientSecret,
    clientToken: config.pms.clientToken,
    propertyIds: config.pms.propertyIds,
  };

  if (config.pms.provider !== "demo" && (!config.pms.apiKey || config.pms.apiKey.includes("your-"))) {
    console.error(
      `\nAPI key not set for PMS in config.json.\n` +
        `Replace the placeholder with your real ${config.pms.provider} API key.\n` +
        `Or set provider to "demo" to use mock data.\n`,
    );
    process.exit(1);
  }

  const pmsAdapter = createAdapter(pmsSourceConfig);
  const rmsAdapter = config.rms ? createRmsAdapter(config.rms) : undefined;
  const strAdapter = config.str ? createStrAdapter(config.str) : undefined;
  const otaAdapter = config.ota ? createOtaAdapter(config.ota) : undefined;

  return { config, pmsAdapter, rmsAdapter, strAdapter, otaAdapter };
}

const { config, pmsAdapter, rmsAdapter, strAdapter, otaAdapter } = loadConfig();

// ── Create MCP server ────────────────────────────────────────────────

const server = new McpServer({
  name: "hotel-agent",
  version: "0.2.0",
});

// ── Tool: discover_schema ────────────────────────────────────────────

server.tool(
  "discover_schema",
  "Shows what data sources are connected (PMS, RMS, STR, OTA), how many properties, and what tools are available. Call this first to orient yourself before running analysis.",
  {},
  async () => {
    try {
      const schema = await discoverSchema(pmsAdapter, rmsAdapter, strAdapter, otaAdapter);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(schema, null, 2) }],
      };
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ── Tool: portfolio_health ───────────────────────────────────────────

server.tool(
  "portfolio_health",
  "Portfolio-wide health snapshot: occupancy rate, ADR, RevPAR, total revenue across all properties. Flags outlier properties. Optional date range and period-over-period comparison. All numbers independently verified.",
  {
    startDate: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
    endDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
    compareWith: z.enum(["previous-period", "same-period-last-year"]).optional()
      .describe("Compare current period with previous period or same period last year."),
  },
  async (params) => {
    try {
      const result = await portfolioHealth(pmsAdapter, params);
      return { content: [{ type: "text" as const, text: formatHealthReport(result) }] };
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ── Tool: revenue_leaks ──────────────────────────────────────────────

server.tool(
  "revenue_leaks",
  "Finds revenue leaks: cancellations, no-shows, and gap nights. Estimates dollar impact using property-level average nightly rates. Ranks by loss. All numbers verified.",
  {
    startDate: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
    endDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
    minImpact: z.number().optional().describe("Minimum dollar impact to include. Default: 0."),
  },
  async (params) => {
    try {
      const result = await revenueLeaks(pmsAdapter, params);
      return { content: [{ type: "text" as const, text: formatLeaksReport(result) }] };
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ── Tool: raw_query ──────────────────────────────────────────────────

server.tool(
  "raw_query",
  "Direct API call to the PMS for anything the pre-built tools don't cover. Provide a REST endpoint path and optional query parameters.",
  {
    endpoint: z.string().describe("API endpoint path, e.g. '/reservations' or '/listings/PROPERTY_ID'"),
    queryParams: z.record(z.string(), z.string()).optional().describe("Optional query parameters."),
  },
  async (params) => {
    try {
      const queryParams: Record<string, string> | undefined = params.queryParams
        ? Object.fromEntries(Object.entries(params.queryParams).map(([k, v]) => [k, String(v)]))
        : undefined;
      const pmsSourceConfig = {
        pms: config.pms!.provider,
        apiKey: config.pms!.apiKey,
        clientSecret: config.pms!.clientSecret,
        clientToken: config.pms!.clientToken,
        propertyIds: config.pms!.propertyIds,
      };
      const result = await rawQuery(pmsSourceConfig, { endpoint: params.endpoint, queryParams });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ── Tool: pricing_intel (requires RMS) ───────────────────────────────

if (rmsAdapter) {
  server.tool(
    "pricing_intel",
    "Compares RMS rate recommendations against actual PMS rates. Flags underpriced properties (revenue left on the table) and overpriced properties (vacancy risk). Shows daily revenue gap. Requires both PMS and RMS connected.",
    {
      startDate: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
      endDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
    },
    async (params) => {
      try {
        const result = await pricingIntel(pmsAdapter, rmsAdapter!, params);
        return { content: [{ type: "text" as const, text: formatPricingReport(result) }] };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}

// ── Tool: market_benchmark (requires STR) ────────────────────────────

if (strAdapter) {
  server.tool(
    "market_benchmark",
    "Compares your portfolio metrics against market-level benchmarks (comp set). Shows occupancy, ADR, RevPAR gaps per market. Overall performance assessment. Requires PMS and STR/AirDNA connected.",
    {
      startDate: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
      endDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
    },
    async (params) => {
      try {
        const result = await marketBenchmark(pmsAdapter, strAdapter!, params);
        return { content: [{ type: "text" as const, text: formatBenchmarkReport(result) }] };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}

// ── Tool: channel_mix (requires OTA) ─────────────────────────────────

if (otaAdapter) {
  server.tool(
    "channel_mix",
    "Analyzes booking source distribution across channels (Direct, Booking.com, Expedia, Airbnb). Shows gross revenue, commissions paid, net revenue, and profitability ranking per channel. Requires OTA connected.",
    {
      startDate: z.string().optional().describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
      endDate: z.string().optional().describe("End date (YYYY-MM-DD). Defaults to today."),
    },
    async (params) => {
      try {
        const result = await channelMix(otaAdapter!, params);
        return { content: [{ type: "text" as const, text: formatChannelReport(result) }] };
      } catch (error) {
        return errorResponse(error);
      }
    },
  );
}

// ── Formatting helpers ───────────────────────────────────────────────

function formatHealthReport(result: Awaited<ReturnType<typeof portfolioHealth>>): string {
  let report = `# Portfolio Health Snapshot\n\n`;
  report += `**PMS**: ${pmsAdapter.name} | **Properties**: ${result.totalProperties} | `;
  report += `**Period**: ${result.dateRange.start} to ${result.dateRange.end}\n\n`;

  report += `## Key Metrics\n\n`;
  report += `| Metric | Value |\n|--------|-------|\n`;
  report += `| Occupancy Rate | ${result.occupancyRate}% |\n`;
  report += `| Avg Daily Rate (ADR) | $${result.avgDailyRate} |\n`;
  report += `| RevPAR | $${result.revPAR} |\n`;
  report += `| Total Revenue | $${result.totalRevenue.toLocaleString()} |\n`;
  report += `| Booked Nights | ${result.totalBookedNights.toLocaleString()} |\n`;
  report += `| Available Nights | ${result.totalAvailableNights.toLocaleString()} |\n\n`;

  if (result.comparison) {
    report += `## Period Comparison (vs ${result.comparison.period})\n\n`;
    report += `| Metric | Change |\n|--------|--------|\n`;
    report += `| Occupancy | ${sign(result.comparison.occupancyChange)}pp |\n`;
    report += `| ADR | ${sign(result.comparison.adrChange, "$")} |\n`;
    report += `| RevPAR | ${sign(result.comparison.revPARChange, "$")} |\n`;
    report += `| Revenue | ${sign(result.comparison.revenueChange, "$")} |\n\n`;
  }

  if (result.outliers.length > 0) {
    report += `## Outlier Properties (>1 std dev from average)\n\n`;
    report += `| Property | Occupancy | ADR | Revenue | Why |\n`;
    report += `|----------|-----------|-----|---------|-----|\n`;
    for (const o of result.outliers) {
      report += `| ${o.propertyName} | ${o.occupancyRate}% | $${o.avgDailyRate} | $${o.totalRevenue.toLocaleString()} | ${o.reason} |\n`;
    }
    report += "\n";
  }

  if (result.properties.length <= 30) {
    report += `## All Properties\n\n`;
    report += `| Property | Occupancy | ADR | RevPAR | Revenue | Bookings |\n`;
    report += `|----------|-----------|-----|--------|---------|----------|\n`;
    const sorted = [...result.properties].sort((a, b) => b.totalRevenue - a.totalRevenue);
    for (const p of sorted) {
      report += `| ${p.propertyName} | ${p.occupancyRate}% | $${p.avgDailyRate} | $${p.revPAR} | $${p.totalRevenue.toLocaleString()} | ${p.reservationCount} |\n`;
    }
    report += "\n";
  } else {
    report += `## Top 20 Properties by Revenue\n\n`;
    report += `| Property | Occupancy | ADR | Revenue |\n`;
    report += `|----------|-----------|-----|---------|\n`;
    const sorted = [...result.properties].sort((a, b) => b.totalRevenue - a.totalRevenue).slice(0, 20);
    for (const p of sorted) {
      report += `| ${p.propertyName} | ${p.occupancyRate}% | $${p.avgDailyRate} | $${p.totalRevenue.toLocaleString()} |\n`;
    }
    report += `\n_Showing top 20 of ${result.properties.length} properties._\n\n`;
  }

  report += formatVerification(result.verification);
  return report;
}

function formatLeaksReport(result: Awaited<ReturnType<typeof revenueLeaks>>): string {
  let report = `# Revenue Leaks Report\n\n`;
  report += `**Period**: ${result.dateRange.start} to ${result.dateRange.end}\n\n`;
  report += `## Total Estimated Loss: $${result.totalEstimatedLoss.toLocaleString()}\n\n`;

  report += `| Leak Type | Count | Estimated Loss |\n`;
  report += `|-----------|-------|----------------|\n`;
  report += `| Cancellations | ${result.byType.cancellations.count} | $${result.byType.cancellations.loss.toLocaleString()} |\n`;
  report += `| No-Shows | ${result.byType.noShows.count} | $${result.byType.noShows.loss.toLocaleString()} |\n`;
  report += `| Gap Nights | ${result.byType.gapNights.count} | $${result.byType.gapNights.loss.toLocaleString()} |\n\n`;

  if (result.topLeakingProperties.length > 0) {
    report += `## Top Leaking Properties\n\n`;
    report += `| Property | Total Loss |\n|----------|------------|\n`;
    for (const p of result.topLeakingProperties) {
      report += `| ${p.propertyName} | $${p.totalLoss.toLocaleString()} |\n`;
    }
    report += "\n";
  }

  const topLeaks = result.leaks.slice(0, 20);
  if (topLeaks.length > 0) {
    report += `## Biggest Individual Leaks\n\n`;
    for (const leak of topLeaks) {
      const typeLabel = leak.type === "cancellation" ? "CANCELLATION" : leak.type === "no-show" ? "NO-SHOW" : "GAP NIGHTS";
      report += `- **[${typeLabel}] $${leak.estimatedLoss.toLocaleString()}** — ${leak.propertyName}: ${leak.details}\n`;
    }
    if (result.leaks.length > 20) report += `\n_Showing top 20 of ${result.leaks.length} leaks._\n`;
    report += "\n";
  }

  report += formatVerification(result.verification);
  return report;
}

function formatPricingReport(result: Awaited<ReturnType<typeof pricingIntel>>): string {
  let report = `# Pricing Intelligence Report\n\n`;
  report += `**Period**: ${result.dateRange.start} to ${result.dateRange.end} | `;
  report += `**Properties Analyzed**: ${result.totalProperties}\n\n`;
  report += `## Daily Revenue Left on the Table: $${result.totalDailyRevenueGap.toLocaleString()}\n\n`;

  if (result.underpriced.length > 0) {
    report += `## Underpriced Properties (raise rates)\n\n`;
    report += `| Property | Current Rate | Recommended | Daily Upside | Confidence |\n`;
    report += `|----------|-------------|-------------|--------------|------------|\n`;
    for (const p of result.underpriced) {
      report += `| ${p.propertyName} | $${p.currentRate} | $${p.recommendedRate} | +$${p.dailyUpsideLost} | ${p.confidence} |\n`;
    }
    report += "\n";
  }

  if (result.overpriced.length > 0) {
    report += `## Overpriced Properties (vacancy risk)\n\n`;
    report += `| Property | Current Rate | Recommended | Risk Level |\n`;
    report += `|----------|-------------|-------------|------------|\n`;
    for (const p of result.overpriced) {
      report += `| ${p.propertyName} | $${p.currentRate} | $${p.recommendedRate} | ${p.riskLevel} |\n`;
    }
    report += "\n";
  }

  report += formatVerification(result.verification);
  return report;
}

function formatBenchmarkReport(result: Awaited<ReturnType<typeof marketBenchmark>>): string {
  let report = `# Market Benchmark Report\n\n`;
  report += `**Period**: ${result.dateRange.start} to ${result.dateRange.end}\n\n`;
  report += `## Overall: ${result.overallAssessment}\n\n`;

  if (result.markets.length > 0) {
    report += `## Market Comparison\n\n`;
    report += `| Market | Your Occ | Market Occ | Gap | Your ADR | Market ADR | Gap | Your RevPAR | Market RevPAR | Gap |\n`;
    report += `|--------|----------|-----------|-----|----------|-----------|-----|-------------|--------------|-----|\n`;
    for (const m of result.markets) {
      report += `| ${m.market} | ${m.yourOccupancy}% | ${m.marketOccupancy}% | ${signNum(m.occupancyGap)}pp | $${m.yourADR} | $${m.marketADR} | ${signNum(m.adrGap, "$")} | $${m.yourRevPAR} | $${m.marketRevPAR} | ${signNum(m.revparGap, "$")} |\n`;
    }
    report += "\n";
  }

  report += formatVerification(result.verification);
  return report;
}

function formatChannelReport(result: Awaited<ReturnType<typeof channelMix>>): string {
  let report = `# Channel Mix Report\n\n`;
  report += `**Period**: ${result.dateRange.start} to ${result.dateRange.end}\n\n`;
  report += `**Total Gross Revenue**: $${result.totalGrossRevenue.toLocaleString()} | `;
  report += `**Total Commissions**: $${result.totalCommissions.toLocaleString()} | `;
  report += `**Net Revenue**: $${result.totalNetRevenue.toLocaleString()}\n\n`;
  report += `**Most Profitable**: ${result.bestChannel} | **Least Profitable**: ${result.worstChannel}\n\n`;

  report += `## By Channel\n\n`;
  report += `| Rank | Channel | Bookings | Gross Revenue | Commission | Net Revenue | Avg Rate | Cancel Rate |\n`;
  report += `|------|---------|----------|---------------|------------|-------------|----------|-------------|\n`;
  const sorted = [...result.channels].sort((a, b) => a.profitabilityRank - b.profitabilityRank);
  for (const ch of sorted) {
    report += `| #${ch.profitabilityRank} | ${ch.channel} | ${ch.bookings} | $${ch.grossRevenue.toLocaleString()} | ${ch.commissionPct}% ($${ch.commissionPaid.toLocaleString()}) | $${ch.netRevenue.toLocaleString()} | $${ch.avgRate} | ${(ch.cancellationRate * 100).toFixed(1)}% |\n`;
  }
  report += "\n";

  report += formatVerification(result.verification);
  return report;
}

function formatVerification(v: { totalClaims: number; verified: number; corrected: number; corrections: string[]; confidence: string; dataRange: string; propertiesIncluded: number }): string {
  let out = `---\n**Data Verification**: ${v.verified}/${v.totalClaims} claims verified against source data.\n`;
  if (v.corrections.length > 0) {
    out += `**Corrections applied**: ${v.corrections.join("; ")}\n`;
  }
  out += `**Confidence**: ${v.confidence} | **Data range**: ${v.dataRange} | **Properties**: ${v.propertiesIncluded}\n`;
  return out;
}

function sign(n: number, prefix = ""): string {
  const formatted = prefix ? `${prefix}${Math.abs(n).toLocaleString()}` : `${Math.abs(n)}`;
  return n >= 0 ? `+${formatted}` : `-${formatted}`;
}

function signNum(n: number, prefix = ""): string {
  const formatted = prefix ? `${prefix}${Math.abs(n)}` : `${Math.abs(n)}`;
  return n >= 0 ? `+${formatted}` : `-${formatted}`;
}

function errorResponse(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text" as const, text: `Error: ${msg}` }],
    isError: true,
  };
}

// ── Start server ─────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

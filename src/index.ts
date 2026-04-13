#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { PmsConfig } from "./types.js";
import { createAdapter } from "./adapters/index.js";
import { discoverSchema } from "./tools/discover.js";
import { portfolioHealth } from "./tools/portfolio-health.js";
import { revenueLeaks } from "./tools/revenue-leaks.js";
import { rawQuery } from "./tools/raw-query.js";

// ── Load config ──────────────────────────────────────────────────────

function loadConfig(): PmsConfig {
  const dir = dirname(fileURLToPath(import.meta.url));
  const configPath = resolve(dir, "..", "config.json");

  let config: PmsConfig;
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8")) as PmsConfig;
  } catch {
    console.error(
      `\nCannot read ${configPath}.\n` +
        `Copy config.example.json to config.json and add your PMS API key.\n`,
    );
    process.exit(1);
  }

  if (config.pms !== "demo" && (!config.apiKey || config.apiKey.includes("your-"))) {
    console.error(
      `\nAPI key not set in config.json.\n` +
        `Replace the placeholder with your real ${config.pms} API key.\n` +
        `Or set "pms" to "demo" to use mock data.\n`,
    );
    process.exit(1);
  }

  return config;
}

const config = loadConfig();
const adapter = createAdapter(config);

// ── Create MCP server ────────────────────────────────────────────────

const server = new McpServer({
  name: "hotel-agent",
  version: "0.1.0",
});

// ── Tool: discover_schema ────────────────────────────────────────────

server.tool(
  "discover_schema",
  "Shows what PMS is connected, how many properties, and what data/tools are available. Call this first to orient yourself before running analysis.",
  {},
  async () => {
    try {
      const schema = await discoverSchema(adapter);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(schema, null, 2),
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ── Tool: portfolio_health ───────────────────────────────────────────

server.tool(
  "portfolio_health",
  "Portfolio-wide health snapshot: occupancy rate, ADR (average daily rate), RevPAR, total revenue across all properties. Flags outlier properties performing above or below the portfolio average. Optional date range and period-over-period comparison. All numbers are independently verified against source data.",
  {
    startDate: z
      .string()
      .optional()
      .describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
    endDate: z
      .string()
      .optional()
      .describe("End date (YYYY-MM-DD). Defaults to today."),
    compareWith: z
      .enum(["previous-period", "same-period-last-year"])
      .optional()
      .describe("Compare current period with previous period or same period last year."),
  },
  async (params) => {
    try {
      const result = await portfolioHealth(adapter, params);
      return {
        content: [
          {
            type: "text" as const,
            text: formatHealthReport(result),
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ── Tool: revenue_leaks ──────────────────────────────────────────────

server.tool(
  "revenue_leaks",
  "Finds revenue leaks: cancellations, no-shows, and gap nights (empty nights between consecutive bookings). Estimates dollar impact for each leak using property-level average nightly rates. Ranks by loss amount. Shows top leaking properties. All numbers verified against source data.",
  {
    startDate: z
      .string()
      .optional()
      .describe("Start date (YYYY-MM-DD). Defaults to 30 days ago."),
    endDate: z
      .string()
      .optional()
      .describe("End date (YYYY-MM-DD). Defaults to today."),
    minImpact: z
      .number()
      .optional()
      .describe("Minimum dollar impact to include. Filters out small leaks. Default: 0."),
  },
  async (params) => {
    try {
      const result = await revenueLeaks(adapter, params);
      return {
        content: [
          {
            type: "text" as const,
            text: formatLeaksReport(result),
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ── Tool: raw_query ──────────────────────────────────────────────────

server.tool(
  "raw_query",
  "Direct API call to the PMS for anything the pre-built tools don't cover. Provide a REST endpoint path and optional query parameters. Use this to drill into specific properties, reservations, or data not covered by portfolio_health and revenue_leaks.",
  {
    endpoint: z
      .string()
      .describe("API endpoint path, e.g. '/reservations' or '/listings/PROPERTY_ID'"),
    queryParams: z
      .record(z.string(), z.string())
      .optional()
      .describe("Optional query parameters as key-value pairs."),
  },
  async (params) => {
    try {
      const queryParams: Record<string, string> | undefined = params.queryParams
        ? Object.fromEntries(
            Object.entries(params.queryParams).map(([k, v]) => [k, String(v)]),
          )
        : undefined;
      const result = await rawQuery(config, {
        endpoint: params.endpoint,
        queryParams,
      });
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      return errorResponse(error);
    }
  },
);

// ── Formatting helpers ───────────────────────────────────────────────

function formatHealthReport(result: Awaited<ReturnType<typeof portfolioHealth>>): string {
  let report = `# Portfolio Health Snapshot\n\n`;
  report += `**PMS**: ${adapter.name} | **Properties**: ${result.totalProperties} | `;
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
    const sorted = [...result.properties].sort(
      (a, b) => b.totalRevenue - a.totalRevenue,
    );
    for (const p of sorted) {
      report += `| ${p.propertyName} | ${p.occupancyRate}% | $${p.avgDailyRate} | $${p.revPAR} | $${p.totalRevenue.toLocaleString()} | ${p.reservationCount} |\n`;
    }
    report += "\n";
  } else {
    report += `## Top 20 Properties by Revenue\n\n`;
    report += `| Property | Occupancy | ADR | Revenue |\n`;
    report += `|----------|-----------|-----|---------|---|\n`;
    const sorted = [...result.properties]
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 20);
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
    report += `| Property | Total Loss |\n`;
    report += `|----------|------------|\n`;
    for (const p of result.topLeakingProperties) {
      report += `| ${p.propertyName} | $${p.totalLoss.toLocaleString()} |\n`;
    }
    report += "\n";
  }

  const topLeaks = result.leaks.slice(0, 20);
  if (topLeaks.length > 0) {
    report += `## Biggest Individual Leaks\n\n`;
    for (const leak of topLeaks) {
      const typeLabel =
        leak.type === "cancellation" ? "CANCELLATION" :
        leak.type === "no-show" ? "NO-SHOW" : "GAP NIGHTS";
      report += `- **[${typeLabel}] $${leak.estimatedLoss.toLocaleString()}** — ${leak.propertyName}: ${leak.details}\n`;
    }
    if (result.leaks.length > 20) {
      report += `\n_Showing top 20 of ${result.leaks.length} leaks._\n`;
    }
    report += "\n";
  }

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
  const formatted = prefix
    ? `${prefix}${Math.abs(n).toLocaleString()}`
    : `${Math.abs(n)}`;
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

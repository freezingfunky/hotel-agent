# Hotel Agent

**Stop logging into dashboards. Ask Claude instead.**

Hotel Agent connects your PMS, RMS, STR benchmarks, and OTA channels to Claude — giving you an AI revenue analyst that works 24/7. Every number is independently verified against your source data before it reaches you.

---

## What You Get

Open Claude Desktop and ask:

- **"What's my portfolio health this month?"** — Occupancy, ADR, RevPAR across every property. Outliers flagged automatically.
- **"Where am I losing money?"** — Cancellations, no-shows, gap nights ranked by dollar impact.
- **"Are my rates competitive?"** — RMS recommendations vs your actual rates, with daily revenue left on the table.
- **"How do I compare to my comp set?"** — Your metrics vs market benchmarks from AirDNA/STR data.
- **"Which channels are most profitable?"** — Booking source mix, commission costs, net revenue per channel.
- **"Compare this quarter vs last."** — Period-over-period trends with directional arrows.

Every response includes a verification footer:

```
Data Verification: 6/6 claims verified against source data.
Confidence: HIGH | Data range: 2026-03-12 to 2026-04-11 | Properties: 42
```

---

## Supported Platforms

### PMS (Property Management Systems)

| PMS | Auth Method | Status |
|-----|-------------|--------|
| **Guesty** | OAuth2 Client Credentials | Ready |
| **Hostaway** | OAuth2 Client Credentials | Ready |
| **Cloudbeds** | API Key + Property IDs | Ready |
| **Mews** | Client Token + Access Token | Ready |
| **Apaleo** | OAuth2 Bearer Token | Ready |

### RMS (Revenue Management Systems)

| RMS | Auth Method | Status |
|-----|-------------|--------|
| **RoomPriceGenie** | API Key (Bearer) | Ready |
| **IDeaS** | API Key | Ready |

### STR (Benchmarking)

| Provider | Auth Method | Status |
|----------|-------------|--------|
| **AirDNA** | Bearer Token | Ready |

### OTA (Online Travel Agencies)

| OTA | Auth Method | Status |
|-----|-------------|--------|
| **Booking.com** | Token Auth (Partner) | Ready |
| **Expedia** | Signature Auth (Partner) | Ready |

Don't see yours? [Open an issue](https://github.com/freezingfunky/hotel-agent/issues) or reach out.

---

## Quick Setup (5 minutes)

### Option A: One-Command Install

```bash
bash <(curl -sL https://raw.githubusercontent.com/freezingfunky/hotel-agent/main/setup.sh)
```

### Option B: Manual Setup

#### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Claude Desktop](https://claude.ai/download)
- API credentials from your platforms

#### 1. Clone and build

```bash
git clone https://github.com/freezingfunky/hotel-agent.git
cd hotel-agent
npm install
npm run build
```

#### 2. Configure your data sources

```bash
cp config.example.json config.json
```

Edit `config.json`. Each source is optional — only PMS is required:

**Full config (all 4 sources):**
```json
{
  "pms": { "provider": "guesty", "apiKey": "your-key", "clientSecret": "your-secret" },
  "rms": { "provider": "roompricegenie", "apiKey": "your-key" },
  "str": { "provider": "airdna", "apiKey": "your-key" },
  "ota": { "provider": "booking", "apiKey": "your-key" }
}
```

**PMS only (minimum):**
```json
{
  "pms": { "provider": "guesty", "apiKey": "your-key", "clientSecret": "your-secret" }
}
```

**Demo mode (no credentials needed):**
```json
{
  "pms": { "provider": "demo", "apiKey": "not-needed" },
  "rms": { "provider": "demo", "apiKey": "not-needed" },
  "str": { "provider": "demo", "apiKey": "not-needed" },
  "ota": { "provider": "demo", "apiKey": "not-needed" }
}
```

**Legacy format still works:**
```json
{
  "pms": "guesty",
  "apiKey": "your-key",
  "clientSecret": "your-secret"
}
```

#### 3. Connect to Claude Desktop

Open your Claude Desktop config:

- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

Add the `hotel-agent` entry under `mcpServers`:

```json
{
  "mcpServers": {
    "hotel-agent": {
      "command": "node",
      "args": ["/full/path/to/hotel-agent/dist/index.js"]
    }
  }
}
```

#### 4. Restart Claude Desktop

Quit and reopen. Look for the tools icon in the chat input.

---

## Tools

| Tool | Data Source | What It Does |
|------|-----------|-------------|
| `discover_schema` | All | Shows connected sources, property count, and available tools |
| `portfolio_health` | PMS | Occupancy, ADR, RevPAR across all properties. Flags outliers. Period comparison |
| `revenue_leaks` | PMS | Cancellations, no-shows, gap nights with dollar impact. Ranked by loss |
| `pricing_intel` | PMS + RMS | Compares RMS recommendations vs actual rates. Flags underpriced/overpriced |
| `market_benchmark` | PMS + STR | Your portfolio vs market comp set. Occupancy, ADR, RevPAR gaps |
| `channel_mix` | OTA | Booking source distribution, commission costs, net revenue per channel |
| `raw_query` | PMS | Direct PMS API call for anything the pre-built tools don't cover |

Tools only appear in Claude when their required data source is configured.

---

## Architecture

```
src/
├── index.ts                   # MCP server + tool registration
├── types.ts                   # All interfaces (adapters, entities, results)
├── http.ts                    # Rate limiter, cache, HTTP helpers
├── verify.ts                  # Independent number verification engine
├── mock-adapter.ts            # PMS mock data (30 properties, 6mo history)
├── adapters/
│   ├── index.ts               # PMS adapter factory
│   ├── guesty.ts              # Guesty connector
│   ├── hostaway.ts            # Hostaway connector
│   ├── cloudbeds.ts           # Cloudbeds connector
│   ├── mews.ts                # Mews connector
│   ├── apaleo.ts              # Apaleo connector
│   ├── rms/
│   │   ├── index.ts           # RMS adapter factory
│   │   ├── roompricegenie.ts  # RoomPriceGenie connector
│   │   ├── ideas.ts           # IDeaS connector
│   │   └── mock-rms.ts        # Mock rate data
│   ├── str/
│   │   ├── index.ts           # STR adapter factory
│   │   ├── airdna.ts          # AirDNA connector
│   │   └── mock-str.ts        # Mock market benchmarks
│   └── ota/
│       ├── index.ts           # OTA adapter factory
│       ├── booking.ts         # Booking.com connector
│       ├── expedia.ts         # Expedia connector
│       └── mock-ota.ts        # Mock channel data
├── tools/
│   ├── discover.ts            # Schema discovery
│   ├── portfolio-health.ts    # Portfolio health analysis
│   ├── revenue-leaks.ts       # Revenue leak detection
│   ├── pricing-intel.ts       # RMS vs actual rate comparison
│   ├── market-benchmark.ts    # Market comp set analysis
│   ├── channel-mix.ts         # Channel profitability analysis
│   └── raw-query.ts           # Direct API passthrough
└── __tests__/                 # 91 unit + integration tests
```

---

## For Developers

```bash
npm run build        # Compile TypeScript
npm test             # Run test suite (91 tests)
npm run test:watch   # Tests in watch mode
```

---

## Need Help Setting Up?

I'll personally help you connect your platforms. Takes 15 minutes on a call.

**DM me on [LinkedIn](https://linkedin.com/in/freezingfunky) or [open an issue](https://github.com/freezingfunky/hotel-agent/issues).**

---

## License

MIT

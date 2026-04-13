# Hotel Agent

**Stop logging into dashboards. Ask Claude instead.**

Hotel Agent connects your Property Management System to Claude and gives you an AI revenue analyst that works 24/7. Every number is independently verified against your source data before it reaches you.

---

## What You Get

Open Claude Desktop and ask:

- **"What's my portfolio health this month?"** — Occupancy, ADR, RevPAR across every property. Outliers flagged automatically.
- **"Where am I losing money?"** — Cancellations, no-shows, gap nights ranked by dollar impact.
- **"Compare this quarter vs last."** — Period-over-period trends with directional arrows.
- **"Show me check-ins arriving today."** — Direct PMS queries for anything the reports don't cover.

Every response includes a verification footer:

```
Data Verification: 6/6 claims verified against source data.
Confidence: HIGH | Data range: 2026-03-12 to 2026-04-11 | Properties: 42
```

If the math doesn't check out, it auto-corrects and shows its work.

---

## Supported PMS Platforms

| PMS | Auth Method | Status |
|-----|-------------|--------|
| **Guesty** | OAuth2 Client Credentials | ✅ Ready |
| **Hostaway** | OAuth2 Client Credentials | ✅ Ready |
| **Cloudbeds** | API Key + Property IDs | ✅ Ready |
| **Mews** | Client Token + Access Token | ✅ Ready |
| **Apaleo** | OAuth2 Bearer Token | ✅ Ready |
| **Demo** | No key needed | ✅ Built-in |

Don't see yours? [Open an issue](https://github.com/ashwingupta/hotel-agent/issues) or reach out — we'll build it.

---

## Quick Setup (5 minutes)

### Option A: One-Command Install

```bash
bash <(curl -sL https://raw.githubusercontent.com/ashwingupta/hotel-agent/main/setup.sh)
```

This will:
1. Check Node.js is installed (20+)
2. Clone the repo to `~/hotel-agent`
3. Install dependencies and build
4. Walk you through connecting your PMS (API key prompts)
5. Auto-configure Claude Desktop

Then restart Claude Desktop and you're live.

### Option B: Manual Setup

#### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [Claude Desktop](https://claude.ai/download)
- API credentials from your PMS

#### 1. Clone and build

```bash
git clone https://github.com/ashwingupta/hotel-agent.git
cd hotel-agent
npm install
npm run build
```

#### 2. Add your API key

```bash
cp config.example.json config.json
```

Edit `config.json` with your PMS credentials:

**Guesty:**
```json
{
  "pms": "guesty",
  "apiKey": "your-client-id",
  "clientSecret": "your-client-secret"
}
```

**Hostaway:**
```json
{
  "pms": "hostaway",
  "apiKey": "your-account-id",
  "clientSecret": "your-api-secret"
}
```

**Cloudbeds:**
```json
{
  "pms": "cloudbeds",
  "apiKey": "your-api-key",
  "propertyIds": ["12345", "67890"]
}
```

**Mews:**
```json
{
  "pms": "mews",
  "apiKey": "your-access-token",
  "clientToken": "your-client-token"
}
```

**Apaleo:**
```json
{
  "pms": "apaleo",
  "apiKey": "your-oauth-bearer-token",
  "clientSecret": "your-client-secret"
}
```

**Demo (no credentials needed):**
```json
{
  "pms": "demo",
  "apiKey": "not-needed"
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

Replace `/full/path/to/hotel-agent` with where you cloned the repo.

#### 4. Restart Claude Desktop

Quit and reopen. Look for the tools icon in the chat input.

---

## Tools

| Tool | What It Does |
|------|-------------|
| `discover_schema` | Shows connected PMS, property count, and available data |
| `portfolio_health` | Occupancy, ADR, RevPAR across all properties. Flags outliers. Optional period comparison |
| `revenue_leaks` | Cancellations, no-shows, gap nights with dollar impact. Ranked by loss |
| `raw_query` | Direct PMS API call for anything the pre-built tools don't cover |

---

## How Verification Works

Every analysis tool runs a verification step before returning results:

1. Computes all metrics from raw reservation and property data
2. Re-derives every number independently
3. Checks for mismatches between reported and recalculated values
4. Auto-corrects any discrepancies
5. Runs sanity checks (occupancy > 100%? ADR < $10?)
6. Attaches a confidence rating (HIGH / MEDIUM / LOW) with corrections shown

---

## For Developers

```bash
npm run build        # Compile TypeScript
npm test             # Run test suite (51 tests)
npm run test:watch   # Tests in watch mode
```

### Architecture

```
src/
├── index.ts              # MCP server entry point + tool registration
├── types.ts              # Shared interfaces (Property, Reservation, PmsAdapter)
├── http.ts               # Rate limiter, cache, HTTP helpers
├── verify.ts             # Independent number verification engine
├── mock-adapter.ts       # Deterministic mock data for testing/demos
├── adapters/
│   ├── index.ts          # Adapter factory (config → adapter instance)
│   ├── guesty.ts         # Guesty API connector
│   ├── hostaway.ts       # Hostaway API connector
│   ├── cloudbeds.ts      # Cloudbeds API connector
│   ├── mews.ts           # Mews API connector
│   └── apaleo.ts         # Apaleo API connector
├── tools/
│   ├── discover.ts       # Schema discovery tool
│   ├── portfolio-health.ts  # Portfolio health analysis
│   ├── revenue-leaks.ts  # Revenue leak detection
│   └── raw-query.ts      # Direct API passthrough
└── __tests__/            # Unit + integration tests
```

---

## Need Help Setting Up?

I'll personally help you connect your PMS. Takes 15 minutes on a call.

**DM me on [LinkedIn](https://linkedin.com/in/ashwingupta) or [open an issue](https://github.com/ashwingupta/hotel-agent/issues).**

---

## License

MIT

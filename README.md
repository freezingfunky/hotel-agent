# PMS Copilot

AI revenue analyst for hospitality. Connects your PMS to Claude and surfaces portfolio insights backed by verified numbers.

## What It Does

Ask Claude questions about your hotel/STR portfolio and get answers backed by real data:

- "What's my portfolio health this month?"
- "Where am I leaking revenue?"
- "Which properties are underperforming and why?"
- "Compare this quarter to last quarter."

Every number in every response is independently verified against source data. If the math doesn't check out, it auto-corrects and shows its work.

## Supported PMS Platforms

- **Guesty** (Bearer token auth)
- **Hostaway** (Bearer token auth)

More coming soon. Reach out if yours isn't listed.

## Setup (15 minutes)

### Prerequisites

- [Node.js](https://nodejs.org/) 20 or later
- [Claude Desktop](https://claude.ai/download)
- API key from your PMS

### Step 1: Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/pms-copilot.git
cd pms-copilot
npm install
npm run build
```

### Step 2: Add your API key

```bash
cp config.example.json config.json
```

Edit `config.json`:

```json
{
  "pms": "guesty",
  "apiKey": "YOUR_ACTUAL_API_KEY"
}
```

**For Guesty**: Get your API key from Settings > API in your Guesty dashboard. You need a Bearer token (OAuth2 access token).

**For Hostaway**: Get your API key from Settings > Integrations > API in Hostaway. Use the Secret API Key.

### Step 3: Connect to Claude Desktop

Open Claude Desktop settings and edit the config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

Add this to the `mcpServers` section:

```json
{
  "mcpServers": {
    "pms-copilot": {
      "command": "node",
      "args": ["/FULL/PATH/TO/pms-copilot/dist/index.js"]
    }
  }
}
```

Replace `/FULL/PATH/TO/pms-copilot` with the actual path where you cloned the repo.

### Step 4: Restart Claude Desktop

Quit and reopen Claude Desktop. You should see "pms-copilot" in the MCP tools list.

### Step 5: Start asking

Try these:

1. "What PMS am I connected to and what data is available?" (calls `discover_schema`)
2. "Show me my portfolio health for the last 30 days." (calls `portfolio_health`)
3. "Where am I leaking revenue? Show me cancellations, no-shows, and gap nights." (calls `revenue_leaks`)
4. "Compare my occupancy this month vs last month." (calls `portfolio_health` with comparison)

## Available Tools

| Tool | What It Does |
|------|-------------|
| `discover_schema` | Shows connected PMS, property count, available data and tools |
| `portfolio_health` | Occupancy, ADR, RevPAR across all properties. Flags outliers. Optional period comparison |
| `revenue_leaks` | Cancellations, no-shows, gap nights with dollar impact. Ranked by loss |
| `raw_query` | Direct PMS API call for anything the pre-built tools don't cover |

## How Verification Works

Every analysis tool runs a verification step before returning results:

1. Computes all metrics from raw reservation and property data
2. Re-derives every number independently
3. Checks for mismatches between reported and recalculated values
4. Auto-corrects any discrepancies
5. Runs sanity checks (occupancy > 100%? ADR < $10?)
6. Attaches a confidence rating (HIGH / MEDIUM / LOW) and shows corrections

You'll see a verification footer at the bottom of every report:

```
Data Verification: 6/6 claims verified against source data.
Confidence: HIGH | Data range: 2026-03-12 to 2026-04-11 | Properties: 42
```

## Development

```bash
npm run dev          # Run with tsx (hot reload)
npm run build        # Compile TypeScript
npm test             # Run tests
npm run test:watch   # Tests in watch mode
```

## License

MIT

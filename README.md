# mortgage-rates-today-mcp

Mortgage rates today for AI assistants. Ask for this week's average 30-year or 15-year fixed rate and get the Freddie Mac number, the change from last week and a year ago, and what it means for a monthly payment.

This is a Model Context Protocol (MCP) server. It reads the Freddie Mac Primary Mortgage Market Survey (PMMS) at call time. It needs no API key.

## Tools

| Tool | What it returns |
| --- | --- |
| `get_mortgage_rates_today` | This week's Freddie Mac average 30-year and 15-year fixed rates, the change from last week and a year ago, the 52-week high, low and average, the week date and the next release date. |
| `get_mortgage_rate_on_date` | The weekly average in force on any date since April 1971, with the 5/1 ARM and points where Freddie Mac published them. |
| `get_mortgage_rate_history` | Weekly rows or monthly or annual averages for a date range, with the high, low and change. |
| `calculate_mortgage_payment` | Monthly principal and interest at today's average (or any rate), compared with the average a year earlier. |

Every result has structured JSON, a one-paragraph summary, `as_of`, `source` (freddiemac.com/pmms), the data file URL and `more` (a page on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=mortgage-rates-today-mcp)). Results carry the Freddie Mac attribution.

## What it knows that your model does not

- This week's rate. Freddie Mac publishes a new national average every Thursday at noon Eastern, so any number in a model's training data is out of date.
- The exact weekly history since 1971, for questions like "what was the rate when I bought in March 2021".
- Payment math tied to the current average, so the comparison with a year ago uses real numbers.

## Install

### Hosted (Claude.ai custom connector, ChatGPT developer mode)

Paste this URL. No token, no sign-up. It works now.

```
https://mortgage-rates-today-mcp.lipmichal.workers.dev/mcp
```

### Claude Code

```
claude mcp add --transport http mortgage-rates https://mortgage-rates-today-mcp.lipmichal.workers.dev/mcp
```

### Claude Desktop

Claude Desktop adds remote servers under Settings, Connectors, Add custom connector. Paste the URL above.

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mortgage-rates": { "url": "https://mortgage-rates-today-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

### VS Code

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "mortgage-rates": { "type": "http", "url": "https://mortgage-rates-today-mcp.lipmichal.workers.dev/mcp" }
  }
}
```

### Local stdio (after npm release)

The npm package is not published yet. After it is, run it locally with Node 20 or newer:

```
claude mcp add mortgage-rates -- npx -y mortgage-rates-today-mcp
```

## Example prompts

- "What are mortgage rates today?"
- "What is the average 30-year fixed mortgage rate this week, and is it up or down?"
- "What was the 30-year mortgage rate in January 2021?"
- "Show me the monthly average 15-year rate since 2024."
- "What is the monthly payment on a $400,000 loan at today's rate, compared with a year ago?"

## Data sources

Full list with fetch dates in [DATA_SOURCES.md](DATA_SOURCES.md).

- [Freddie Mac Primary Mortgage Market Survey](https://www.freddiemac.com/pmms), history file [PMMS_history.csv](https://www.freddiemac.com/pmms/docs/PMMS_history.csv). Source: Freddie Mac.

## Limitations

- PMMS is a national weekly average for well-qualified conventional purchase borrowers with 20 percent down. It is not a quote. Your rate depends on credit, down payment, points, loan type, state and lender.
- No daily rates, no FHA, VA or jumbo series, and no ARM data after November 2022.
- The hosted server caches the file for up to an hour, so a new Thursday release can take up to an hour to appear.
- Payments exclude taxes, insurance, PMI and HOA dues.

## More

More MCP servers that answer questions your assistant cannot answer alone are on [mcpstamp.com](https://www.mcpstamp.com/servers/?utm_source=mcp&utm_medium=mortgage-rates-today-mcp).

Part of the Zovo MCP collection: https://mcp.zovo.one

Built by [theluckystrike](https://github.com/theluckystrike).

## Development

```
npm install
npm test                              # builds, then runs the fixture tests and an offline stdio test
node scripts/stdio-transcript.mjs     # live stdio round trip, writes .live/stdio-transcript.jsonl
```

## License

MIT

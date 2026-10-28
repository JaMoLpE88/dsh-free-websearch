# Security policy

## Reporting

Open a private advisory on GitHub, or an issue if the report contains no sensitive detail.
Please include the DSH version, the plugin version, and the lane involved.

## What this plugin handles

- **No credentials.** The plugin never imports `ctx.credentials` and never reads
  `DEEPSEEK_API_KEY`, `TAVILY_API_KEY`, `EXA_API_KEY`, `FIRECRAWL_API_KEY` or any other key.
  It cannot spend one, and it cannot leak one.
- **No stored state.** No config file, no cache on disk, no history, no cookies, no local
  storage. The result cache lives in memory and dies with the process.
- **Queries leave the machine** to the search lane that answers, and to each lane tried
  before it: `api.keenable.ai`, `api.firecrawl.dev`, `www.bing.com`, `html.duckduckgo.com`,
  `api.you.com`. All over HTTPS.
- **Page URLs** are read locally first. A URL reaches `api.firecrawl.dev` only when the local
  read produced a wall, an empty body or a JavaScript shell, **and** every resolved address
  of the host is public. Loopback, private (10/8, 172.16/12, 192.168/16), CGNAT (100.64/10),
  link-local (169.254/16, fe80::/10), unique-local (fc00::/7) and `localhost`-style hostnames
  are never disclosed. An unresolvable host is not disclosed either.
- **Responses are treated as untrusted.** Search results are data: they are normalized to
  URL, title, snippet and date, stripped of markup, and capped in length. The plugin does not
  execute, evaluate or fetch anything a result suggests.

## What it deliberately does not do

- No background requests, no telemetry, no analytics, no update check.
- No remote code, no dynamic import of a URL, no shell.
- No writes outside the harness's own settings document when the bundle patch did not apply.

## Supply chain

The package has **zero runtime dependencies**. `lib/` is plain JavaScript with no build step,
so what the registry serves is exactly what runs.

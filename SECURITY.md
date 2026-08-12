# Security policy

## Supported versions

Security fixes are applied to the latest published version.

## Reporting

Report vulnerabilities privately to samihalawa@gmail.com. Do not include browser profiles, cookies, API keys, CDP URLs, captured response bodies, or account data in an issue.

## Security model

- Local automation uses a dedicated Playwright persistent profile under the configured state directory. It never opens the user's normal Chrome profile.
- Profile and state directories are forced to mode `0700` on POSIX systems.
- API keys are read from environment variables only. Configuration files may contain aliases, provider IDs, profile names, defaults, and non-secret base URLs, but never secrets.
- Literal `Cookie` request headers are rejected. Destination-scoped session cookies are read from the Playwright browser context only in memory and recomputed at every redirect hop. Cookie and `Set-Cookie` headers are never returned.
- The LinkedIn web preset derives `csrf-token` from `JSESSIONID` in memory and never returns either value.
- API keys, authorization fields, cookies, task secrets, URL userinfo/query secrets, CDP/connect URLs, structured JSON strings, and common raw-body secret forms are recursively redacted from results and errors.
- Request, streamed HTTP response, screenshot, capture, network-body/aggregate/pending-work, MCP-buffer, and JavaScript-source sizes are bounded.
- `LINKEDIN_GODMODE_HOST_ALLOWLIST` optionally restricts HTTP requests/redirect hops and browser main-frame routing, with pre/post checks around explicit navigation and actions. Cross-origin HTTP redirects strip authorization, CSRF/XSRF, and secret-bearing headers. `LINKEDIN_GODMODE_READ_ONLY=1` blocks mutating HTTP verbs, mutating locator actions, JavaScript evaluation, and provider AI tasks.
- HTTP writes are never retried implicitly. Provider clients are configured with zero retries where supported.
- MCP mode writes protocol data only to stdout. Diagnostics and fatal errors use stderr.

Persistent authenticated browser profiles are credentials. Exclude the state directory from cloud sync and backups, restrict filesystem access, and delete profiles when no longer needed.

## Scope limits

This package does not bypass challenges, import or export cookie files, evade rate limits, schedule campaigns, or run hidden autonomous loops. Generic primitives remain powerful: callers are responsible for authorization, review, site terms, and verifying visible outcomes.

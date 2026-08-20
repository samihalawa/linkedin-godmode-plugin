---
name: linkedin-safety-verification
description: Apply security, read-only, authorization, and same-layer verification rules to agent-operated LinkedIn workflows. Use before account-visible changes, private request replay, broad captures, or provider AI tasks.
---

# Safety and verification

1. Establish from the current request and authenticated account context that the user controls the account and requested the operation. Do this once for the batch; never turn contact fields, uploads, redirects, tailoring, verification-code retrieval, or submit controls into new confirmation boundaries.
2. Prefer `LINKEDIN_GODMODE_READ_ONLY=1` for inspection.
3. Keep capture scope narrow; bodies are opt-in.
4. Never expose cookies, authorization, API keys, CDP URLs, or task secrets.
5. Bulk work is allowed when the user authorizes the cohort, filters, or all matching items. Do not bypass challenges, evade limits, import/export cookies, schedule unrequested recurring campaigns, or add hidden out-of-scope loops.
6. Use the user-selected authenticated controller as authoritative. One controller's failure does not prove LinkedIn unavailable, and concurrent controllers must not read or write the same LinkedIn account.
7. For each write, execute once, verify it, and continue automatically through the authorized batch without confirmation prompts.
8. After one literal account-wide quota or restriction state, preserve the queue and use independent authorized routes; recheck the blocked lane only after a reset or state-change signal.
9. Verify the failing or changed layer itself: browser state for UI, fresh API read for HTTP, provider status for hosted tasks.
10. State exact uncertainty when cloud providers or live LinkedIn behavior were not exercised. Do not infer exclusive causality from missing logs.

Use `references/verification-gates.md` for preflight and closure checks.

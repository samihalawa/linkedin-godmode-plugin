---
name: linkedin-safety-verification
description: Apply security, read-only, authorization, and same-layer verification rules to agent-operated LinkedIn workflows. Use before account-visible changes, private request replay, broad captures, or provider AI tasks.
---

# Safety and verification

1. Confirm the user controls the account and requested the operation.
2. Prefer `LINKEDIN_GODMODE_READ_ONLY=1` for inspection.
3. Keep capture scope narrow; bodies are opt-in.
4. Never expose cookies, authorization, API keys, CDP URLs, or task secrets.
5. Do not bypass challenges, evade limits, import/export cookies, schedule campaigns, or add hidden loops.
6. For writes, execute once without implicit retry.
7. Verify the failing or changed layer itself: browser state for UI, fresh API read for HTTP, provider status for hosted tasks.
8. State exact uncertainty when cloud providers or live LinkedIn behavior were not exercised.

Use `references/verification-gates.md` for preflight and closure checks.

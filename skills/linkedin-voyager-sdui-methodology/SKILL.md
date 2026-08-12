---
name: linkedin-voyager-sdui-methodology
description: Apply capture-first methodology to LinkedIn Voyager and SDUI traffic without hardcoding mutable endpoints. Use when interpreting captured LinkedIn web requests, query IDs, form state, decorations, or response shapes.
---

# Voyager and SDUI methodology

Treat Voyager and SDUI as observed private web protocols, not stable APIs.

1. Capture the exact current UI flow.
2. Group calls by causal order and identify the smallest request that performs or verifies the operation.
3. Preserve opaque IDs exactly as captured for that session; never promote them into tool names or source constants.
4. Replay reads before writes when possible.
5. For SDUI, preserve prerequisite state/component calls if the final submit depends on them.
6. Verify writes with a fresh independent read or UI state.

Read `references/protocol-notes.md` before interpreting opaque IDs or nested form state.

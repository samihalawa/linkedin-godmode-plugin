---
name: linkedin-browser-providers
description: Select and operate the local Playwright, Browserbase, or Anchor Browser provider for an authorized LinkedIn workflow. Use when session persistence, cloud browser attachment, provider profiles/contexts, or explicit hosted browser tasks matter.
---

# Browser providers

- **Selected controller:** when the user names an authenticated controller such as the in-app Browser, keep it authoritative and do not open a concurrent provider session.
- **Local:** default only when no controller was selected; dedicated persistent profile; best for one-time human login and deterministic Playwright operations.
- **Browserbase:** use a Context ID for persistence and a session ID for live attachment. Current hosted runs accept agent ID/schema/variables, not model selection.
- **Anchor:** use a profile name for persistence and a session ID for live attachment. Explicit tasks may accept agent/provider/model and task controls.

Call `doctor`, then `browser_session`. Never request, print, or store provider keys or CDP URLs. Provider tasks are explicit only; never substitute them for deterministic operations silently.

See `references/provider-matrix.md` for identifiers and lifecycle.

---
name: linkedin-operator
description: Operate the user's personal LinkedIn session with the plugin's generic browser and HTTP primitives. Use for authorized LinkedIn reading or changes when the caller must discover the current UI/request shape instead of relying on hardcoded business-action tools.
---

# LinkedIn operator

1. Honor the user's explicitly selected authenticated controller. If the in-app Browser is named, do not open or treat another provider session as authoritative. For plugin-managed sessions, call `browser_session` status/list before opening another session.
2. Prefer the dedicated local profile only when no controller was selected; use Anchor or Browserbase only when requested or configured.
3. Read current state with `browser_capture`. Use accessible role/label/text locators before CSS/XPath.
4. For UI work, call `browser_navigate` and `browser_act` with explicit caller-reviewed arguments.
5. For private web requests, follow the capture-first method in `references/operator-method.md`; never guess a mutable endpoint.
6. Before an account-visible change, inspect the target, execute once, and verify at the same layer. Do not infer success from a click alone.
7. Never add unrequested loops, scheduling, campaign scope, challenge bypass, or cookie import/export. A caller's explicitly authorized batch may iterate through matching targets; do not re-gate each write or silently broaden that batch.

Use `browser_task` only when the user explicitly requests a provider AI task. Deterministic tools never need it.

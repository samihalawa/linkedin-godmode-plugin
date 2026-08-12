---
name: linkedin-operator
description: Operate the user's personal LinkedIn session with the plugin's generic browser and HTTP primitives. Use for authorized LinkedIn reading or changes when the caller must discover the current UI/request shape instead of relying on hardcoded business-action tools.
---

# LinkedIn operator

1. Call `browser_session` status/list before opening another session.
2. Prefer the dedicated local profile for interactive login; use Anchor or Browserbase only when requested or configured.
3. Read current state with `browser_capture`. Use accessible role/label/text locators before CSS/XPath.
4. For UI work, call `browser_navigate` and `browser_act` with explicit caller-reviewed arguments.
5. For private web requests, follow the capture-first method in `references/operator-method.md`; never guess a mutable endpoint.
6. Before an account-visible change, inspect the target, execute once, and verify at the same layer. Do not infer success from a click alone.
7. Never add loops, scheduling, campaign behavior, challenge bypass, or cookie import/export.

Use `browser_task` only when the user explicitly requests a provider AI task. Deterministic tools never need it.

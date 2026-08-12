---
name: linkedin-network-capture-replay
description: Discover and replay current browser requests with generic network and HTTP tools. Use when an authorized LinkedIn workflow is more reliable through a captured request than fragile UI locators.
---

# Network capture and replay

1. Start `browser_network` with bodies disabled.
2. Produce exactly one relevant browser interaction.
3. Read and filter by URL, method, resource type, and status.
4. If needed, clear and repeat with bodies enabled and narrow caps.
5. Build a generic `http_request`; never supply a literal `Cookie` header.
6. Use `sessionId` for in-memory browser cookies. Use `linkedinWebPreset` only when the captured request requires `csrf-token`.
7. Replay once. Do not retry writes implicitly.
8. Verify through a fresh read or visible capture.

See `references/replay-checklist.md` for minimization and redaction rules.

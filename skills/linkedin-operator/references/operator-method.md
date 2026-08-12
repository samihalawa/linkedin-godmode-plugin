# Operator method

## UI-first

Capture → choose a stable accessible locator → act once → capture the resulting state. If the visible result is ambiguous, inspect network evidence or reload before claiming success.

## Request-first

Start `browser_network` without bodies, perform the relevant UI interaction manually or with one generic action, then read capture. Repeat narrowly with `includeBodies:true` only when payload discovery is necessary. Copy the current URL, method, required non-secret headers, and body into `http_request`; use `sessionId` for in-memory cookies and `linkedinWebPreset:true` only on LinkedIn hosts. Verify the result independently.

Treat query IDs, SDUI forms, decoration IDs, selectors, and payload fields as observed runtime data, not durable product APIs.

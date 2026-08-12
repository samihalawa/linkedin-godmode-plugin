# Provider matrix

| Provider | Persistent identifier | Live identifier | Task API |
|---|---|---|---|
| Local Playwright | dedicated profile alias/directory | in-process session ID | unsupported; no local AI dependency |
| Browserbase | Context ID | Browserbase session ID | Agents/Runs; managed model, no caller model field in SDK 2.16.0 |
| Anchor Browser | profile name or identity ID | Anchor session ID | `Tools.performWebTask`; explicit model/provider options in SDK 1.0.0 |

Closing a local session closes the persistent context. Owned Browserbase/Anchor sessions are released or deleted on close. Attached cloud sessions disconnect locally unless `terminate:true` is explicitly supplied to `browser_session close`. Provider credentials stay in environment variables. Live cloud behavior must be validated with the user's account before claiming production success.

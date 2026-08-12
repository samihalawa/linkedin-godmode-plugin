# Protocol notes

Voyager commonly uses Rest.li-style request conventions and opaque query/decorations identifiers. SDUI commonly couples rendered component state to later form submissions. Both change without notice.

Evidence ranking:

1. A fresh successful request captured from the exact user flow.
2. A replay in the same authenticated browser context.
3. A separate read proving the intended resulting state.
4. Prior documentation or historical captures only as discovery hints.

Do not infer that a sibling action shares an endpoint, payload, or query ID. Do not claim a write succeeded from status code alone. Never retain cookie material in protocol notes.

# Verification gates

## Before

- Exact target and intended effect are visible.
- Current session/provider is known.
- Host allowlist and read-only state are appropriate.
- The operation is not bulk, scheduled, evasive, or challenge-bypassing.
- A write has an independent verification path.

## After

- Transport success was not mistaken for product success.
- The resulting browser/API/provider state was read back.
- No raw secrets appear in output, errors, screenshots, or captures.
- Capture was stopped and sensitive temporary output was not persisted.
- Any provider path not exercised live is labeled unverified.

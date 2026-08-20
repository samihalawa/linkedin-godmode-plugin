# Verification gates

## Before

- Exact target/filter and intended effect are bound; individual matching targets may be resolved during the authorized batch.
- Current session/provider is known.
- Host allowlist and read-only state are appropriate.
- Bulk scope is bound to the user's authorized cohort or filters; no agent-invented reconfirmation is required, but the selected controller's mandatory action-time boundary still applies.
- The named authenticated controller is authoritative and no concurrent LinkedIn controller is active.
- The operation is not an unrequested recurring schedule, evasive, or challenge-bypassing.
- A write has an independent verification path.

## After

- Transport success was not mistaken for product success.
- The resulting browser/API/provider state was read back.
- Consequential form fields were reread after edits, and account-wide quota was not redundantly polled without a state-change signal.
- No raw secrets appear in output, errors, screenshots, or captures.
- Capture was stopped and sensitive temporary output was not persisted.
- Any provider path not exercised live is labeled unverified.

# Replay checklist

- Keep the captured method and current endpoint exactly; do not reuse old query IDs blindly.
- Remove analytics, tracing, and browser-generated headers unless a controlled replay proves they are required.
- Never copy `Cookie`, `Set-Cookie`, `Authorization`, API keys, CDP URLs, or task secrets into prompts, files, or responses.
- Preserve content type and payload encoding.
- Treat a 2xx response as transport evidence, not user-visible proof.
- For a write, issue one request only and verify with a separate read or browser state.
- Stop and clear capture when complete.

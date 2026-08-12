import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 60_000,
    hookTimeout: 60_000,
    restoreMocks: true,
    clearMocks: true,
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    sequence: { concurrent: false },
  },
});

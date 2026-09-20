import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    globalSetup: ["./tests/global-setup.ts"],
    include: ["tests/contract/**/*.test.ts", "tests/integration/**/*.test.ts"],
    testTimeout: 15000,
    hookTimeout: 30000,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});

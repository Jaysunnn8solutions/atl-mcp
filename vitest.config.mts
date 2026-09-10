import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "pipeline/**/*.test.ts"],
    env: {
      // Let the integration test find the committed data regardless of cwd.
      ATL_DATA_DIR: path.resolve(import.meta.dirname, "data"),
    },
  },
});

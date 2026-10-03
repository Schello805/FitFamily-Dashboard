import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    globalSetup: ["./tests/global-setup.ts"],
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    fileParallelism: false
  }
});

import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@raycast/api": fileURLToPath(new URL("./tests/raycast-api-stub.ts", import.meta.url)) } },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});

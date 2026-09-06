import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/agenda-integration.test.ts", "test/patients-integration.test.ts", "test/pilot-e2e.test.ts"],
  },
});

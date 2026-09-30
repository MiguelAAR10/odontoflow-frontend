import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["test/setup-e2e-auth.ts"],
    include: ["test/agenda-integration.test.ts", "test/patients-integration.test.ts", "test/pilot-e2e.test.ts", "test/service-to-cash-integration.test.ts"],
  },
});

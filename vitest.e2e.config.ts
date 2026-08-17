import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    include: ["test/agenda-integration.test.ts", "test/patients-integration.test.ts", "test/pilot-e2e.test.ts"],
  },
});

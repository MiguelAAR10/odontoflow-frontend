import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
  build: {
    outDir: "dist-web",
  },
  test: {
    exclude: ["node_modules/**", "dist/**", "test/agenda-integration.test.ts"],
  },
});

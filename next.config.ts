import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack(config) {
    // AG-UI uses NodeNext-compatible .js imports for its TypeScript modules.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
  turbopack: {
    // Turbopack has no extensionAlias option. Resolve the AG-UI runtime
    // imports explicitly while preserving their emitted ESM extensions.
    resolveAlias: {
      "./card.js": "./src/agui/card.ts",
      "../card.js": "./src/agui/card.ts",
      "./events.js": "./src/agui/events.ts",
      "../events.js": "./src/agui/events.ts",
      "./reducer.js": "./src/agui/reducer.ts",
      "./match.js": "./src/agui/sim/match.ts",
      "./schema.js": "./src/agui/sim/schema.ts",
      "./sim/source.js": "./src/agui/sim/source.ts",
    },
  },
};

export default nextConfig;

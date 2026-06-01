import type { NextConfig } from "next";

// Validate production env at build time (skipped when AETHER_MOCK_MODE=true)
if (process.env.AETHER_MOCK_MODE !== "true") {
  try {
    const { validateEnv, isMockMode } = require("./lib/env") as typeof import("./lib/env");
    if (!isMockMode) validateEnv();
  } catch (e) {
    if (process.env.NODE_ENV === "production") throw e;
  }
}

const nextConfig: NextConfig = {
  typescript: {
    // Enforce type safety in production builds
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
import type { NextConfig } from "next";

// Fail the build early when production keys are missing (skipped if AETHER_MOCK_MODE=true)
const { validateEnv } = require("./lib/env") as typeof import("./lib/env");
validateEnv();

const nextConfig: NextConfig = {
  typescript: {
    // Enforce type safety in production builds
    ignoreBuildErrors: false,
  },
};

export default nextConfig;
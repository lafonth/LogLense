import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXTAUTH_URL:
      process.env.VERCEL_ENV === "production"
        ? process.env.NEXTAUTH_URL_PROD
        : process.env.NEXTAUTH_URL_DEV,
  },
  outputFileTracingIncludes: {
    "/api/ai-report": ["./src/data/talents/**/*.json"],
  },
  // When the dev-only session stub is enabled, build into a separate .next
  // directory so this server's dev-server lockfile doesn't collide with a
  // normal `pnpm dev` already running in the same working copy.
  ...(process.env.NODE_ENV !== "production" && process.env.ENABLE_DEV_SESSION === "1"
    ? { distDir: ".next-dev-stub" }
    : {}),
};

export default nextConfig;

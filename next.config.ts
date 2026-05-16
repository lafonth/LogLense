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
};

export default nextConfig;

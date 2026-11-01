import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Files read at runtime with fs (policies, test questions, system prompt) must ship with the serverless functions.
  outputFileTracingIncludes: {
    "/**": ["./data/seed/**", "./prompts/**"],
  },
  // The demo database (data/runtime/db.json) is rewritten on every chat turn;
  // don't let the dev file watcher treat that as a code change.
  webpack: (config) => {
    config.watchOptions = { ...config.watchOptions, ignored: ["**/node_modules/**", "**/.git/**", "**/data/**"] };
    return config;
  },
};

export default nextConfig;

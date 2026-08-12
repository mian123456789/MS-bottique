import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: process.cwd(),
  serverExternalPackages: ["sql.js"],
  turbopack: { root: process.cwd() },
};

export default nextConfig;

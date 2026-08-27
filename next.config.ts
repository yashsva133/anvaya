// Suppress DEP0205 and other Node deprecation warnings across all workers
if (typeof process !== "undefined" && process.emitWarning) {
  const originalEmit = process.emitWarning;
  process.emitWarning = function (warning: string | Error, ...args: any[]) {
    if (typeof warning === "string" && warning.includes("DEP0205")) return;
    if (warning && (warning as any).code === "DEP0205") return;
    return (originalEmit as any).apply(process, [warning, ...args]);
  };
}

import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: false,
  images: {
    unoptimized: true,
  },
  experimental: {
    optimizePackageImports: ["lucide-react", "framer-motion", "recharts"],
  },
  webpack: (config) => {
    config.resolve = config.resolve || {};
    config.resolve.modules = [
      path.resolve(__dirname, "node_modules"),
      ...(config.resolve.modules || ["node_modules"]),
    ];
    return config;
  },
};

export default nextConfig;

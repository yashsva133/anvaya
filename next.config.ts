import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @ts-expect-error - Next.js internal type might be missing this
  allowedDevOrigins: ['192.168.29.66'],
};
export default nextConfig;

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: [
    '@wingx-app/api-ml',
    '@wingx-app/api-me',
    '@wingx-app/api-print',
  ],
};

export default nextConfig;

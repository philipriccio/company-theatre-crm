import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Output standalone build for Docker deployment
  output: 'standalone',
  
  // Skip TypeScript errors during build
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // Experimental features
  experimental: {
    // Enable server actions
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;

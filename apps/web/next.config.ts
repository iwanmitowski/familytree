import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @familytree/shared ships as TypeScript source; Next must transpile it.
  transpilePackages: ['@familytree/shared'],
  reactStrictMode: true,
};

export default nextConfig;

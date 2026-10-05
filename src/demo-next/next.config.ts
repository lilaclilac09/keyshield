import type { NextConfig } from 'next';
import path from 'path';

const API = process.env.KEYSHIELD_API_URL || 'http://127.0.0.1:8001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  transpilePackages: [
    '@solana/wallet-adapter-react',
    '@solana/wallet-adapter-react-ui',
    '@solana/wallet-adapter-phantom',
    '@solana/wallet-adapter-solflare',
    '@solana/wallet-adapter-base',
  ],
  async rewrites() {
    return [{ source: '/ks/:path*', destination: `${API}/:path*` }];
  },
  webpack: (config) => {
    config.resolve.fallback = { ...(config.resolve.fallback || {}), fs: false, os: false, path: false };
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      '@solana/wallet-adapter-react': path.resolve(__dirname, 'node_modules/@solana/wallet-adapter-react'),
    };
    return config;
  },
};

export default nextConfig;

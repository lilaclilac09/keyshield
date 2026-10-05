import type { NextConfig } from 'next';

const API = process.env.KEYSHIELD_API_URL || 'http://127.0.0.1:8001';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@solana/wallet-adapter-react',
    '@solana/wallet-adapter-react-ui',
    '@solana/wallet-adapter-wallets',
    '@solana/wallet-adapter-base',
  ],
  async rewrites() {
    return [{ source: '/ks/:path*', destination: `${API}/:path*` }];
  },
  webpack: (config) => {
    config.resolve.fallback = { ...(config.resolve.fallback || {}), fs: false, os: false, path: false };
    return config;
  },
};

export default nextConfig;

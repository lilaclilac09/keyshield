const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Skip static optimization to avoid build-time SSR issues
  experimental: {
    serverComponentsExternalPackages: ['ipfs-utils'],
  },
  webpack: (config, { isServer }) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };
    
    // Direct alias mapping for fetch.node -> fetch.browser
    const ipfsUtilsPath = path.dirname(require.resolve('ipfs-utils/package.json'));
    const browserFetchPath = path.resolve(ipfsUtilsPath, 'dist/src/http/fetch.browser.js');
    
    config.resolve.alias = {
      ...config.resolve.alias,
      // Map fetch.node to fetch.browser for ipfs-utils
      [path.resolve(ipfsUtilsPath, 'src/http/fetch.node')]: browserFetchPath,
      [path.resolve(ipfsUtilsPath, 'dist/src/http/fetch.node')]: browserFetchPath,
    };
    
    return config;
  },
};

module.exports = nextConfig;

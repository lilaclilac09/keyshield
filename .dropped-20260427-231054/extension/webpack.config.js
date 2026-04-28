const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlPlugin = require('html-webpack-plugin');

const isDev = process.env.NODE_ENV !== 'production';

module.exports = {
  mode: isDev ? 'development' : 'production',

  entry: {
    background: './src/background.ts',
    content: './src/content.ts',
    popup: './src/popup/popup.tsx',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },

  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        use: {
          loader: 'ts-loader',
          options: { transpileOnly: true },
        },
        exclude: /node_modules/,
      },
    ],
  },

  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      // WalletConnect modal is not used in extension context — stub it out
      '@walletconnect/modal': path.resolve(__dirname, 'src/stubs/walletconnect-modal.js'),
    },
    fallback: {
      // Node builtins — not available in extension context
      crypto: false,
      stream: false,
      buffer: false,
      path: false,
      fs: false,
      os: false,
      http: false,
      https: false,
      net: false,
      tls: false,
      zlib: false,
    },
  },

  plugins: [
    // Generate popup.html from template
    new HtmlPlugin({
      template: './src/popup/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
    }),

    // Copy static assets
    new CopyPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/icons', to: 'icons', noErrorOnMissing: true },
      ],
    }),
  ],

  // Limit chunk size warnings (Lit Protocol is large)
  performance: {
    maxAssetSize: 4_000_000,
    maxEntrypointSize: 4_000_000,
  },

  devtool: isDev ? 'cheap-module-source-map' : false,

  optimization: {
    minimize: !isDev,
    // Allow dynamic import chunks (for lazy-loading Lit Protocol)
    // Static entry points (background, content, popup) stay self-contained
    splitChunks: {
      chunks: 'async', // only split dynamic imports
      minSize: 50_000,
    },
  },
};

const path = require('path');

module.exports = {
  mode: process.env.NODE_ENV || 'production',
  entry: {
    'background/service-worker': './src/background/service-worker.ts',
    'content/content-script': './src/content/content-script.ts',
    'popup/popup': './src/popup/popup.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      "crypto": false,
      "stream": false,
      "buffer": false,
    },
  },
  optimization: {
    minimize: process.env.NODE_ENV === 'production',
  },
  devtool: process.env.NODE_ENV === 'development' ? 'source-map' : false,
};

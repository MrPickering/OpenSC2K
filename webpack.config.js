const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyPlugin = require('copy-webpack-plugin');
const phaser = path.join(__dirname, '/node_modules/phaser/src/phaser.js');

module.exports = (env, argv) => {
  const isProduction = argv && argv.mode === 'production';

  return {
  mode: isProduction ? 'production' : 'development',
  entry: {
    app: ['@babel/polyfill', path.resolve(__dirname, 'src/index.js')]
  },
  output: {
    pathinfo: !isProduction,
    path: path.resolve(__dirname, 'dist'),
    filename: isProduction ? '[name].[contenthash:8].js' : 'app.js'
  },
  devtool: isProduction ? false : 'source-map',
  devServer: {
    contentBase: path.join(__dirname, './'),
    port: 3000,
    disableHostCheck: true
  },
  optimization: {
    runtimeChunk: false,
    splitChunks: {
      cacheGroups: {
        commons: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendors',
          chunks: 'all',
        },
      }
    }
  },
  plugins: [
    new webpack.DefinePlugin({
      WEBGL_RENDERER: true,
      CANVAS_RENDERER: true,
    }),
    new HtmlWebpackPlugin({
      template: 'src/index.html'
    }),
    new webpack.ProvidePlugin({
      $: 'jquery',
      jQuery: 'jquery'
    }),
    new CopyPlugin([
      { from: 'assets', to: 'assets' }
    ])
  ],
  resolve: {
    alias: {
      'phaser': phaser
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /(node_modules)/,
        use: [{
          loader: 'babel-loader',
          options: {
            cacheDirectory: true
          }
        }],
      },
      {
        test: /\.(css)$/,
        use: [
          'style-loader',
          {
            loader: 'css-loader',
            options: {
              sourceMap: true
            }
          }
        ]
      },
      {
        test: /\.(png|jpg|gif|svg|eot|ttf|woff|woff2)$/,
        loader: 'url-loader',
        options: {
          limit: 10000
        }
      },
      {
        test: /phaser-split\.js$/,
        loader: 'expose-loader',
        options: 'Phaser'
      },
      {
        test: [/\.vert$/, /\.frag$/],
        loader: 'raw-loader'
      }
    ]
  }
  };
};
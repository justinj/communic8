var webpack = require('webpack');

var env = process.env.NODE_ENV;

var config = {
  module: {
    loaders: [{
      test: /\.js$/,
      loader: 'babel-loader'
    }, {
      test: /\.json$/,
      loader: 'json-loader'
    }]
  },
  output: {
    library: "Communic8",
    libraryTarget: "var"
  },
  plugins: []
};

if (env === 'production') {
  config.plugins.push(
    new webpack.optimize.UglifyJsPlugin({
    compressor: {
      pure_getters: true,
      unsafe: true,
      unsafe_comps: true,
      warnings: false
    }
  })
  )
}

module.exports = config;
